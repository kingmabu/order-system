require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const input = process.argv[2] || 'order.jpg';

function buildImageContent(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return { type: 'image_url', image_url: { url: input } };
  }
  const filePath = path.resolve(input);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const base64 = fs.readFileSync(filePath).toString('base64');
  return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } };
}

async function testOrderExtraction(input) {
  console.log('Analyzing image:', input);
  const imageContent = buildImageContent(input);

  // --- Pass 1: Describe each row in detail ---
  console.log('\n[Pass 1] Asking GPT-4o to describe each row...');
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
  console.log('\nPass 1 description:\n', description);

  // --- Pass 2: Extract JSON based on the description ---
  console.log('\n[Pass 2] Extracting JSON from the description...');
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
  console.log('\nPass 2 raw JSON:', raw);

  const items = JSON.parse(raw);
  console.log('\nFinal extracted order items:');
  console.log(JSON.stringify(items, null, 2));
  console.log(`\nTotal line items: ${items.length}`);
  return items;
}

testOrderExtraction(input).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
