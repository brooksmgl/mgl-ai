const fetch = require('node-fetch');

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
        const {
            message: userMessage,
            promptHistory = [],
            lastImageUrl,
            lastImageBase64,
            attachment,
            attachmentName,
            attachmentType
        } = JSON.parse(event.body || '{}');

        if (!OPENAI_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Missing OpenAI credentials" })
            };
        }

        if (!userMessage) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Message is required" })
            };
        }

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
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ error: 'Failed to fetch previous image' })
                    };
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
            return {
                statusCode: imageResp.status,
                headers,
                body: JSON.stringify({ error: "gpt-image-1 generation failed." })
            };
        }

        let imageData;
        try {
            imageData = await imageResp.json();
        } catch (jsonErr) {
            console.error("Failed to parse image JSON:", jsonErr);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Invalid image response from OpenAI." })
            };
        }

        if (imageData?.data?.[0]?.url) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ imageUrl: imageData.data[0].url })
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'No image URL returned' })
        };
    } catch (error) {
        console.error("Error in generate-image function:", error.stack || error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
