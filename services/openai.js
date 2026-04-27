const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Sends an order sheet image to GPT-4o and returns extracted line items.
 * @param {string} imageUrl - Publicly accessible URL of the order sheet image
 * @returns {Promise<Array<{sku: string, qty: number}>>}
 */
async function extractOrderFromImage(imageUrl) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are a meat order processing assistant.
Analyze this order sheet image and extract every line item.
Return ONLY a JSON array with objects containing "sku" (string) and "qty" (number).
Example: [{"sku":"B018","qty":5},{"sku":"P002","qty":3}]
Do not include any explanation or markdown — raw JSON only.`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
    max_tokens: 1000,
  });

  const raw = response.choices[0].message.content.trim();
  return JSON.parse(raw);
}

module.exports = { extractOrderFromImage };
