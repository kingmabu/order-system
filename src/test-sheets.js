require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { appendOrderToSheet } = require('../services/googleSheets');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const input = process.argv[2] || 'order.jpg';

function buildImageContent(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return { type: 'image_url', image_url: { url: input } };
  }
  const filePath = path.resolve(input);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const base64 = fs.readFileSync(filePath).toString('base64');
  return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } };
}

async function extractOrderItems(input) {
  const imageContent = buildImageContent(input);

  // Pass 1: describe each row
  const pass1 = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are examining a meat order sheet image.
For every row in the sheet, describe what you see in the SKU column and the QTY column.
Be very literal — describe exactly what is visually present:
- Is the QTY cell blank/empty?
- Does it contain a pre-printed mark (e.g. a dash, dot, or line)?
- Does it contain a clearly hand-written number?
- Is there a smudge, shadow, or reflection that could be mistaken for a number?

Format your response as a plain text list, one row per line:
SKU: <value> | QTY cell: <describe exactly what you see>`,
          },
          imageContent,
        ],
      },
    ],
    max_tokens: 1000,
  });

  const description = pass1.choices[0].message.content.trim();
  console.log('\n[Pass 1] Row descriptions:\n', description);

  // Pass 2: extract JSON from description
  const pass2 = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `Based on this row-by-row description of an order sheet:

${description}

Extract only the items that have a CLEARLY hand-written number in the QTY column.
Rules:
- Skip any row where the QTY is blank, empty, pre-printed only, a smudge, or uncertain.
- Only include rows with unambiguous, hand-written QTY values.

Return ONLY a JSON array with objects containing "sku" (string) and "qty" (number).
Example: [{"sku":"B018","qty":5},{"sku":"P002","qty":3}]
Raw JSON only — no explanation, no markdown.`,
      },
    ],
    max_tokens: 500,
  });

  const raw = pass2.choices[0].message.content.trim();
  return JSON.parse(raw);
}

async function run() {
  console.log('Step 1: Extracting order items from image...');
  const items = await extractOrderItems(input);

  console.log('\n[Pass 2] Extracted items:');
  console.log(JSON.stringify(items, null, 2));

  if (items.length === 0) {
    console.log('\nNo items extracted — nothing to append.');
    return;
  }

  console.log('\nStep 2: Appending to Google Sheets...');
  await appendOrderToSheet(items);
  console.log('Done! Check your Google Sheet.');
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
