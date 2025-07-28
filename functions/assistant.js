const fetch = require('node-fetch');

function isImageRequest(prompt) {
    return /draw|illustrate|image|picture|generate.*image|create.*image/i.test(prompt);
}

function enhancePrompt(prompt) {
    return `In a cute, cartoon, craft-friendly style: ${prompt}`;
}

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
        const { message: userMessage, threadId } = JSON.parse(event.body || '{}');

        if (!userMessage) {
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
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                }
            }).then(res => res.json());

        console.log("THREAD RESPONSE:", threadRes);

        const thread_id = threadRes.id;

        await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2"
            },
            body: JSON.stringify({
                role: "user",
                content: userMessage
            })
        });

        const runRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2"
            },
            body: JSON.stringify({ assistant_id: ASSISTANT_ID })
        }).then(res => res.json());

        console.log("RUN RESPONSE:", runRes);

        const run_id = runRes.id;

        let status = "in_progress";
        let attempts = 0;
        const maxAttempts = 30;

        while ((status === "in_progress" || status === "queued") && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const checkRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`, {
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                }
            });
            const check = await checkRes.json();
            status = check.status;
            attempts++;
        }

        if (status !== "completed") {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Assistant run did not complete in time." })
            };
        }

        const messagesRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "OpenAI-Beta": "assistants=v2"
            }
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

        const textPart = contentArray.find(c => c.type === "text") || null;
        const cleanedText = textPart?.text?.value || null;

        // Determine if assistant response includes image info
        const assistantResponse = {
            text: cleanedText,
            image: null
        };

        // Attempt to find image file in content or files
        let imagePart = contentArray.find(c => c.type === "image_file") || null;
        if (!imagePart && Array.isArray(lastMsg.files) && lastMsg.files.length > 0) {
            imagePart = {
                image_file: {
                    file_id: lastMsg.files[0].id
                }
            };
        }

        if (imagePart?.image_file?.file_id) {
            const imageRes = await fetch(`https://api.openai.com/v1/files/${imagePart.image_file.file_id}/content`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                }
            });
            const buffer = await imageRes.buffer();
            const base64Image = Buffer.from(buffer).toString('base64');
            assistantResponse.image = `data:image/png;base64,${base64Image}`;
        }

        let imageUrl = assistantResponse.image;

        // Fallback: if no image from assistant and user message indicates image request, generate image via DALL·E 3
        if (!imageUrl && isImageRequest(userMessage)) {
            try {
                const imageRes = await fetch("https://api.openai.com/v1/images/generations", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${OPENAI_KEY}`,
                    },
                    body: JSON.stringify({
                        model: "dall-e-3",
                        prompt: enhancePrompt(userMessage),
                        n: 1,
                        size: "1024x1024",
                    }),
                });

                const imageData = await imageRes.json();
                if (imageData?.data?.[0]?.url) {
                    imageUrl = imageData.data[0].url;
                }
            } catch (error) {
                console.error("Image generation failed:", error);
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                text: assistantResponse.text || "Here's your image!",
                imageUrl,
                threadId: thread_id
            })
        };
    } catch (error) {
        console.error("Error in assistant function:", error.stack || error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};