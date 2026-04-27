require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { getCustomer } = require('./customer-master');
const { getProductName } = require('./sku-master');
const { appendRows } = require('../services/googleSheets');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// CLI: node src/test-full-flow.js <image> <shop_id> <delivery_date>
const imagePath    = process.argv[2] || 'order.jpg';
const shopId       = process.argv[3];
const deliveryArg  = process.argv[4]; // e.g. "2026-04-05"

if (!shopId) {
  console.error('Usage: node src/test-full-flow.js <image> <shop_id> [delivery_date]');
  console.error('Example: node src/test-full-flow.js order.jpg takasei 2026-04-05');
  process.exit(1);
}

/** Format Date → "04/02/2026" (Pacific time) */
function formatOrderDate(date) {
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month:    '2-digit',
    day:      '2-digit',
    year:     'numeric',
  });
}

/** Format Date → "10:15 AM" (Pacific time) */
function formatOrderTime(date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   true,
  });
}

/** Parse & format delivery date argument → "04/05/2026" */
function formatDeliveryDate(dateStr) {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids timezone day-shift
  if (isNaN(d)) throw new Error(`Invalid delivery date: "${dateStr}". Use YYYY-MM-DD format.`);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

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

async function extractOrderItems(imagePath) {
  const imageContent = buildImageContent(imagePath);

  // Pass 1: describe each row literally
  const pass1 = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
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
    }],
    max_tokens: 1000,
  });

  const description = pass1.choices[0].message.content.trim();
  console.log('\n[Pass 1] Row descriptions:\n', description);

  // Pass 2: extract JSON from the description
  const pass2 = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
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
    }],
    max_tokens: 500,
  });

  return JSON.parse(pass2.choices[0].message.content.trim());
}

async function run() {
  // Step 1: Resolve customer
  console.log(`\nStep 1: Looking up shop "${shopId}"...`);
  const customer = getCustomer(shopId);
  console.log(`  → ${customer.display_name}`);

  // Step 2: Parse timestamps
  const now          = new Date();
  const orderDate    = formatOrderDate(now);
  const orderTime    = formatOrderTime(now);
  const deliveryDate = formatDeliveryDate(deliveryArg);
  console.log(`\n  Order Date:    ${orderDate}`);
  console.log(`  Order Time:    ${orderTime}`);
  console.log(`  Delivery Date: ${deliveryDate}`);

  // Step 3: AI OCR
  console.log('\nStep 2: Running AI OCR on image...');
  const items = await extractOrderItems(imagePath);
  console.log(`  → Extracted ${items.length} item(s)`);

  if (items.length === 0) {
    console.log('No items found — nothing to write.');
    return;
  }

  // Step 4: Map SKUs → product names, build sheet rows
  // Columns: Order Date | Order Time | Delivery Date | Shop Name | SKU | Product Name | QTY
  console.log('\nStep 3: Mapping SKUs to product names...');
  const rows = items.map(item => {
    const productName = getProductName(item.sku);
    console.log(`  ${item.sku} → ${productName}  (qty: ${item.qty})`);
    return [orderDate, orderTime, deliveryDate, customer.display_name, item.sku, productName, item.qty];
  });

  // Step 5: Write to Google Sheet
  console.log('\nStep 4: Writing to Google Sheet...');
  await appendRows(rows, 'Sheet1!A:G');

  console.log('\nFull flow complete! Rows written:');
  console.log(JSON.stringify(
    rows.map(r => ({
      order_date:    r[0],
      order_time:    r[1],
      delivery_date: r[2],
      shop:          r[3],
      sku:           r[4],
      product:       r[5],
      qty:           r[6],
    })),
    null, 2
  ));
}

run().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
