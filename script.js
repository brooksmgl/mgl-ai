async function sendMessage() {
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    if (!message) return;

    // Render user's message
    const messagesDiv = document.getElementById('messages');
    const userMsg = document.createElement('div');
    userMsg.textContent = message;
    userMsg.className = 'user-message';
    messagesDiv.appendChild(userMsg);
    input.value = "";

    try {
        const response = await fetch('https://mglapi.netlify.app/.netlify/functions/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: message }]
            })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        const reply = data.choices?.[0]?.message?.content || "No response";

        const botMsg = document.createElement('div');
        botMsg.textContent = reply;
        botMsg.className = 'bot-message';
        messagesDiv.appendChild(botMsg);

    } catch (err) {
        const errorMsg = document.createElement('div');
        errorMsg.textContent = `Error: ${err.message}`;
        errorMsg.className = 'bot-message error';
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
