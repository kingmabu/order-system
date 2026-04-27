const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

function getAuthClient() {
  const keyFile = path.resolve('credentials.json');
  if (fs.existsSync(keyFile)) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  throw new Error('No Google credentials found. Add credentials.json or set GOOGLE_SERVICE_ACCOUNT_JSON in .env');
}

/**
 * Appends raw rows to a Google Sheet.
 * @param {Array<Array<any>>} rows   - 2D array of cell values
 * @param {string}            range  - Sheet range, e.g. 'Sheet1!A:E'
 */
async function appendRows(rows, range = 'Sheet1!A:E') {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  console.log(`Appended ${rows.length} row(s) to Google Sheet [${range}]`);
}

/**
 * Legacy helper — appends simple {sku, qty} items with a timestamp.
 * @param {Array<{sku: string, qty: number}>} items
 */
async function appendOrderToSheet(items) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const rows = items.map(item => [timestamp, item.sku, item.qty]);
  await appendRows(rows, 'Sheet1!A:C');
}

module.exports = { appendRows, appendOrderToSheet };
