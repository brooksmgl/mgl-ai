const { isImageRequest } = require('../image-request');

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
        const OPENAI_KEY = process.env.OPENAI_API_KEY;
        const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
        const {
            message: userMessage,
            threadId,
            promptHistory = [],
            lastImageUrl,
            lastImageBase64,
            attachment,
            attachmentName,
            attachmentType
        } = JSON.parse(event.body || '{}');

        if (!userMessage && !attachment) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Message is required" })
            };
        }


        if (!OPENAI_KEY || !ASSISTANT_ID) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Missing OpenAI credentials" })
            };
        }

        let thread_id = threadId;
        if (!thread_id) {
            const threadResp = await fetch("https://api.openai.com/v1/threads", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                }
            });
            if (!threadResp.ok) {
                const errText = await threadResp.text();
                console.error("Thread creation failed:", errText);
                return {
                    statusCode: threadResp.status,
                    headers,
                    body: JSON.stringify({ error: "Failed to create thread" })
                };
            }
            const threadRes = await threadResp.json();
            console.log("THREAD RESPONSE:", threadRes);
            thread_id = threadRes.id;
        } else {
            console.log("Reusing thread:", thread_id);
        }

        let fileId = null;
        if (attachment) {
            try {
                const buffer = Buffer.from(attachment, 'base64');
                const file = new File([buffer], attachmentName || 'upload', { type: attachmentType || 'application/octet-stream' });
                const formData = new FormData();
                formData.append('file', file);
                formData.append('purpose', 'assistants');
                const uploadResp = await fetch('https://api.openai.com/v1/files', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_KEY}`,
                        'OpenAI-Beta': 'assistants=v2'
                    },
                    body: formData
                });
                if (!uploadResp.ok) {
                    const errText = await uploadResp.text();
                    console.error('File upload failed:', errText);
                    return {
                        statusCode: uploadResp.status,
                        headers,
                        body: JSON.stringify({ error: 'File upload failed' })
                    };
                }
                const uploadRes = await uploadResp.json();
                fileId = uploadRes.id;
            } catch (err) {
                console.error('File upload failed:', err);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: 'File upload failed' })
                };
            }
        }

        const msgPayload = {
            role: "user",
            content: []
        };

        if (userMessage) {
            msgPayload.content.push({ type: "input_text", text: userMessage });
        }

        if (fileId) {
            msgPayload.content.push({ type: "input_image", image: { file_id: fileId } });
        }

        const msgResp = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2"
            },
            body: JSON.stringify(msgPayload)
        });
        if (!msgResp.ok) {
            const errText = await msgResp.text();
            console.error('Failed to post message:', errText);
            return {
                statusCode: msgResp.status,
                headers,
                body: JSON.stringify({ error: 'Failed to post message to thread' })
            };
        }

        const runResp = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "Content-Type": "application/json",
                "OpenAI-Beta": "assistants=v2"
            },
            body: JSON.stringify({ assistant_id: ASSISTANT_ID })
        });
        if (!runResp.ok) {
            const errText = await runResp.text();
            console.error('Failed to start run:', errText);
            return {
                statusCode: runResp.status,
                headers,
                body: JSON.stringify({ error: 'Failed to start run' })
            };
        }
        const runRes = await runResp.json();

        console.log("RUN RESPONSE:", runRes);

        const run_id = runRes.id;

        let status = runRes.status || "queued";
        let attempts = 0;
        const maxAttempts = 30;
        let lastCheck = runRes;

        const progressingStatuses = new Set(["queued", "in_progress"]);
        const errorStatuses = new Set(["failed", "cancelled", "cancelling", "expired"]);

        while (progressingStatuses.has(status) && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const checkResp = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`, {
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                }
            });
            if (!checkResp.ok) {
                const errText = await checkResp.text();
                console.error('Run status check failed:', errText);
                return {
                    statusCode: checkResp.status,
                    headers,
                    body: JSON.stringify({ error: 'Failed to check run status' })
                };
            }
            lastCheck = await checkResp.json();
            status = lastCheck.status;
            attempts++;
        }

        if (status === "requires_action") {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Run requires action and cannot be completed automatically." })
            };
        }

        if (errorStatuses.has(status)) {
            const message = lastCheck?.last_error?.message || `Assistant run ended with status ${status}`;
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: message })
            };
        }

        if (status !== "completed") {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: `Assistant run ended with status ${status}` })
            };
        }

        const messagesResp = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            headers: {
                "Authorization": `Bearer ${OPENAI_KEY}`,
                "OpenAI-Beta": "assistants=v2"
            }
        });
        if (!messagesResp.ok) {
            const errText = await messagesResp.text();
            console.error('Failed to retrieve messages:', errText);
            return {
                statusCode: messagesResp.status,
                headers,
                body: JSON.stringify({ error: 'Failed to retrieve messages' })
            };
        }
        const messagesRes = await messagesResp.json();

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

        // Attempt to find image file in content or any of the response files
        let imagePart = contentArray.find(c => c.type === "image_file") || null;
        if (!imagePart && Array.isArray(lastMsg.files) && lastMsg.files.length > 0) {
            const imageFile = lastMsg.files.find(f => (f?.content_type || "").startsWith("image/"));
            if (imageFile) {
                imagePart = {
                    image_file: {
                        file_id: imageFile.id
                    }
                };
            }
        }

        if (imagePart?.image_file?.file_id) {
            const imageResp = await fetch(`https://api.openai.com/v1/files/${imagePart.image_file.file_id}/content`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${OPENAI_KEY}`,
                    "OpenAI-Beta": "assistants=v2"
                }
            });
            if (!imageResp.ok) {
                const errText = await imageResp.text();
                console.error('Failed to fetch image content:', errText);
                return {
                    statusCode: imageResp.status,
                    headers,
                    body: JSON.stringify({ error: 'Failed to fetch image content' })
                };
            }
            const buffer = await imageResp.buffer();
            const base64Image = Buffer.from(buffer).toString('base64');
            assistantResponse.image = `data:image/png;base64,${base64Image}`;
        }

        let imageUrl = assistantResponse.image;

        // Fallback: if no image from assistant and user message indicates image request, generate an image via gpt-image-1
        if (!imageUrl && isImageRequest(userMessage, promptHistory)) {
            try {
                const editing = promptHistory.length > 0 && /(make|change|remove|replace|update|edit)/i.test(userMessage);
                const combinedHistory = editing ? [...promptHistory, userMessage] : [userMessage];
                const dallePrompt = enhancePrompt(combinedHistory.join('. '));

                const body = {
                    model: "gpt-image-1",
                    prompt: dallePrompt,
                    size: "1024x1024"
                };

                const images = [];
                if (attachment) {
                    images.push({ name: attachmentName || 'upload', data: attachment });
                } else if (lastImageBase64) {
                    images.push({ name: 'previous.png', data: lastImageBase64 });
                } else if (lastImageUrl) {
                    try {
                        const prevResp = await fetch(lastImageUrl);
                        if (!prevResp.ok) {
                            const errText = await prevResp.text();
                            console.error('Failed to fetch previous image:', errText);
                            throw new Error('Failed to fetch previous image');
                        }
                        const arrBuf = await prevResp.arrayBuffer();
                        const b64 = Buffer.from(arrBuf).toString('base64');
                        images.push({ name: 'previous.png', data: b64 });
                    } catch (err) {
                        console.error('Failed to fetch previous image:', err);
                        return {
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({ error: 'Failed to fetch previous image' })
                        };
                    }
                }

                if (images.length > 0) {
                    body.images = images;
                }

                const imageResp = await fetch("https://api.openai.com/v1/images/generations", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${OPENAI_KEY}`,
                    },
                    body: JSON.stringify(body),
                });

                if (!imageResp.ok) {
                    const errText = await imageResp.text();
                    console.error("Image API error response:", errText);
                    throw new Error("gpt-image-1 generation failed.");
                }

                let imageData;
                try {
                    imageData = await imageResp.json();
                } catch (jsonErr) {
                    console.error("Failed to parse image JSON:", jsonErr);
                    throw new Error("Invalid image response from OpenAI.");
                }

                if (imageData?.data?.[0]?.url) {
                    imageUrl = imageData.data[0].url;
                    assistantResponse.image = imageUrl;
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