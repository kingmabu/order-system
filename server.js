const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { google } = require('googleapis');
const QBOAuth = require('./routes/qboAuth');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/auth', QBOAuth);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/scan', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scan.html')));

app.get('/api/customer', async (req, res) => {
  try {
    const { cid } = req.query;
    if (!cid) return res.status(400).json({ error: 'Customer ID is required' });
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.CLIENTS_SHEET_ID,
      range: 'Client list!A:D'
    });
    const rows = result.data.values || [];
    const row = rows.find(r => r[0] && r[0].toString().trim() === cid.toString().trim());
    if (!row) return res.status(404).json({ error: `Customer ID ${cid} not found` });
    res.json({ success: true, customerId: row[0], customerName: row[1] || '', qboSystemId: row[3] || '' });
  } catch (err) {
    console.error('Customer lookup error:', err.message);
    res.status(500).json({ error: 'Customer lookup failed: ' + err.message });
  }
});

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '画像が見つかりません' });
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
            { type: 'text', text: 'この発注書の画像から以下の情報をJSON形式で抽出してください。必ずJSON形式のみで返答し、他のテキストは含めないでください。\n{\n  "customer_name": "顧客名またはRestaurant Name欄の値",\n  "order_date": "注文日(YYYY-MM-DD形式、不明な場合は今日の日付)",\n  "po_number": "発注書番号(あれば、なければ空文字)",\n  "items": [\n    {\n      "sku": "SKU(左端列のアルファベット1文字+数字3桁、例:B002,C006,P021)",\n      "name": "商品名(ITEMS列の値)",\n      "quantity": "数量(QTY列の数値、空欄または未記入の場合は必ず0)",\n      "unit_price": 0\n    }\n  ]\n}' }
          ]
        }]
      },
      { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
    );
    const text = response.data.content[0].text;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('AI解析結果:', JSON.stringify(parsed, null, 2));
    parsed.items = (parsed.items || []).filter(item => Number(item.quantity) > 0);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('AI解析エラー:', err.message);
    res.status(500).json({ error: 'AI解析に失敗しました: ' + err.message });
  }
});

app.post('/api/save-to-sheets', async (req, res) => {
  try {
    const { data, deliveryDate } = req.body;
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const orderDate = new Date().toLocaleDateString('en-US', {timeZone: 'America/Los_Angeles'});
    const rows = data.items.map(item => [orderDate, deliveryDate, data.customer_name, item.sku, item.name, item.quantity, '']);
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:G',
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows }
    });
    res.json({ success: true, rows: rows.length });
  } catch (err) {
    console.error('Sheets書き込みエラー:', err.message);
    res.status(500).json({ error: 'Sheets書き込みに失敗しました: ' + err.message });
  }
});

app.post('/api/create-invoice', async (req, res) => {
  try {
    const { data, deliveryDate, accessToken, realmId } = req.body;
    const baseUrl = process.env.QBO_ENV === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    let customerId = data.qboSystemId || null;
    if (!customerId) {
      const customerQuery = await axios.get(
        `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${data.customer_name}'`)}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
      );
      const customers = customerQuery.data.QueryResponse.Customer;
      if (customers && customers.length > 0) {
        customerId = customers[0].Id;
      } else {
        const newCustomer = await axios.post(
          `${baseUrl}/v3/company/${realmId}/customer`,
          { DisplayName: data.customer_name },
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
        );
        customerId = newCustomer.data.Customer.Id;
      }
    }

    const lines = [];
    for (const item of data.items) {
      if (!item.quantity || Number(item.quantity) <= 0 || !item.sku) continue;
      const itemRes = await axios.get(
        `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Item WHERE Sku = '${item.sku}'`)}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
      );
      const qboItems = itemRes.data.QueryResponse.Item;
      if (!qboItems || qboItems.length === 0) { console.log(`SKU not found: ${item.sku}`); continue; }
      const qboItem = qboItems[0];
      lines.push({
        Amount: Number(item.quantity) * (qboItem.UnitPrice || 0),
        DetailType: 'SalesItemLineDetail',
        Description: `${item.sku} - ${item.name}`,
        SalesItemLineDetail: { ItemRef: { value: qboItem.Id }, Qty: Number(item.quantity), UnitPrice: qboItem.UnitPrice || 0 }
      });
    }

    if (lines.length === 0) return res.status(400).json({ error: 'No matching SKUs found in QuickBooks.' });

    const invoice = await axios.post(
      `${baseUrl}/v3/company/${realmId}/invoice`,
      { CustomerRef: { value: customerId }, ShipDate: deliveryDate, Line: lines },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    const invoiceNumber = invoice.data.Invoice.DocNumber;
    console.log('Invoice created:', invoiceNumber);
    res.json({ success: true, invoiceId: invoice.data.Invoice.Id, invoiceNumber });
  } catch (err) {
    console.error('QBO error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Invoice creation failed: ' + JSON.stringify(err.response?.data || err.message) });
  }
});
// ── Clients List全顧客を取得 ──────────────────────────────
app.get('/api/customers', async (req, res) => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.CLIENTS_SHEET_ID,
      range: 'Client list!A:B'
    });
    const rows = result.data.values || [];
    const customers = rows
      .filter(r => r[0] && r[1] && r[0] !== 'Customer ID')
      .map(r => ({ id: r[0].toString().trim(), name: r[1].toString().trim() }));
    res.json({ success: true, customers });
  } catch (err) {
    console.error('Customers error:', err.message);
    res.status(500).json({ error: 'Failed to load customers: ' + err.message });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
