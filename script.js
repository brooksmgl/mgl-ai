let lastPromptWasImage = false;
let lastImagePrompt = "";
let lastThreadId = null;

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

    try {
        let response;
        let isImageRequest = message.toLowerCase().includes("generate an image") ||
                             message.toLowerCase().includes("create an image") ||
                             lastPromptWasImage;

        const endpoint = isImageRequest ? '/.netlify/functions/image-assistant' : '/.netlify/functions/chat-assistant';

        response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, threadId: lastThreadId })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        lastThreadId = data.threadId;

        if (isImageRequest) {
            const image = document.createElement('img');
            image.src = data.imageUrl;
            image.alt = message;
            image.style.maxWidth = '300px';
            image.className = 'message bot';
            messagesDiv.appendChild(image);
            lastPromptWasImage = true;
            lastImagePrompt = lastPromptWasImage ? `${lastImagePrompt} ${message}` : message;
        } else {
            const reply = data.reply || "No response";
            const botMsg = document.createElement('div');
            botMsg.textContent = reply;
            botMsg.className = 'message bot';
            messagesDiv.appendChild(botMsg);
            lastPromptWasImage = false;
        }
    } catch (err) {
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
