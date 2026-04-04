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

// QBO OAuth routes
app.use('/auth', QBOAuth);

// ── Health check ──────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── 顧客向けスキャン画面 ──────────────────────────────────
app.get('/scan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scan.html'));
});

// ── 発注書画像をAIで解析 ──────────────────────────────────
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '画像が見つかりません' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Claude Vision APIで発注書を解析
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: base64Image }
              },
              {
                type: 'text',
                text: `この発注書の画像から以下の情報をJSON形式で抽出してください。
必ずJSON形式のみで返答し、他のテキストは含めないでください。

{
  "customer_name": "顧客名またはRestaurant Name",
  "order_date": "注文日(YYYY-MM-DD形式、不明な場合は今日の日付)",
  "po_number": "発注書番号(あれば、なければ空文字)",
  "items": [
    {
      "sku": "SKU(左端のアルファベット1文字+数字3桁、例:B002)",
      "name": "商品名",
      "quantity": 数量(数値、空欄または未記入の場合は0),
      "unit_price": 0
    }
  ]
}`
              }
            ]
          }
        ]
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    const text = response.data.content[0].text;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
console.log('AI解析結果:', JSON.stringify(parsed, null, 2));
res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('AI解析エラー:', err.message);
    res.status(500).json({ error: 'AI解析に失敗しました: ' + err.message });
  }
});

// ── Google Sheetsに書き込み ───────────────────────────────
app.post('/api/save-to-sheets', async (req, res) => {
  try {
    const { data } = req.body;

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const total = data.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const now = new Date().toLocaleDateString('ja-JP');

    // 各明細行をシートに追加
    const rows = data.items.map(item => [
      now,
      data.customer_name,
      data.po_number || '',
      item.name,
      item.quantity,
      item.unit_price,
      item.quantity * item.unit_price,
      total,
      '処理済み'
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:I',
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows }
    });

    res.json({ success: true, rows: rows.length });
  } catch (err) {
    console.error('Sheets書き込みエラー:', err.message);
    res.status(500).json({ error: 'Sheets書き込みに失敗しました: ' + err.message });
  }
});

// ── QBOにインボイスを作成 ─────────────────────────────────
app.post('/api/create-invoice', async (req, res) => {
  try {
    const { data, accessToken, realmId } = req.body;

    const baseUrl = process.env.QBO_ENV === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    // まず顧客を検索または作成
    const customerQuery = await axios.get(
      `${baseUrl}/v3/company/${realmId}/query?query=SELECT * FROM Customer WHERE DisplayName = '${data.customer_name}'`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );

    let customerId;
    const customers = customerQuery.data.QueryResponse.Customer;

    if (customers && customers.length > 0) {
      customerId = customers[0].Id;
    } else {
      // 顧客が存在しなければ新規作成
      const newCustomer = await axios.post(
        `${baseUrl}/v3/company/${realmId}/customer`,
        { DisplayName: data.customer_name },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          }
        }
      );
      customerId = newCustomer.data.Customer.Id;
    }

    // インボイスを作成
    const invoiceBody = {
      CustomerRef: { value: customerId },
      Line: data.items.map(item => ({
        Amount: item.quantity * item.unit_price,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '1', name: 'Services' },
          Qty: item.quantity,
          UnitPrice: item.unit_price
        },
        Description: item.name
      }))
    };

    const invoice = await axios.post(
      `${baseUrl}/v3/company/${realmId}/invoice`,
      invoiceBody,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    res.json({
      success: true,
      invoiceId: invoice.data.Invoice.Id,
      invoiceNumber: invoice.data.Invoice.DocNumber
    });
  } catch (err) {
    console.error('QBOインボイス作成エラー:', err.response?.data || err.message);
    res.status(500).json({ error: 'インボイス作成に失敗しました: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`サーバー起動: ポート ${PORT}`));
