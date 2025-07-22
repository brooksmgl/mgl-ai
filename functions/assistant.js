const fetch = require('node-fetch');

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method not allowed" })
        };
    }

    try {
        const { message, threadId } = JSON.parse(event.body || '{}');

        if (!message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Message is required" })
            };
        }

        const OPENAI_KEY = process.env.OPENAI_API_KEY;
        const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

        if (!OPENAI_KEY || !ASSISTANT_ID) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Missing OpenAI credentials" })
            };
        }

        const threadRes = threadId
            ? { id: threadId }
            : await fetch("https://api.openai.com/v1/threads", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "Content-Type": "application/json"
                }
            }).then(res => res.json());

        console.log("THREAD RESPONSE:", threadRes);

        const thread_id = threadRes.id;

        await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                role: "user",
                content: message
            })
        });

        const runRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ assistant_id: ASSISTANT_ID })
        }).then(res => res.json());

        console.log("RUN RESPONSE:", runRes);

        const run_id = runRes.id;

        let status = "in_progress";
        while (status === "in_progress" || status === "queued") {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const check = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`, {
                headers: { "Authorization": `Bearer ${OPENAI_KEY}` }
            }).then(res => res.json());
            status = check.status;
        }

        const messagesRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            headers: { "Authorization": `Bearer ${OPENAI_KEY}` }
        }).then(res => res.json());

        console.log("MESSAGES RESPONSE:", JSON.stringify(messagesRes, null, 2));

        const sortedMessages = Array.isArray(messagesRes.data)
            ? messagesRes.data
                .filter(msg => msg.role === "assistant" && Array.isArray(msg.content) && msg.content.length > 0)
                .sort((a, b) => b.created_at - a.created_at)
            : [];

        const lastMsg = sortedMessages.length > 0 ? sortedMessages[0] : null;

        if (!lastMsg) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "No assistant response found" })
            };
        }

        const contentArray = Array.isArray(lastMsg?.content) ? lastMsg.content : [];

        const imagePart = contentArray.find(c => c.type === "image_file") || null;
        const textPart = contentArray.find(c => c.type === "text") || null;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                imageUrl: imagePart?.image_file?.url || null,
                text: textPart?.text?.value || null,
                threadId: thread_id
            })
        };
    } catch (error) {
        console.error("Error in assistant function:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};