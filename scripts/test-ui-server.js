// リスト注文UIの動作確認用スタブサーバー(本番データ・QBOには一切触れない)
// 使い方: node scripts/test-ui-server.js → http://localhost:3457/scan?cid=064
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
app.use(express.json());

app.get('/scan', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'scan.html'), 'utf8');
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/customer', (req, res) => res.json({
  success: true, customerId: '064', customerName: 'Daikoku Annex (TEST)', qboSystemId: '165', phone: '555-0000'
}));

app.get('/api/itemlist', (req, res) => res.json({
  found: true, tab: 'OS-064-Daikoku-Annex',
  items: [
    { sku: 'B007', name: 'Beef Plate Sliced', weight: '4' },
    { sku: 'P013', name: 'Pork Fat Sakura', weight: '40' },
    { sku: 'P030', name: 'Pork Back Bone Britco', weight: '44.1' },
    { sku: 'P057', name: 'Pork Loin JBS, Strap-on', weight: '10' },
    { sku: 'C001', name: 'Chicken Back Bone', weight: '40' },
    { sku: 'C012', name: 'Chicken Leg Meat Skin-on', weight: '10' }
  ]
}));

app.post('/api/save-to-sheets', (req, res) => {
  console.log('[STUB] save-to-sheets payload:');
  console.log(JSON.stringify(req.body, null, 2));
  res.json({ success: true, rows: (req.body.data.items || []).length });
});

app.get('/auth/token', (req, res) => res.json({ accessToken: 'TEST-TOKEN', realmId: 'TEST-REALM' }));

app.post('/api/create-invoice', (req, res) => {
  console.log('[STUB] create-invoice items:', JSON.stringify(req.body.data.items));
  res.json({ success: true, invoiceNumber: 'TEST-1234', skippedInvoices: [], skippedSkus: [] });
});

app.listen(3457, () => console.log('UI test server on http://localhost:3457/scan?cid=064'));
