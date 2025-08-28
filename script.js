let imagePromptHistory = [];
let lastThreadId = null;
let lastImageUrl = "";
let lastImageBase64 = "";

function getOrCreateThreadId() {
    let threadId = sessionStorage.getItem('mgl_thread_id');
    if (!threadId) {
        // will let backend create it and return one
        threadId = null;
    }
    return threadId;
}

function storeThreadId(id) {
    sessionStorage.setItem('mgl_thread_id', id);
}


function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result.split(',')[1];
            resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function readBlobAsBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result.split(',')[1];
            resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function resetFileInput() {
    const fileInput = document.getElementById('file-input');
    const fileIndicator = document.getElementById('file-indicator');
    const filePreview = document.getElementById('file-preview');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const previewContainer = document.getElementById('file-preview-container');

    if (fileInput) fileInput.value = '';
    if (fileIndicator) fileIndicator.textContent = '';
    if (filePreview) {
        if (filePreview.src) URL.revokeObjectURL(filePreview.src);
        filePreview.src = '';
        filePreview.style.display = 'none';
    }
    if (removeFileBtn) removeFileBtn.style.display = 'none';
    if (previewContainer) previewContainer.style.display = 'none';
}

async function sendMessage() {
    const input = document.getElementById('user-input');
    const fileInput = document.getElementById('file-input');
    const message = input.value.trim();
    const file = fileInput.files[0];
    if (!message && !file) return;

    const messagesDiv = document.getElementById('messages');

    if (file) {
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.alt = file.name;
            img.style.maxWidth = '300px';
            img.className = 'message user';
            messagesDiv.appendChild(img);
        } else {
            const fileMsg = document.createElement('div');
            fileMsg.textContent = `📎 ${file.name}`;
            fileMsg.className = 'message user';
            messagesDiv.appendChild(fileMsg);
        }
    }

    if (message) {
        const userMsg = document.createElement('div');
        userMsg.textContent = message;
        userMsg.className = 'message user';
        messagesDiv.appendChild(userMsg);
    }

    input.value = "";

    // Show loading animation
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message bot loading';
    loadingMsg.innerHTML = '<div class="spinner"></div>';
    messagesDiv.appendChild(loadingMsg);

    try {
        let attachment = null;
        let attachmentName = null;
        let attachmentType = null;
        if (file) {
            attachment = await readFileAsBase64(file);
            attachmentName = file.name;
            attachmentType = file.type;
        }

        const payload = {
            message,
            threadId: getOrCreateThreadId(),
            promptHistory: imagePromptHistory,
            lastImageUrl,
            lastImageBase64
        };

        if (attachment) {
            payload.attachment = attachment;
            payload.attachmentName = attachmentName;
            payload.attachmentType = attachmentType;
        }

        const response = await fetch('/.netlify/functions/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        if (!response.ok) {
            console.error('Assistant function error:', text);
            throw new Error(text || `HTTP ${response.status}`);
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.warn('Non-JSON response:', text);
            data = { error: text };
        }

        if (data.error) {
            throw new Error(data.error);
        }

        lastThreadId = data.threadId;
        storeThreadId(data.threadId);

        if (data.text) {
            const botMsg = document.createElement('div');
            botMsg.textContent = data.text;
            botMsg.className = 'message bot';
            messagesDiv.appendChild(botMsg);
        }

        let imageUrlToUse = data.imageUrl;

        if (!imageUrlToUse && data.generateImage) {
            const imgPayload = {
                message,
                promptHistory: imagePromptHistory,
                lastImageUrl,
                lastImageBase64,
            };

            if (attachment) {
                imgPayload.attachment = attachment;
                imgPayload.attachmentName = attachmentName;
                imgPayload.attachmentType = attachmentType;
            }

            const imgResponse = await fetch('/.netlify/functions/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(imgPayload)
            });

            const imgText = await imgResponse.text();
            if (!imgResponse.ok) {
                console.error('generate-image function error:', imgText);
                throw new Error(imgText || `HTTP ${imgResponse.status}`);
            }

            let imgData;
            try {
                imgData = JSON.parse(imgText);
            } catch {
                console.warn('Non-JSON image response:', imgText);
                imgData = { error: imgText };
            }

            if (imgData.error) {
                throw new Error(imgData.error);
            }

            imageUrlToUse = imgData.imageUrl;
        }

        if (imageUrlToUse) {
            console.log("🔍 imageUrl received:", imageUrlToUse);
            const image = document.createElement('img');
            image.src = imageUrlToUse;
            image.alt = message;
            image.style.maxWidth = '300px';
            image.className = 'message bot';
            image.onerror = () => {
                console.error("🚨 Image failed to load:", imageUrlToUse);
            };
            messagesDiv.appendChild(image);
            lastImageUrl = imageUrlToUse;
            try {
                const imgRes = await fetch(imageUrlToUse);
                if (!imgRes.ok) {
                    throw new Error(`Image fetch failed: ${imgRes.status}`);
                }
                const imgBlob = await imgRes.blob();
                lastImageBase64 = await readBlobAsBase64(imgBlob);
            } catch (err) {
                console.error("Failed to convert image to base64:", err);
                lastImageBase64 = "";
            }

            const { isDirect, isEdit } = detectImageRequest(message, imagePromptHistory);
            if (isDirect) {
                imagePromptHistory = [message];
            } else if (isEdit || imagePromptHistory.length > 0) {
                imagePromptHistory.push(message);
            }
        }
    } catch (err) {
        const errorMsg = document.createElement('div');
        errorMsg.textContent = `Error: ${err.message}`;
        errorMsg.className = 'message bot';
        messagesDiv.appendChild(errorMsg);
        console.error(err);
    } finally {
        loadingMsg.remove();
        resetFileInput();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Ensure a fresh session on each page load
    sessionStorage.removeItem('mgl_thread_id');

    const input = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");

    const fileInput = document.getElementById("file-input");
    const fileIndicator = document.getElementById('file-indicator');
    const filePreview = document.getElementById('file-preview');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const previewContainer = document.getElementById('file-preview-container');

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener("click", sendMessage);

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fileIndicator.textContent = `${fileInput.files.length} file selected`;
            if (file && file.type.startsWith('image/')) {
                filePreview.src = URL.createObjectURL(file);
                filePreview.style.display = 'block';
                previewContainer.style.display = 'block';
            } else {
                filePreview.src = '';
                filePreview.style.display = 'none';
                previewContainer.style.display = 'none';
            }
            removeFileBtn.style.display = 'block';
        } else {
            resetFileInput();
        }
    });

    removeFileBtn.addEventListener('click', resetFileInput);
});
