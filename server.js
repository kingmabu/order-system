const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { google } = require('googleapis');
const QBOAuth = require('./routes/qboAuth');
const { getValidToken } = QBOAuth;
const { loadAllDataSources, normalizeId } = require('./routes/sheets-client'); // ← 変更
const { determinePricesForOrder } = require('./routes/pricing'); // ← 変更
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ← 変更: QBOインボイス明細を Packing list と同じ並び（Box→Piece→Weight）にするための
//   単位タイプ→ランク関数。Packing list 側（Code.gs updatePackingList の rankUnit）と完全一致させること。
//   Box=0（先頭） / Piece・Bag・Can=1（次） / それ以外(Weight・量り売り・空欄)=2（最後）。
function rankUnit(unitType) {
  const t = (unitType || '').toString().toLowerCase();
  if (t === 'box') return 0;
  if (t === 'piece' || t === 'bag' || t === 'can') return 1;
  return 2;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PWA: cid付きでmanifestを要求されたら、start_urlに顧客番号を引き継いで返す
app.get('/manifest.json', async (req, res) => { // ← 変更: 店舗名取得のためasync化
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'manifest.json'), 'utf8'));
  manifest.start_url = req.query.cid ? '/scan?cid=' + encodeURIComponent(req.query.cid) : '/scan';
  // ← 変更: cidから店舗名を取得してアイコン名に反映（取得失敗時は従来の「CFP注文」のまま）
  if (req.query.cid) {
    try {
      const info = await lookupCustomerByCid(req.query.cid);
      if (info && info.customerName) {
        const shortName = [...info.customerName].slice(0, 12).join(''); // ホーム画面用に12文字で切り詰め
        manifest.name = 'CFP - ' + info.customerName;
        manifest.short_name = shortName;
      }
    } catch (err) {
      console.error('Manifest customer lookup error:', err.message); // 失敗してもmanifest自体は返す
    }
  }
  res.json(manifest);
});

app.use(express.static('public'));
app.use('/auth', QBOAuth);
app.use('/api/flyer', require('./routes/flyerExport'));

const imageStore = new Map();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

async function sendNoteAlert(customerName, deliveryDate, noteItems, imageBuffer, imageMimeType, phone, contactRequest, replacementRequest) {
  const itemList = noteItems.length > 0
    ? noteItems.map(item => `• ${item.sku} - ${item.name} (Qty: ${item.quantity}): "${item.note}"`).join('\n')
    : '';
  const phoneLine = phone ? `\nPhone: ${phone}` : '';
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
  const submittedLine = `\nSubmitted: ${now} (PDT)`;
  const hasContact = contactRequest && (contactRequest.requested === true || contactRequest.requested === 'true');
  const hasReplacement = replacementRequest && (replacementRequest.requested === true || replacementRequest.requested === 'true');

  let contactLine = '';
  if (hasContact) {
    contactLine = `\n\nCONTACT REQUEST:\nMethod: ${contactRequest.method || 'Not specified'}\nMessage: ${contactRequest.message || 'No message'}`;
  }

  let replacementLine = '';
  if (hasReplacement) {
    const items = [];
    if (replacementRequest.marker === true || replacementRequest.marker === 'true') items.push('Marker');
    if (replacementRequest.sleeve === true || replacementRequest.sleeve === 'true') items.push('Sleeve');
    replacementLine = `\n\nREPLACEMENT REQUEST:\nItems needed: ${items.join(', ') || 'Not specified'}`;
  }

  const subjectIcons = [];
  if (hasContact) subjectIcons.push('📞');
  if (hasReplacement) {
    if (replacementRequest.marker === true || replacementRequest.marker === 'true') subjectIcons.push('✏️');
    if (replacementRequest.sleeve === true || replacementRequest.sleeve === 'true') subjectIcons.push('📁');
  }
  if (noteItems.length > 0) subjectIcons.push('⚠️');

  const subject = subjectIcons.length > 0
    ? `${subjectIcons.join('')} ${customerName}`
    : `Alert - ${customerName}`;

  const itemSection = itemList ? `\n\nItems with notes:\n${itemList}` : '';

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject,
    text: `Customer: ${customerName}${phoneLine}${submittedLine}\nDelivery Date: ${deliveryDate}${contactLine}${replacementLine}${itemSection}\n\n---\nCalifornia Food Product, MY Inc.`,
    attachments: imageBuffer ? [{
      filename: `order-${customerName}-${deliveryDate}.jpg`,
      content: imageBuffer,
      contentType: imageMimeType || 'image/jpeg'
    }] : []
  };
  await transporter.sendMail(mailOptions);
  console.log('Alert sent for:', customerName);
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
// PWA: cid付きアクセス時はmanifestリンクにcidを埋め込んだHTMLを返す（iOSのJS書き換えタイミング問題対策）
app.get('/scan', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'scan.html'), 'utf8');
  const cid = (req.query.cid || '').toString();
  if (cid) {
    html = html.replace('href="/manifest.json"', 'href="/manifest.json?cid=' + encodeURIComponent(cid) + '"');
  }
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

// Client list の A列で cid を照合し、店名(B列)・qboSystemId(D列)・電話を返す共通関数（見つからなければ null）
async function lookupCustomerByCid(cid) {
  if (!cid) return null;
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.CLIENTS_SHEET_ID,
    range: 'Client list!A:Q'
  });
  const rows = result.data.values || [];
  const row = rows.find(r => r[0] && r[0].toString().trim() === cid.toString().trim());
  if (!row) return null;
  const managerPhone = row[13] || '';
  const ownerPhone = row[10] || '';
  const rep1Phone = row[16] || '';
  const phone = managerPhone || ownerPhone || rep1Phone || '';
  const customerId = String(row[0] || '').trim().padStart(3, '0');
  return { customerId, customerName: row[1] || '', qboSystemId: row[3] || '', phone };
}

app.get('/api/customer', async (req, res) => {
  try {
    const { cid } = req.query;
    if (!cid) return res.status(400).json({ error: 'Customer ID is required' });
    const info = await lookupCustomerByCid(cid);
    if (!info) return res.status(404).json({ error: `Customer ID ${cid} not found` });
    res.json({ success: true, customerId: info.customerId, customerName: info.customerName, qboSystemId: info.qboSystemId, phone: info.phone });
  } catch (err) {
    console.error('Customer lookup error:', err.message);
    res.status(500).json({ error: 'Customer lookup failed: ' + err.message });
  }
});

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

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image found' });
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const promptText = [
      'Extract the following information from this order sheet image in JSON format only. Do not include any other text.',
      '{',
      '  "customer_name": "value of Restaurant Name field",',
      '  "order_date": "order date in YYYY-MM-DD format, use today if unknown",',
      '  "po_number": "PO number if exists, otherwise empty string",',
      '  "items": [',
      '    {',
      '      "sku": "SKU from leftmost column (1 letter + 3 digits, e.g. B002, C006, P021)",',
      '      "name": "item name from ITEMS column",',
      '      "quantity": "handwritten number from QTY column only. The QTY column is the 4th column and has thick black borders on both left and right sides. Use 0 if blank or not handwritten. Do NOT use numbers from WEIGHT/PACK column (3rd column).",',
      '      "note": "content of NOTE column if filled, otherwise empty string",',
      '      "unit_price": 0',
      '    }',
      '  ],',
      '  "contact_request": {',
      '    "requested": "true if Contact me checkbox is checked, otherwise false",',
      '    "method": "Text or Call depending on which is checked, otherwise empty string",',
      '    "message": "content of Message field if filled, otherwise empty string"',
      '  },',
      '  "replacement_request": {',
      '    "requested": "true if Need replacement checkbox is checked, otherwise false",',
      '    "marker": "true if Marker checkbox is checked, otherwise false",',
      '    "sleeve": "true if Sleeve checkbox is checked, otherwise false"',
      '  }',
      '}'
    ].join('\n');

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
            { type: 'text', text: promptText }
          ]
        }]
      },
      { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
    );
    const text = response.data.content[0].text;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('AI result:', JSON.stringify(parsed, null, 2));
    parsed.items = (parsed.items || []).filter(item => Number(item.quantity) > 0);

    const orderKey = `${Date.now()}`;
    imageStore.set(orderKey, { buffer: req.file.buffer, mimeType: req.file.mimetype });
    setTimeout(() => imageStore.delete(orderKey), 30 * 60 * 1000);
    parsed.orderKey = orderKey;

    // cid があれば Client list から正式な店名・顧客IDを取得（失敗しても解析本体は止めない）
    const cid = (req.body && req.body.cid) ? req.body.cid : '';
    let customerInfo = null;
    if (cid) {
      try {
        customerInfo = await lookupCustomerByCid(cid);
      } catch (cidErr) {
        console.error('Analyze cid lookup error:', cidErr.message);
      }
    }
    const pendingCustomerName = (customerInfo && customerInfo.customerName) ? customerInfo.customerName : (parsed.customer_name || '');
    const pendingCid = (customerInfo && customerInfo.customerId) ? customerInfo.customerId : '';

    // Pending タブへ解析記録を1行追記（失敗しても解析本体は止めない）
    try {
      const pendingAuth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      const pendingSheets = google.sheets({ version: 'v4', auth: pendingAuth });
      // ← 変更: 注文内容を "SKUxN, ..." 形式に要約（数量1以上の商品のみ。対象が無ければ空文字）
      const itemsSummary = (parsed.items || [])
        .filter(item => item && item.sku && Number(item.quantity) > 0)
        .map(item => `${item.sku}x${Number(item.quantity)}`)
        .join(', ');
      await pendingSheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Pending!A:H', // ← 変更: H列(注文内容)まで拡張
        valueInputOption: 'RAW', // RAW を維持（Cid のゼロ落ち防止）
        // A:OrderKey B:AnalyzedAt(UTC) C:CustomerName D:Cid E:Status F:AlertedAt G:AnalyzedAt_CA(Apps Script側で後埋め) H:注文内容
        resource: { values: [[orderKey, new Date().toISOString(), pendingCustomerName, String(pendingCid || ''), 'pending', '', '', itemsSummary]] }
      });
    } catch (pendingErr) {
      console.error('Pending append error:', pendingErr.message);
    }

    res.json({ success: true, data: parsed });
  } catch (err) {
  console.error('Analyze error:', err.message);
  console.error('Analyze error detail:', JSON.stringify(err.response?.data));
  res.status(500).json({ error: 'Analysis failed: ' + err.message });
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
    const now = new Date();
    const la = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const orderDate = `${la.year}/${la.month}/${la.day} ${la.hour}:${la.minute}:${la.second}`;
    const cidText = data.customer_id ? String(data.customer_id).padStart(3, '0') : '';
    const rows = data.items.map(item => [orderDate, deliveryDate, cidText, data.customer_name, item.sku, item.name, item.quantity, item.note || '']);

    // USER_ENTERED で追記（日付が正しく解釈される）
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      includeValuesInResponse: true,
      resource: { values: rows }
    });

    // C列（Customer ID）だけ RAW で上書き → 先頭ゼロを保持
    if (cidText) {
      const updatedRange = appendRes.data.updates.updatedRange; // e.g. "Sheet1!A5:H6"
      const match = updatedRange.match(/!.*?(\d+):.*?(\d+)$/);
      if (match) {
        const startRow = parseInt(match[1]);
        const endRow   = parseInt(match[2]);
        const cidValues = Array(endRow - startRow + 1).fill([cidText]);
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: `Sheet1!C${startRow}:C${endRow}`,
          valueInputOption: 'RAW',
          resource: { values: cidValues }
        });
      }
    }

    // Pending タブの該当行（OrderKey 一致）の Status を done に更新（失敗しても確定送信本体は止めない）
    try {
      if (data.orderKey) {
        const pendingRes = await sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: 'Pending!A:H' // ← 変更: H列まで拡張（照合はA列のみ使用、done更新はE列のまま）
        });
        const pendingRows = pendingRes.data.values || [];
        const rowIndex = pendingRows.findIndex(r => r[0] && r[0].toString() === data.orderKey.toString());
        if (rowIndex !== -1) {
          const targetRow = rowIndex + 1; // 1始まりの行番号
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `Pending!E${targetRow}`,
            valueInputOption: 'RAW',
            resource: { values: [['done']] }
          });
        }
      }
    } catch (pendingErr) {
      console.error('Pending status update error:', pendingErr.message);
    }

    const noteItems = data.items.filter(item => item.note && item.note.trim() !== '');
    const hasContactRequest = data.contact_request && (data.contact_request.requested === true || data.contact_request.requested === 'true');
    const hasReplacementRequest = data.replacement_request && (data.replacement_request.requested === true || data.replacement_request.requested === 'true');

    if (noteItems.length > 0 || hasContactRequest || hasReplacementRequest) {
      const stored = data.orderKey ? imageStore.get(data.orderKey) : null;
      sendNoteAlert(
        data.customer_name, deliveryDate, noteItems,
        stored?.buffer, stored?.mimeType,
        data.customerPhone, data.contact_request, data.replacement_request
      ).catch(err => console.error('Alert error:', err.message));
    }

    res.json({ success: true, rows: rows.length });
  } catch (err) {
    console.error('Sheets error:', err.message);
    res.status(500).json({ error: 'Failed to save: ' + err.message });
  }
});

app.post('/api/create-invoice', async (req, res) => {
  try {
    const { data, deliveryDate, accessToken, realmId, memo } = req.body; // ← 変更（memo を受け取る）
    const baseUrl = process.env.QBO_ENV === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
    // ← 変更: 段階展開ゲート。実インボイス発行は QBO_MODE=production かつ
    //   顧客が PRODUCTION_CUSTOMER_IDS（"ALL"/"*"=全員、または Customer ID のCSV）に含まれる場合のみ。
    //   それ以外（dry-run / 未許可顧客 / 設定漏れ）は dry-run でQBO送信しない（安全側）。
    const isProductionMode = process.env.QBO_MODE === 'production';
    const allowRaw = (process.env.PRODUCTION_CUSTOMER_IDS || '').trim();
    const allowAll = /^(all|\*)$/i.test(allowRaw);
    const allowSet = new Set(allowRaw.split(',').map(s => normalizeId(s)).filter(Boolean));
    const orderCustomerInternalId = normalizeId(data.customer_id || data.customerId);
    const customerAllowed = allowAll || allowSet.has(orderCustomerInternalId);
    const dryRun = !(isProductionMode && customerAllowed);
    console.log(`[MODE] ${dryRun ? 'dry-run' : 'PRODUCTION'} (QBO_MODE=${process.env.QBO_MODE || '(unset)'}, customer=${orderCustomerInternalId}, allowAll=${allowAll}, allowed=${customerAllowed})`);

    // ===== ① Customer ID 解決（既存ロジック維持） =====
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
        if (dryRun) {
          customerId = 'DRY-RUN-NEW-CUSTOMER';
          console.log(`[DRY-RUN] Would create new QBO Customer: ${data.customer_name}`);
        } else {
          const newCustomer = await axios.post(
            `${baseUrl}/v3/company/${realmId}/customer`,
            { DisplayName: data.customer_name },
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
          );
          customerId = newCustomer.data.Customer.Id;
        }
      }
    }

    // ===== ② 注文SKU抽出（数量0のもの除外） =====
    const orderItems = (data.items || [])
      .filter(it => it.sku && Number(it.quantity) > 0)
      .map(it => ({ sku: String(it.sku).trim(), qty: Number(it.quantity), name: it.name || '' }));
    if (orderItems.length === 0) {
      return res.status(400).json({ error: 'No items with positive quantity.' });
    }

    // ===== ③ Sheets一括取得 → 価格決定（Pricing Rules を JS で再現） =====
    const dataSources = await loadAllDataSources();
    const pricedItems = determinePricesForOrder(
      { customerId: data.customer_id || data.customerId, items: orderItems },
      dataSources
    );

    // 警告ログ（Custom Price未登録/SKU未登録/Customer未登録）
    const warnings = pricedItems.filter(p => p.warning).map(p => p.warning);
    if (warnings.length > 0) {
      console.warn('[create-invoice] price decision warnings:', warnings);
    }

    // ===== ④ QBOアイテムIDを取得（SKUごとに照合） =====
    // ← 変更: 旧実装どおり SELECT * で1件ずつ引く。
    //   QBOは (a) Sku への IN 句が効かず空で返る (b) Sku を SELECT 射影に含めると空で返る、ため。
    const skuList = pricedItems.filter(p => p.source !== 'error').map(p => p.sku);
    const qboItemsBySku = new Map();
    for (const sku of skuList) {
      const itemRes = await axios.get(
        `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Item WHERE Sku = '${String(sku).replace(/'/g, "\\'")}'`)}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
      );
      const found = itemRes.data.QueryResponse?.Item?.[0];
      if (found) qboItemsBySku.set(String(found.Sku || '').trim(), found);
    }

    // ===== ⑤ Lineを構築（UnitPrice は計算済み finalPrice を必ず使用） =====
    // ← 変更: QBO送信前に Packing list と同じ並び（Box→Piece→Weight）へ安定ソート。
    //   単位タイプは p.item.unitType（Item List M列）。同ランク内は元の受注順を維持するため
    //   元のindexをタイブレーカーにして確実に安定ソートする。
    const sortedPricedItems = pricedItems
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => {
        const r = rankUnit(a.p.item && a.p.item.unitType) - rankUnit(b.p.item && b.p.item.unitType);
        return r !== 0 ? r : a.idx - b.idx; // 同ランクは元の順序を維持
      })
      .map(x => x.p);

    const lines = [];
    const skippedSkus = [];
    for (const p of sortedPricedItems) {
      if (p.source === 'error') { skippedSkus.push(p.sku); continue; }
      const qboItem = qboItemsBySku.get(p.sku);
      if (!qboItem) {
        console.log(`SKU not found in QBO: ${p.sku}`);
        skippedSkus.push(p.sku);
        continue;
      }
      const desc = `${p.sku} - ${p.item.itemName}` + (p.source === 'custom' ? ' [Custom Price]' : '');
      lines.push({
        LineNum: lines.length + 1, // ← 変更（並べ替え後の順で1から連番。QBO側の自動並べ替えを防ぐ）
        Amount: p.lineTotal,
        DetailType: 'SalesItemLineDetail',
        Description: qboItem.Description || desc,
        SalesItemLineDetail: { ItemRef: { value: qboItem.Id }, Qty: p.qty, UnitPrice: p.finalPrice },
      });
    }

    if (lines.length === 0) return res.status(400).json({ error: 'No matching SKUs found in QuickBooks.' });

    // ★ 追加：Manual Order から memo（例 "Guest: 田中"）が来た場合のみ QBO の PrivateNote にセット。
    //   PrivateNote は社内用メモで、顧客に渡す請求書の表面には印字されない。
    //   memo が空 / 未指定なら従来どおり何もセットしない（通常顧客の挙動は変えない）。
    const privateNote = (typeof memo === 'string') ? memo.trim() : '';

    // ===== ⑥ 価格ソース内訳：社内ログにのみ記録（QBOには載せない＝顧客への漏洩防止） ===== // ← 変更
    const priceBreakdown = pricedItems
      .filter(p => p.source !== 'error')
      .map(p => {
        let line = `${p.sku}: ${p.source} $${p.finalPrice}`;
        if (p.source === 'custom' && p.note) line += ` (${p.note})`;
        return line;
      })
      .join(' | ');
    console.log(`[Pricing] customer=${orderCustomerInternalId}: ${priceBreakdown}`); // ← 変更（QBOのPrivateNote廃止→サーバーログ記録）

    // ===== ⑦ dry-run: ここで終わり（既存削除も実Invoice作成もスキップ） =====
    if (dryRun) {
      console.log('[DRY-RUN] Would create QBO Invoice:');
      console.log(JSON.stringify({
        CustomerRef: { value: customerId },
        TxnDate: deliveryDate,
        Line: lines, // ← 変更（価格内訳の PrivateNote は載せない。内訳は上の [Pricing] ログ参照）
        ...(privateNote ? { PrivateNote: privateNote } : {}), // ★ 追加：memo があれば PrivateNote をプレビュー表示
      }, null, 2));
      return res.json({
        success: true, dryRun: true,
        mockInvoiceId: 'DRY-' + Date.now(),
        skippedInvoices: [], skippedSkus,
        warnings,
        pricedItems: pricedItems.map(p => ({ sku: p.sku, source: p.source, finalPrice: p.finalPrice })),
      });
    }

    // ===== ⑧ 既存インボイスを削除（未払いのみ。支払い済みはスキップ） =====
    const existingQuery = await axios.get(
     `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Invoice WHERE CustomerRef = '${customerId}' AND TxnDate = '${deliveryDate}'`)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    const existingInvoices = existingQuery.data.QueryResponse.Invoice || [];
    const skippedInvoices = [];
    for (const old of existingInvoices) {
      const isPaid = Number(old.Balance) < Number(old.TotalAmt);
      if (isPaid) {
        skippedInvoices.push(old.DocNumber);
        console.log('Skipped paid invoice:', old.DocNumber);
        continue;
      }
      await axios.post(
        `${baseUrl}/v3/company/${realmId}/invoice?operation=delete`,
        { Id: old.Id, SyncToken: old.SyncToken },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
      );
      console.log('Deleted existing invoice:', old.DocNumber);
    }

    // ===== ⑨ Invoice 作成 =====
    const invoiceBody = {
      CustomerRef: { value: customerId },
      TxnDate: deliveryDate, // ← 変更（ShipDateは廃止しTxnDateのみ＝origin修正を採用）
      Line: lines, // ← 変更（価格内訳の PrivateNote は廃止。内訳は [Pricing] ログ）
    };
    // ★ 追加：memo がある場合のみ PrivateNote をセット（社内メモ。顧客向け請求書には非表示）
    if (privateNote) invoiceBody.PrivateNote = privateNote;
    const invoice = await axios.post(
      `${baseUrl}/v3/company/${realmId}/invoice`,
      invoiceBody,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    const invoiceNumber = invoice.data.Invoice.DocNumber;
    console.log('Invoice created:', invoiceNumber, '/ warnings:', warnings.length, '/ skipped SKUs:', skippedSkus.length);
    res.json({
      success: true,
      invoiceId: invoice.data.Invoice.Id, invoiceNumber,
      skippedInvoices, skippedSkus,
      warnings,
      pricedItems: pricedItems.map(p => ({ sku: p.sku, source: p.source, finalPrice: p.finalPrice })),
    });
  } catch (err) {
    console.error('QBO error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Invoice creation failed: ' + JSON.stringify(err.response?.data || err.message) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
app.post('/api/create-bill', async (req, res) => {
  try {
    const { vendorName, invoiceNumber, invoiceDate, dueDate, lineItems, grandTotal } = req.body;

    const token = await getValidToken();
    if (!token) return res.status(401).json({ error: 'QBO not connected. Please visit /auth/connect' });

    const { accessToken, realmId } = token;
    const baseUrl = process.env.QBO_ENV === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    // Vendor検索（なければ作成）
    const escapedVendor = vendorName.replace(/'/g, "\\'");
const vendorQuery = await axios.get(
  `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Vendor WHERE DisplayName = '${escapedVendor}'`)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    let vendorId;
    const vendors = vendorQuery.data.QueryResponse?.Vendor;
    if (vendors && vendors.length > 0) {
      vendorId = vendors[0].Id;
    } else {
      const newVendor = await axios.post(
        `${baseUrl}/v3/company/${realmId}/vendor`,
        { DisplayName: vendorName },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
      );
      vendorId = newVendor.data.Vendor.Id;
      console.log('New vendor created:', vendorName, vendorId);
    }

    // デフォルト経費アカウント取得（Cost of Goods Sold）
    const accountName = process.env.QBO_EXPENSE_ACCOUNT || 'Cost of Goods Sold';
    const accountQuery = await axios.get(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(`SELECT * FROM Account WHERE Name = '${accountName}'`)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    const accounts = accountQuery.data.QueryResponse?.Account;
    if (!accounts || accounts.length === 0) {
      return res.status(400).json({ error: `Account "${accountName}" not found in QBO. Set QBO_EXPENSE_ACCOUNT env variable.` });
    }
    const accountId = accounts[0].Id;

    // Bill明細作成
    const lines = lineItems
      .filter(item => item.invoice_total > 0)
      .map(item => ({
        Amount: item.invoice_total,
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: item.sku ? `${item.sku} - ${item.description}` : item.description,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: accountId },
          BillableStatus: 'NotBillable'
        }
      }));

    if (lines.length === 0) return res.status(400).json({ error: 'No line items to create bill.' });

    // Bill作成
    const billBody = {
  VendorRef: { value: vendorId },
  DocNumber: invoiceNumber,
  TxnDate: invoiceDate,
  DueDate: dueDate || invoiceDate,
  Line: lines
};

    const billRes = await axios.post(
      `${baseUrl}/v3/company/${realmId}/bill`,
      billBody,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
    );

    const bill = billRes.data.Bill;
    console.log('Bill created:', bill.Id, 'Vendor:', vendorName, 'Amount:', grandTotal);
    res.json({ success: true, billId: bill.Id, docNumber: bill.DocNumber });

  } catch (err) {
    console.error('Create bill error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Bill creation failed: ' + JSON.stringify(err.response?.data || err.message) });
  }
});

// ============================================================
// AR(売掛金)エージェント用エンドポイント
// 認証: 既存のApps Script→サーバー呼び出しと同じ仕組み（/api/create-bill と同様、
//       追加の認証層なし。QBOトークンはサーバー側 getValidToken() で取得）
// ============================================================

// APIキー認証ミドルウェア（AR用エンドポイント専用。既存エンドポイントには適用しない）
// リクエストヘッダー X-API-Key と環境変数 AR_API_KEY を照合。
// AR_API_KEY 未設定、またはキー不一致なら 401 を返す。
function requireArApiKey(req, res, next) {
  const expected = (process.env.AR_API_KEY || '').trim();
  const provided = (req.get('X-API-Key') || '').trim();
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  }
  next();
}

// QBOクエリをページネーション付きで全件取得する共通関数
// （QBOのMAXRESULTS上限は1000。1000件超でも漏れなく取得する）
async function qboQueryAll(baseUrl, realmId, accessToken, entity, whereClause) {
  const pageSize = 1000;
  let startPosition = 1;
  const all = [];
  while (true) {
    const query = `SELECT * FROM ${entity}` +
      (whereClause ? ` WHERE ${whereClause}` : '') +
      ` ORDERBY Id STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const resp = await axios.get(
      `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    const items = resp.data.QueryResponse?.[entity] || [];
    all.push(...items);
    if (items.length < pageSize) break;
    startPosition += pageSize;
  }
  return all;
}

// GET /ar/aging … Balance > 0 のInvoiceを全件返す（エイジング集計用）
app.get('/ar/aging', requireArApiKey, async (req, res) => {
  try {
    const token = await getValidToken();
    if (!token) return res.status(401).json({ error: 'QBO not connected. Please visit /auth/connect' });
    const { accessToken, realmId } = token;
    const baseUrl = process.env.QBO_ENV === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    const invoices = await qboQueryAll(baseUrl, realmId, accessToken, 'Invoice', `Balance > '0'`);
    const result = invoices.map(inv => ({
      customerId: inv.CustomerRef?.value || '',
      customerName: inv.CustomerRef?.name || '',
      invoiceNumber: inv.DocNumber || '',
      txnDate: inv.TxnDate || '',
      dueDate: inv.DueDate || '',
      balance: Number(inv.Balance) || 0,
      totalAmt: Number(inv.TotalAmt) || 0
    }));
    console.log(`[AR] /ar/aging -> ${result.length} open invoices`);
    res.json(result);
  } catch (err) {
    console.error('AR aging error:', err.response?.data || err.message);
    res.status(500).json({ error: 'AR aging failed: ' + JSON.stringify(err.response?.data || err.message) });
  }
});

// GET /ar/customer-emails … 全Customerの { customerId, displayName, email } を返す
app.get('/ar/customer-emails', requireArApiKey, async (req, res) => {
  try {
    const token = await getValidToken();
    if (!token) return res.status(401).json({ error: 'QBO not connected. Please visit /auth/connect' });
    const { accessToken, realmId } = token;
    const baseUrl = process.env.QBO_ENV === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    const customers = await qboQueryAll(baseUrl, realmId, accessToken, 'Customer', '');
    const result = customers.map(c => ({
      customerId: c.Id || '',
      displayName: c.DisplayName || '',
      email: c.PrimaryEmailAddr?.Address || ''
    }));
    console.log(`[AR] /ar/customer-emails -> ${result.length} customers`);
    res.json(result);
  } catch (err) {
    console.error('AR customer-emails error:', err.response?.data || err.message);
    res.status(500).json({ error: 'AR customer-emails failed: ' + JSON.stringify(err.response?.data || err.message) });
  }
});
