/**
 * routes/sheets-client.js - Google Sheets 読み取りユーティリティ
 *
 * Custom Prices System Phase 3。
 * Custom Prices / Client list / Item List を一括取得する。
 * 既存server.jsと同じ認証方式（GOOGLE_SERVICE_ACCOUNT 環境変数のJSON文字列）を使用。
 *
 * 環境変数（必須）:
 *   GOOGLE_SERVICE_ACCOUNT - サービスアカウントキーJSON（文字列）
 *   COST_LIST_ID           - Cost list スプレッドシートID（Custom Pricesを含む）
 *   ITEM_LIST_ID           - Item List スプレッドシートID
 *   CLIENT_INFO_ID         - Client Information スプレッドシートID
 *
 * 環境変数（任意・デフォルトあり）:
 *   ITEM_LIST_SHEET     (default: '商品一覧')
 *   CLIENT_LIST_SHEET   (default: 'Client list')
 *   CUSTOM_PRICES_SHEET (default: 'Custom Prices')
 */

const { google } = require('googleapis');

const DEFAULT_ITEM_LIST_SHEET = '商品一覧';
const DEFAULT_CLIENT_LIST_SHEET = 'Client list';
const DEFAULT_CUSTOM_PRICES_SHEET = 'Custom Prices';

// Item List の構造（apps-script と一致させること）
const IL_HEADER_ROW = 4; // データは5行目から

// Google Sheets API クライアント（既存server.jsと同じ認証方式）
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * 汎用：指定範囲を読み取り（3回リトライ、指数バックオフ 1秒/3秒/9秒）
 */
async function readRangeWithRetry(spreadsheetId, range, maxRetries = 3) {
  const sheets = getSheetsClient();
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      return res.data.values || [];
    } catch (err) {
      lastError = err;
      console.error(`[sheets-client] ${spreadsheetId} ${range} attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        const waitMs = Math.pow(3, attempt - 1) * 1000;
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw new Error(`readRange failed after ${maxRetries} retries: ${lastError.message}`);
}

/**
 * Customer ID を3桁ゼロ埋めに正規化
 *  例: '11' → '011', 11 → '011', '011' → '011'
 */
function normalizeId(id) {
  if (id === null || id === undefined) return '';
  const num = parseInt(String(id).replace(/\D/g, ''), 10);
  if (isNaN(num)) return String(id).trim();
  return ('000' + num).slice(-3);
}

/**
 * 価格セルの値を数値化する。 // ← 変更（箱単価バグ修正）
 * 数値ならそのまま、文字列なら数字部分だけを抽出する。
 *  Item List K列は表示用数式 =IF(I,"$"&TEXT(J*N,"0.00")&"/"&M,"") のため
 *  "$105.75/Box" のような文字列で返る。Number() では NaN になり 0 に落ちてしまう問題に対応。
 *  例: 105.75 → 105.75 / "$105.75/Box" → 105.75 / "$1,105.75/Box" → 1105.75 / "" → 0
 */
function parsePrice(val) {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/,/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/**
 * Custom Prices 全件読み取り
 * シート列: A=Customer ID, B=Customer Name, C=SKU, D=Item Name, E=Custom Price, F=Update Date, G=Note
 * @return {Array} [{ customerId, customerName, sku, itemName, price, updateDate, note }, ...]
 */
async function loadAllCustomPrices() {
  const sheetName = process.env.CUSTOM_PRICES_SHEET || DEFAULT_CUSTOM_PRICES_SHEET;
  const spreadsheetId = process.env.COST_LIST_ID;
  if (!spreadsheetId) throw new Error('COST_LIST_ID 環境変数が未設定');

  const range = `${sheetName}!A2:G`;
  const rows = await readRangeWithRetry(spreadsheetId, range);
  return rows
    .filter(r => r[0] && r[2] && r[4]) // Customer ID, SKU, Price必須
    .map(r => ({
      customerId: normalizeId(r[0]),
      customerName: String(r[1] || '').trim(),
      sku: String(r[2]).trim(),
      itemName: String(r[3] || '').trim(),
      price: parsePrice(r[4]), // E列。"$16.05" のような通貨表示でも数値化（FORMATTED_VALUE対策） // ← 変更
      updateDate: r[5] || null,
      note: String(r[6] || ''),
    }));
}

/**
 * Client list 全件読み取り
 * シート列: A=Customer ID, B=Customer Name, ..., W=Price Group, X=Markup %
 *   ※ W列(index 22) / X列(index 23) は Phase 2 で追加（02-data-structures.md 5-2参照）
 * @return {Array} [{ customerId, customerName, priceGroup, markup }, ...]
 */
async function loadAllClients() {
  const sheetName = process.env.CLIENT_LIST_SHEET || DEFAULT_CLIENT_LIST_SHEET;
  const spreadsheetId = process.env.CLIENT_INFO_ID;
  if (!spreadsheetId) throw new Error('CLIENT_INFO_ID 環境変数が未設定');

  // A列〜X列（24列）まで読む
  const range = `${sheetName}!A2:X`;
  const rows = await readRangeWithRetry(spreadsheetId, range);
  return rows
    .filter(r => r[0]) // Customer ID 必須
    .map(r => ({
      customerId: normalizeId(r[0]),
      customerName: String(r[1] || '').trim(),
      priceGroup: String(r[22] || 'Standard').trim() || 'Standard', // W列
      markup: Number(r[23]) || 0,                                    // X列
    }));
}

/**
 * Item List 全件読み取り
 * シート列: A=SKU, D=Item Name, I=✅ Unit?, J=Price ($/lb), K=Unit Price ($), M=Unit Type
 * ヘッダー4行目、データは5行目から
 * @return {Array} [{ sku, itemName, isUnit, priceLb, priceUnit, basePrice, unitType }, ...]
 */
async function loadAllItems() {
  const sheetName = process.env.ITEM_LIST_SHEET || DEFAULT_ITEM_LIST_SHEET;
  const spreadsheetId = process.env.ITEM_LIST_ID;
  if (!spreadsheetId) throw new Error('ITEM_LIST_ID 環境変数が未設定');

  const range = `${sheetName}!A${IL_HEADER_ROW + 1}:M`; // ← 変更（K→M。M列=単位タイプを追加読み込み）
  const rows = await readRangeWithRetry(spreadsheetId, range);
  return rows
    .filter(r => r[0]) // SKU 必須
    .map(r => {
      const sku = String(r[0]).trim();
      const itemName = String(r[3] || '').trim(); // D列
      // I列のチェックボックスは true/false で返るが、文字列 'TRUE' のケースにも備える
      const isUnit = r[8] === true || r[8] === 'TRUE' || r[8] === 'true';
      const priceLb = parsePrice(r[9]);    // J列（$/lb）         // ← 変更
      const priceUnit = parsePrice(r[10]); // K列（"$105.75/Box" のような文字列も数値化） // ← 変更
      const unitType = String(r[12] || '').trim(); // M列（Box/Piece/Bag/Can等）。Packing list並び順用 // ← 変更
      return {
        sku,
        itemName,
        isUnit,
        priceLb,
        priceUnit,
        basePrice: isUnit ? priceUnit : priceLb,
        unitType, // ← 変更（QBOインボイス明細をBox→Piece→Weight順に並べるため）
      };
    });
}

/**
 * 全データソースを並列で一括取得（注文処理の冒頭で1回だけ呼ぶ）
 * @return {Object} { customPrices, clients, items }
 */
async function loadAllDataSources() {
  const [customPrices, clients, items] = await Promise.all([
    loadAllCustomPrices(),
    loadAllClients(),
    loadAllItems(),
  ]);
  return { customPrices, clients, items };
}

module.exports = {
  loadAllCustomPrices,
  loadAllClients,
  loadAllItems,
  loadAllDataSources,
  normalizeId,
  parsePrice, // ← 変更（箱単価パース。テスト・他モジュールから参照可能に）
  readRangeWithRetry,
};
