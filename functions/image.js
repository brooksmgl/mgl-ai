
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { prompt } = JSON.parse(event.body);
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      n: 1,
      size: '1024x1024'
    })
  });

  const data = await response.json();
  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };
};
