const fetch = require("node-fetch");

exports.handler = async (event) => {
  const fileId = event.queryStringParameters?.fileId;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (!fileId || !OPENAI_KEY) {
    return {
      statusCode: 400,
      body: "Missing file ID or API key",
    };
  }

  try {
    const imageRes = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      },
    });

    const contentType = imageRes.headers.get("content-type");
    const buffer = await imageRes.arrayBuffer();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
      body: Buffer.from(buffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("Image proxy error:", err);
    return {
      statusCode: 500,
      body: "Failed to fetch image",
    };
  }
};