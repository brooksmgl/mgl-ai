let imagePromptHistory = [];
let lastThreadId = null;
let lastImageUrl = "";

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

function isImagePrompt(msg) {
    const imageKeywords = ["draw", "sketch", "illustrate", "render", "create an image", "generate an image", "show me", "picture of", "image of"];
    return imageKeywords.some(kw => msg.toLowerCase().includes(kw));
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
            lastImageUrl
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
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            console.warn('Non-JSON response:', text);
            data = { error: text };
        }

        if (!response.ok || data.error) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        lastThreadId = data.threadId;
        storeThreadId(data.threadId);

        if (data.text) {
            const botMsg = document.createElement('div');
            botMsg.textContent = data.text;
            botMsg.className = 'message bot';
            messagesDiv.appendChild(botMsg);
        }

        if (data.imageUrl) {
            console.log("🔍 imageUrl received:", data.imageUrl);
            const image = document.createElement('img');
            image.src = data.imageUrl;
            image.alt = message;
            image.style.maxWidth = '300px';
            image.className = 'message bot';
            image.onerror = () => {
                console.error("🚨 Image failed to load:", data.imageUrl);
            };
            messagesDiv.appendChild(image);
            lastImageUrl = data.imageUrl;
        }

        if (data.imageUrl) {
            if (isImagePrompt(message)) {
                imagePromptHistory = [message];
            } else if (imagePromptHistory.length > 0) {
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
