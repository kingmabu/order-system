/**
 * scripts/inspect-qbo-structure.js
 *
 * Custom Prices System Phase 3 (移行スクリプト) の事前調査用。
 * docs/custom-prices-system/05-migration-script.md 7-2 の推奨に従い、
 * 本実装前に QBO 組織での価格構造を確認する。
 *
 * 動作 (read-only):
 *   1. .env.development の PROD_* から本番 Google Sheets に接続
 *   2. 本番 _tokens シートから QBO アクセストークン取得（必要ならリフレッシュ）
 *   3. 以下を順に試して使える価格情報源を探索:
 *        - PriceLevel エンティティ（旧式、minorversion 違いで再試行）
 *        - PriceRule  エンティティ（QBO US 新方式）
 *        - Customer サンプル（PriceLevelRef があるか）
 *        - 過去 Invoice サンプル（行ごとに UnitPrice を持つ）
 *   4. scripts/output/qbo-structure.json に書き出し
 *   5. コンソールに要点を表示
 *
 * 使い捨てスクリプト（構造確認後は削除可）
 *
 * 実行方法 (PowerShell):
 *   node scripts/inspect-qbo-structure.js
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { google } = require('googleapis');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.development') });

const PROD_SHEET_ID = process.env.PROD_GOOGLE_SHEET_ID;
const PROD_SERVICE_ACCOUNT = process.env.PROD_GOOGLE_SERVICE_ACCOUNT;
const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_BASE_URL = process.env.QBO_BASE_URL || 'https://quickbooks.api.intuit.com';

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'qbo-structure.json');

// ============================================================
// 環境変数チェック
// ============================================================
function assertEnv() {
  const missing = [];
  if (!PROD_SHEET_ID) missing.push('PROD_GOOGLE_SHEET_ID');
  if (!PROD_SERVICE_ACCOUNT) missing.push('PROD_GOOGLE_SERVICE_ACCOUNT');
  if (!QBO_CLIENT_ID) missing.push('QBO_CLIENT_ID');
  if (!QBO_CLIENT_SECRET) missing.push('QBO_CLIENT_SECRET');
  if (missing.length) {
    console.error('✗ 必須の環境変数が未設定です:');
    for (const k of missing) console.error('  - ' + k);
    process.exit(1);
  }
}

// ============================================================
// Google Sheets ヘルパー（本番シート専用）
// ============================================================
async function getProdSheetsClient() {
  const creds = JSON.parse(PROD_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function loadTokensFromProdSheet() {
  const sheets = await getProdSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: PROD_SHEET_ID,
    range: '_tokens!A1:D1'
  });
  const row = result.data.values && result.data.values[0];
  if (!row || !row[0]) throw new Error('本番 _tokens シートにトークンが見つかりません');
  return {
    accessToken: row[0],
    refreshToken: row[1],
    realmId: row[2],
    expiresAt: parseInt(row[3], 10) || 0
  };
}

async function saveTokensToProdSheet(tokens) {
  const sheets = await getProdSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: PROD_SHEET_ID,
    range: '_tokens!A1:D1',
    valueInputOption: 'RAW',
    resource: {
      values: [[tokens.accessToken, tokens.refreshToken, tokens.realmId, String(tokens.expiresAt)]]
    }
  });
}

async function refreshAccessToken(tokens) {
  const basic = Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString('base64');
  const res = await axios.post(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      }
    }
  );
  const refreshed = {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    realmId: tokens.realmId,
    expiresAt: Date.now() + res.data.expires_in * 1000
  };
  await saveTokensToProdSheet(refreshed);
  return refreshed;
}

async function getValidQboToken() {
  let tokens = await loadTokensFromProdSheet();
  console.log(`✓ 本番 _tokens からトークン取得 (realmId: ${tokens.realmId})`);
  if (Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
    console.log('  - 有効期限切れ間近、リフレッシュ中...');
    tokens = await refreshAccessToken(tokens);
  } else {
    const minLeft = Math.floor((tokens.expiresAt - Date.now()) / 60000);
    console.log(`  - 有効期限まで約${minLeft}分（リフレッシュ不要）`);
  }
  return tokens;
}

// ============================================================
// QBO クエリ（失敗を握り潰して結果オブジェクトを返す）
// ============================================================
async function qboQuery(accessToken, realmId, query, minorversion) {
  const url = `${QBO_BASE_URL}/v3/company/${realmId}/query`;
  const params = { query };
  if (minorversion) params.minorversion = minorversion;
  try {
    const res = await axios.get(url, {
      params,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    });
    return { ok: true, status: res.status, data: res.data.QueryResponse || {} };
  } catch (err) {
    return {
      ok: false,
      status: err.response ? err.response.status : 0,
      error: err.response ? (err.response.data && err.response.data.Fault) : err.message
    };
  }
}

// ============================================================
// メイン処理
// ============================================================
async function main() {
  console.log('=== QBO 構造調査 (read-only / 探索モード) ===\n');
  assertEnv();

  const tokens = await getValidQboToken();
  const report = {
    investigatedAt: new Date().toISOString(),
    realmId: tokens.realmId,
    attempts: {},
    samples: {}
  };

  // ----------------------------------------------------------------
  // 1) PriceLevel を minorversion 違いで試す
  // ----------------------------------------------------------------
  console.log('\n--- 1) PriceLevel エンティティを探索 ---');
  for (const mv of [null, 75, 65, 40, 14, 4]) {
    const tag = mv ? `mv=${mv}` : 'no-mv';
    const r = await qboQuery(tokens.accessToken, tokens.realmId, 'SELECT * FROM PriceLevel MAXRESULTS 1000', mv);
    if (r.ok) {
      const list = r.data.PriceLevel || [];
      console.log(`  ✓ PriceLevel (${tag}): ${list.length} 件`);
      report.attempts.priceLevel = { minorversion: mv, count: list.length, ok: true };
      report.samples.priceLevels = list;
      break;
    } else {
      const msg = r.error && r.error.Error && r.error.Error[0] ? r.error.Error[0].Detail : (typeof r.error === 'string' ? r.error : 'unknown');
      console.log(`  ✗ PriceLevel (${tag}): HTTP ${r.status} - ${msg}`);
      report.attempts['priceLevel_' + tag] = { ok: false, status: r.status, detail: msg };
    }
  }

  // ----------------------------------------------------------------
  // 2) PriceRule を試す
  // ----------------------------------------------------------------
  console.log('\n--- 2) PriceRule エンティティを探索 ---');
  for (const mv of [null, 75, 65, 40]) {
    const tag = mv ? `mv=${mv}` : 'no-mv';
    const r = await qboQuery(tokens.accessToken, tokens.realmId, 'SELECT * FROM PriceRule MAXRESULTS 1000', mv);
    if (r.ok) {
      const list = r.data.PriceRule || [];
      console.log(`  ✓ PriceRule (${tag}): ${list.length} 件`);
      report.attempts.priceRule = { minorversion: mv, count: list.length, ok: true };
      report.samples.priceRules = list;
      break;
    } else {
      const msg = r.error && r.error.Error && r.error.Error[0] ? r.error.Error[0].Detail : (typeof r.error === 'string' ? r.error : 'unknown');
      console.log(`  ✗ PriceRule (${tag}): HTTP ${r.status} - ${msg}`);
      report.attempts['priceRule_' + tag] = { ok: false, status: r.status, detail: msg };
    }
  }

  // ----------------------------------------------------------------
  // 3) Customer サンプル（PriceLevelRef があるか）
  // ----------------------------------------------------------------
  console.log('\n--- 3) Customer サンプル取得（PriceLevelRef の有無確認） ---');
  const custRes = await qboQuery(tokens.accessToken, tokens.realmId, 'SELECT * FROM Customer MAXRESULTS 20', 75);
  if (custRes.ok) {
    const customers = custRes.data.Customer || [];
    const withPLR = customers.filter(c => c.PriceLevelRef);
    console.log(`  ✓ Customer: ${customers.length} 件 / PriceLevelRef あり: ${withPLR.length} 件`);
    report.samples.customers_first20 = customers;
    report.attempts.customer = { count: customers.length, withPriceLevelRef: withPLR.length };
    if (withPLR[0]) {
      console.log(`     例: ${withPLR[0].DisplayName} → PriceLevelRef=${JSON.stringify(withPLR[0].PriceLevelRef)}`);
    }
  } else {
    console.log('  ✗ Customer 取得失敗', custRes.status);
  }

  // ----------------------------------------------------------------
  // 4) Item サンプル
  // ----------------------------------------------------------------
  console.log('\n--- 4) Item サンプル取得（SKU フィールド確認） ---');
  const itemRes = await qboQuery(tokens.accessToken, tokens.realmId, 'SELECT * FROM Item MAXRESULTS 5', 75);
  if (itemRes.ok) {
    const items = itemRes.data.Item || [];
    const withSku = items.filter(i => i.Sku).length;
    console.log(`  ✓ Item: ${items.length} 件 / Sku あり: ${withSku} 件`);
    report.samples.items_first5 = items;
  } else {
    console.log('  ✗ Item 取得失敗', itemRes.status);
  }

  // ----------------------------------------------------------------
  // 5) 直近 Invoice サンプル（UnitPrice 確認）
  // ----------------------------------------------------------------
  console.log('\n--- 5) 直近 Invoice サンプル取得（行ごとの UnitPrice を確認） ---');
  const invRes = await qboQuery(
    tokens.accessToken,
    tokens.realmId,
    "SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS 3",
    75
  );
  if (invRes.ok) {
    const invoices = invRes.data.Invoice || [];
    console.log(`  ✓ Invoice: ${invoices.length} 件取得`);
    report.samples.invoices_first3 = invoices;
    if (invoices[0]) {
      const inv = invoices[0];
      const lines = (inv.Line || []).filter(l => l.SalesItemLineDetail);
      console.log(`     例: 顧客=${inv.CustomerRef && inv.CustomerRef.name}, 日付=${inv.TxnDate}, 行数=${lines.length}`);
      if (lines[0]) {
        const d = lines[0].SalesItemLineDetail;
        console.log(`     行1: item=${d.ItemRef && d.ItemRef.name}, qty=${d.Qty}, unitPrice=${d.UnitPrice}`);
      }
    }
  } else {
    console.log('  ✗ Invoice 取得失敗', invRes.status);
  }

  // ----------------------------------------------------------------
  // 出力
  // ----------------------------------------------------------------
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n✓ 詳細を出力: ${OUTPUT_FILE}`);

  console.log('\n=== 完了。出力JSONを次のステップで解析します ===');
}

main().catch(err => {
  console.error('\n✗ 致命的エラー:');
  if (err.response) {
    console.error('  HTTP', err.response.status, err.response.statusText);
    console.error('  body:', JSON.stringify(err.response.data, null, 2));
  } else {
    console.error('  ' + err.message);
  }
  if (err.stack) console.error('\n' + err.stack);
  process.exit(1);
});
