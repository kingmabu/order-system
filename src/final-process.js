/**
 * Final end-to-end order processing script.
 *
 * Step A: AI OCR  — extract SKU + QTY from the order image
 * Step B: Google Sheets — append order rows
 * Step C: QuickBooks Online — create an Invoice Draft
 *
 * Usage: node src/final-process.js <image> <shop_id> <delivery_date>
 * Example: node src/final-process.js order.jpg takasei 2026-04-15
 */

require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const { getCustomer } = require('./customer-master');
const { getProductName } = require('./sku-master');
const { appendRows } = require('../services/googleSheets');
const { findItemBySku, createInvoice } = require('../services/quickbooks');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── CLI args ────────────────────────────────────────────────────────────────

const imagePath   = process.argv[2] || 'order.jpg';
const shopId      = process.argv[3];
const deliveryArg = process.argv[4]; // YYYY-MM-DD

if (!shopId || !deliveryArg) {
  console.error('Usage: node src/final-process.js <image> <shop_id> <delivery_date>');
  console.error('Example: node src/final-process.js order.jpg takasei 2026-04-15');
  process.exit(1);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatOrderDate(date) {
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: '2-digit', day: '2-digit', year: 'numeric',
  });
}

function formatOrderTime(date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/** Returns { display: "04/15/2026", iso: "2026-04-15" } */
function parseDeliveryDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) throw new Error(`Invalid delivery date: "${dateStr}". Use YYYY-MM-DD.`);
  const display = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  return { display, iso: dateStr };
}

// ─── Step A: AI OCR ──────────────────────────────────────────────────────────

function buildImageContent(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return { type: 'image_url', image_url: { url: input } };
  }
  const filePath = path.resolve(input);
  if (!fs.existsSync(filePath)) throw new Error(`Image not found: ${filePath}`);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const base64 = fs.readFileSync(filePath).toString('base64');
  return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } };
}

async function extractOrderItems(imgPath) {
  const imageContent = buildImageContent(imgPath);

  // Pass 1: literal row-by-row description
  const pass1 = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'This is a business order sheet for meat products. Please list each row SKU and the hand-written number in the QTY column. Format: SKU: <value> | QTY: <number>'
        },
        imageContent,
      ],
    }],
    max_tokens: 1000,
  });

  const description = pass1.choices[0].message.content.trim();
  console.log('\n  [Pass 1] Row descriptions:\n');
  description.split('\n').forEach(l => console.log('   ', l));

  // Pass 2: extract JSON
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const now          = new Date();
  const orderDate    = formatOrderDate(now);
  const orderTime    = formatOrderTime(now);
  const delivery     = parseDeliveryDate(deliveryArg);
  const customer     = getCustomer(shopId);

  console.log('='.repeat(60));
  console.log('Final Order Processing');
  console.log('='.repeat(60));
  console.log(`  Shop:          ${customer.display_name}`);
  console.log(`  Order Date:    ${orderDate}  ${orderTime}`);
  console.log(`  Delivery Date: ${delivery.display}`);
  console.log(`  Image:         ${imagePath}`);

  // ── Step A: OCR ────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('Step A: AI OCR');
  console.log('─'.repeat(60));
  const items = await extractOrderItems(imagePath);
  console.log(`\n  → Extracted ${items.length} item(s)`);

  if (items.length === 0) {
    console.log('  No items found — nothing to process.');
    return;
  }

  // Map SKU → product name
  const enrichedItems = items.map(item => ({
    ...item,
    productName: getProductName(item.sku),
  }));

  enrichedItems.forEach(item => {
    console.log(`     ${item.sku}  →  ${item.productName}  (qty: ${item.qty})`);
  });

  // ── Step B: Google Sheets ──────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('Step B: Google Sheets');
  console.log('─'.repeat(60));

  // Columns: Order Date | Order Time | Delivery Date | Shop Name | SKU | Product Name | QTY
  const sheetRows = enrichedItems.map(item => [
    orderDate,
    orderTime,
    delivery.display,
    customer.display_name,
    item.sku,
    item.productName,
    item.qty,
  ]);

  await appendRows(sheetRows, 'Sheet1!A:G');

  // ── Step C: QuickBooks Invoice ─────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('Step C: QuickBooks Online — Create Invoice');
  console.log('─'.repeat(60));

  // Use QBO Customer ID directly from customer master (no API lookup needed)
  console.log(`\n  QBO Customer: "${customer.display_name}" (Id=${customer.qbo_id})`);
  const qboCustomer = { Id: customer.qbo_id, DisplayName: customer.display_name };

  // Look up QBO Items by SKU
  console.log('\n  Looking up QBO Items...');
  const lines = [];
  for (const item of enrichedItems) {
    const qboItem = await findItemBySku(item.sku);
    console.log(`     ${item.sku} → QBO Item Id=${qboItem.Id}  Name="${qboItem.Name}"  qty=${item.qty}`);
    lines.push({
      itemId:      qboItem.Id,
      itemName:    qboItem.Name,
      sku:         item.sku,
      qty:         item.qty,
      description: item.productName,
    });
  }

  // Build a doc number: e.g. "TAKASEI-20260415"
  const docNumber = `${shopId.toUpperCase()}-${deliveryArg.replace(/-/g, '')}`;

  console.log(`\n  Creating invoice (DocNumber: ${docNumber})...`);
  const invoice = await createInvoice({
    customerId:   qboCustomer.Id,
    customerName: qboCustomer.DisplayName,
    deliveryDate: delivery.iso,
    docNumber,
    lines,
  });

  console.log(`  → Invoice created! Id=${invoice.Id}  DocNumber=${invoice.DocNumber}  TxnDate=${invoice.TxnDate}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('All steps complete!');
  console.log('='.repeat(60));
  console.log(JSON.stringify({
    shop:          customer.display_name,
    order_date:    orderDate,
    order_time:    orderTime,
    delivery_date: delivery.display,
    items: enrichedItems.map(i => ({ sku: i.sku, product: i.productName, qty: i.qty })),
    google_sheet:  'written',
    qbo_invoice:   { id: invoice.Id, doc_number: invoice.DocNumber, txn_date: invoice.TxnDate },
  }, null, 2));
}

run().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
