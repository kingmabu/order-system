const express = require('express');
const router = express.Router();
const { extractOrderFromImage } = require('../services/openai');
const { appendOrderToSheet } = require('../services/googleSheets');
const { createQuickBooksInvoice } = require('../services/quickbooks');

// POST /webhook/tally
router.post('/tally', async (req, res) => {
  try {
    const payload = req.body;

    // Extract image URL from Tally webhook payload
    const imageUrl = payload?.data?.fields?.find(f => f.type === 'FILE_UPLOAD')?.value?.[0]?.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'No image found in webhook payload' });
    }

    // Step 1: Extract SKU + QTY via GPT-4o
    const orderItems = await extractOrderFromImage(imageUrl);
    console.log('Extracted order items:', orderItems);

    // Step 2: Save to Google Sheets
    await appendOrderToSheet(orderItems);

    // Step 3: Create QuickBooks invoice draft
    await createQuickBooksInvoice(orderItems);

    res.json({ success: true, items: orderItems });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
