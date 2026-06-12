// リスト注文 /api/itemlist のロジック単体テスト(読み取り専用)
// 使い方: node scripts/test-itemlist.js 064
// ローカルにGOOGLE_SERVICE_ACCOUNT環境変数がない場合は credentials.json を使う
const { google } = require('googleapis');
const path = require('path');

const ORDER_ITEMLIST_SHEET_ID = '15gbPAWhROz0t33tBsnIMXYwlev1WH0vQ4YoqLxilybQ';

async function main() {
  const cid = process.argv[2] || '064';
  const cid3 = String(cid).trim().padStart(3, '0');
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)
    : require(path.join(__dirname, '..', 'credentials.json'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: ORDER_ITEMLIST_SHEET_ID,
    fields: 'sheets.properties.title'
  });
  const titles = (meta.data.sheets || []).map(s => s.properties.title);
  console.log('全タブ数:', titles.length);
  console.log('OS-タブ(先頭10件):', titles.filter(t => t.startsWith('OS-')).slice(0, 10));

  const target = titles.find(t =>
    t.startsWith(`OS-${cid3}-`) &&
    !/backup/i.test(t) &&
    !/^Test/i.test(t) &&
    t !== 'OS-000-Template'
  );
  if (!target) { console.log(`cid=${cid3}: タブなし -> {found:false}`); return; }
  console.log('対象タブ:', target);

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: ORDER_ITEMLIST_SHEET_ID,
    range: `'${target}'!A:C`
  });
  const rows = values.data.values || [];
  const headerIdx = rows.findIndex(r => (r[0] || '').toString().trim().toUpperCase() === 'SKU');
  console.log('ヘッダー行index:', headerIdx, '/ ヘッダー:', rows[headerIdx]);
  const items = rows.slice(headerIdx + 1)
    .filter(r => r[0] && r[0].toString().trim() !== '' && r[1] && r[1].toString().trim() !== '')
    .map(r => ({ sku: r[0].toString().trim(), name: r[1].toString().trim(), weight: (r[2] || '').toString().trim() }));
  console.log('商品数:', items.length);
  console.log('先頭5件:', JSON.stringify(items.slice(0, 5), null, 2));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
