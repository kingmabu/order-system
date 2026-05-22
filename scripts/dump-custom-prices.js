/**
 * scripts/dump-custom-prices.js - 開発用 Custom Prices シートの全件ダンプ
 *
 * 本番移植ステップC（08-production-migration.md §4）用。
 * 開発用 Cost list の Custom Prices シート A:G を「表示値そのまま」で読み取り、
 * 本番に登録すべき全レコードを一覧表示する。読み取り専用（書き込み一切なし）。
 *
 * 実行:
 *   node -r dotenv/config scripts/dump-custom-prices.js dotenv_config_path=.env.development
 */

if (!process.env.GOOGLE_SERVICE_ACCOUNT && process.env.PROD_GOOGLE_SERVICE_ACCOUNT) {
  process.env.GOOGLE_SERVICE_ACCOUNT = process.env.PROD_GOOGLE_SERVICE_ACCOUNT;
}

const { google } = require('googleapis');

async function main() {
  const spreadsheetId = process.env.COST_LIST_ID;
  const sheetName = process.env.CUSTOM_PRICES_SHEET || 'Custom Prices';

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:G`,
    valueRenderOption: 'FORMATTED_VALUE', // 表示そのまま（"011" / "$16.05"）
  });
  const rows = res.data.values || [];

  console.log('=== 開発用 Custom Prices ダンプ（表示値そのまま）===');
  console.log('COST_LIST_ID:', spreadsheetId, '/ シート:', sheetName);
  console.log('');

  if (rows.length === 0) {
    console.log('（行なし）');
    return;
  }

  const header = rows[0];
  const data = rows.slice(1).filter(r => (r[0] || r[2] || r[4]));

  // 列ごとの最大幅で簡易整形
  const cols = ['A:CustID', 'B:CustName', 'C:SKU', 'D:ItemName', 'E:Price', 'F:UpdDate', 'G:Note'];
  console.log(cols.join(' | '));
  console.log('-'.repeat(90));
  data.forEach((r, i) => {
    const c = n => (r[n] === undefined || r[n] === null ? '' : String(r[n]));
    console.log(`${String(i + 1).padStart(2)}. ${c(0)} | ${c(1)} | ${c(2)} | ${c(3)} | ${c(4)} | ${c(5)} | ${c(6)}`);
  });

  console.log('');
  console.log(`合計 ${data.length} 件`);

  // 分類別の内訳
  const byKey = {};
  data.forEach(r => {
    const id = String(r[0] || '').trim();
    const key = /^GROUP_/.test(id) ? id : 'Individual';
    byKey[key] = (byKey[key] || 0) + 1;
  });
  console.log('内訳:', JSON.stringify(byKey));
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (/permission|PERMISSION|403|does not have access/.test(err.message)) {
    console.error('→ 開発用シートがサービスアカウントに共有されていない可能性があります。');
  }
  process.exit(1);
});
