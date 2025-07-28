let lastPromptWasImage = false;
let lastImagePrompt = "";
let lastThreadId = null;

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

async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    if (!message) return;

    const messagesDiv = document.getElementById('messages');
    const userMsg = document.createElement('div');
    userMsg.textContent = message;
    userMsg.className = 'message user';
    messagesDiv.appendChild(userMsg);
    input.value = "";

    // Show loading animation
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message bot loading';
    loadingMsg.innerHTML = '<div class="spinner"></div>';
    messagesDiv.appendChild(loadingMsg);

    try {
        const response = await fetch('/.netlify/functions/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, threadId: getOrCreateThreadId() })
        });

        const data = await response.json();

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
        }

        loadingMsg.remove();
    } catch (err) {
        loadingMsg.remove();
        const errorMsg = document.createElement('div');
        errorMsg.textContent = `Error: ${err.message}`;
        errorMsg.className = 'message bot';
        messagesDiv.appendChild(errorMsg);
        console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("user-input");
    const sendBtn = document.getElementById("send-btn");

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener("click", sendMessage);
});

const resetBtn = document.getElementById("reset-btn");
if (resetBtn) {
    resetBtn.addEventListener("click", () => {
        localStorage.removeItem("mgl_thread_id");
        lastThreadId = null;

        const messagesDiv = document.getElementById("messages");
        messagesDiv.innerHTML = "";

        const resetMsg = document.createElement("div");
        resetMsg.textContent = "Thread reset.";
        resetMsg.className = "message bot";
        messagesDiv.appendChild(resetMsg);
    });
}
