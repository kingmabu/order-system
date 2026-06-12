// 列ずれしたテスト行(cid=097)を特定する(読み取り専用)
const { google } = require('googleapis');
const path = require('path');

const ORDER_HISTORY_ID = '1Qi7IuVjksPQa3wv_YIid_UCHaHYmmmyBH3oT8BJKLIk';

async function main() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)
    : require(path.join(__dirname, '..', 'credentials.json'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ORDER_HISTORY_ID,
    range: 'Sheet1!A:R'
  });
  const rows = res.data.values || [];
  console.log('総行数:', rows.length);
  // 末尾15行を行番号付きで表示
  const start = Math.max(0, rows.length - 15);
  for (let i = start; i < rows.length; i++) {
    console.log(`行${i + 1}:`, JSON.stringify(rows[i]));
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
