const fetch = require('node-fetch');

const enhancePrompt = (raw) => {
    const lower = raw.toLowerCase();
    const isRealistic = /(photo|photorealistic|realistic|lifelike)/.test(lower);
    return isRealistic
        ? `A high-resolution, photorealistic image of: ${raw.trim()}. Studio lighting, natural texture, sharp detail.`
        : `A simple, clean, high-quality illustration of: ${raw.trim()}. Cartoon style, bold lines, pastel or primary colors, clear shape definition.`;
};

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
                content: message
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

        let imagePart = contentArray.find(c => c.type === "image_file") || null;
        if (!imagePart && Array.isArray(lastMsg.files) && lastMsg.files.length > 0) {
            imagePart = {
                image_file: {
                    file_id: lastMsg.files[0].id
                }
            };
        }
        const textPart = contentArray.find(c => c.type === "text") || null;

        let imageUrl = null;
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
            imageUrl = `data:image/png;base64,${base64Image}`;
        }

        let cleanedText = textPart?.text?.value || null;
        if (!imageUrl && cleanedText) {
            cleanedText = cleanedText.replace(/!\[.*?\]\(sandbox:.*?\)/g, '').trim();
        }

        // If no imageUrl and cleanedText mentions a sandbox image, try direct image generation
        if (
            !imageUrl &&
            cleanedText &&
            /sandbox:.*?\.(png|jpg|jpeg)/i.test(cleanedText)
        ) {
            const imageGenRes = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    prompt: enhancePrompt(message),
                    model: "dall-e-3",
                    n: 1,
                    size: "1024x1024"
                })
            }).then(res => res.json());

            const imageGenUrl = imageGenRes?.data?.[0]?.url || null;

            if (imageGenUrl) {
                const imgRes = await fetch(imageGenUrl);
                const imgBuffer = await imgRes.buffer();
                const imgBase64 = Buffer.from(imgBuffer).toString('base64');
                imageUrl = `data:image/png;base64,${imgBase64}`;
            }
        }
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                imageUrl,
                text: cleanedText,
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