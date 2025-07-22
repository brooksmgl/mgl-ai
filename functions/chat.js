const fetch = require('node-fetch');

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    // Handle preflight
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method not allowed" })
        };
    }

    try {
        const { messages } = JSON.parse(event.body || '{}');

        if (!messages || !Array.isArray(messages)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Messages array is required" })
            };
        }

        const OPENAI_KEY = process.env.OPENAI_API_KEY;

        if (!OPENAI_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "API key not configured" })
            };
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: errorData.error?.message || 'OpenAI API error' 
                })
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
