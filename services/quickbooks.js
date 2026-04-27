/**
 * QuickBooks Online API client
 *
 * Loads tokens from tokens.json, auto-refreshes the access token when expired,
 * and provides helpers to find Customers/Items and create Invoices.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const TOKENS_PATH = path.join(__dirname, '..', 'tokens.json');
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

// ─── Token management ────────────────────────────────────────────────────────

function loadTokens() {
  if (!fs.existsSync(TOKENS_PATH)) {
    throw new Error('tokens.json not found. Run: node src/auth-qbo.js');
  }
  return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function isExpired(tokens) {
  const created = new Date(tokens.created_at).getTime();
  const expiresAt = created + (tokens.expires_in - 300) * 1000; // refresh 5 min early
  return Date.now() >= expiresAt;
}

async function refreshAccessToken(tokens) {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('QBO_CLIENT_ID / QBO_CLIENT_SECRET missing from .env');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  }).toString();

  return new Promise((resolve, reject) => {
    const reqUrl = new URL(TOKEN_URL);
    const options = {
      hostname: reqUrl.hostname,
      path: reqUrl.pathname,
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          reject(new Error(`Token refresh failed: ${parsed.error} — ${parsed.error_description}`));
        } else {
          const updated = {
            ...tokens,
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token || tokens.refresh_token,
            expires_in: parsed.expires_in,
            x_refresh_token_expires_in: parsed.x_refresh_token_expires_in,
            created_at: new Date().toISOString(),
          };
          saveTokens(updated);
          console.log('  [QBO] Access token refreshed.');
          resolve(updated);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getValidTokens() {
  let tokens = loadTokens();
  if (isExpired(tokens)) {
    console.log('  [QBO] Access token expired — refreshing...');
    tokens = await refreshAccessToken(tokens);
  }
  return tokens;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function qboRequest({ method, path: reqPath, body, accessToken, realmId, sandbox }) {
  const baseHost = sandbox
    ? 'sandbox-quickbooks.api.intuit.com'
    : 'quickbooks.api.intuit.com';

  const bodyStr = body ? JSON.stringify(body) : '';

  return new Promise((resolve, reject) => {
    const options = {
      hostname: baseHost,
      path: reqPath,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const fault = parsed?.Fault?.Error?.[0];
            const msg = fault
              ? `${fault.code}: ${fault.Message} — ${fault.Detail}`
              : `HTTP ${res.statusCode}: ${data}`;
            reject(new Error(`QBO API error: ${msg}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse QBO response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── QBO query helper ────────────────────────────────────────────────────────

async function qboQuery(sql, tokens) {
  const encoded = encodeURIComponent(sql);
  return qboRequest({
    method: 'GET',
    path: `/v3/company/${tokens.realm_id}/query?query=${encoded}&minorversion=65`,
    accessToken: tokens.access_token,
    realmId: tokens.realm_id,
    sandbox: tokens.sandbox,
  });
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Find a QBO Customer by DisplayName.
 * Returns { Id, DisplayName } or throws if not found.
 */
async function findCustomerByName(displayName) {
  const tokens = await getValidTokens();
  // Escape single quotes for QBO query
  const escaped = displayName.replace(/'/g, "\\'");
  const result = await qboQuery(
    `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${escaped}'`,
    tokens
  );
  const customers = result?.QueryResponse?.Customer;
  if (!customers || customers.length === 0) {
    throw new Error(
      `QBO Customer not found: "${displayName}". ` +
      `Make sure the DisplayName in QBO matches exactly.`
    );
  }
  return customers[0];
}

/**
 * Find a QBO Item strictly by SKU field.
 * Fetches all items and matches in code (QBO query API does not support WHERE on Sku).
 * Returns { Id, Name, Sku } or throws if not found.
 */
async function findItemBySku(sku) {
  console.log(`--- [Debug] Looking up QBO Items for SKU: "${sku}" ---`);
  const tokens = await getValidTokens();

  const result = await qboQuery(
    `SELECT Id, Name, Sku FROM Item MAXRESULTS 1000`,
    tokens
  );
  
  // 1. QBOから返ってきた生のデータを確認
  console.log('DEBUG: QBO Raw Response:', JSON.stringify(result, null, 2));

  const items = result?.QueryResponse?.Item || [];
  
  // 2. QBOから取得した商品リストを1つずつ表示
  console.log('--- [Debug] QBO Item List Start ---');
  if (items.length === 0) {
    console.log('警告: QBOから商品が1つも取得できていません。');
  }
  items.forEach(it => {
    console.log(`[QBOデータ] ID: ${it.Id} | Name: "${it.Name}" | SKU: "${it.Sku || ''}"`);
  });
  console.log('--- [Debug] QBO Item List End ---');

  const match = items.find(item => {
    const s = (item.Sku || "").toLowerCase();
    const n = (item.Name || "").toLowerCase();
    const search = sku.toLowerCase();
    return s === search || n.includes(search);
  });

  if (!match) {
    throw new Error(
      `QBO Item not found for SKU "${sku}". ` +
      `Ensure the item exists in QBO with Sku="${sku}" or a Name containing "${sku}".`
    );
  }

  console.log(`--- [Debug] Found Match: "${match.Name}" (ID: ${match.Id}) ---`);
  return match;
}


/**
 * Create an Invoice in QuickBooks Online.
 *
 * @param {object} opts
 * @param {string} opts.customerId       - QBO Customer Id
 * @param {string} opts.customerName     - QBO Customer DisplayName
 * @param {string} opts.deliveryDate     - ISO date "YYYY-MM-DD" used as TxnDate
 * @param {string} opts.docNumber        - Optional invoice/doc number
 * @param {Array}  opts.lines            - [{ itemId, itemName, sku, qty, description }]
 */
async function createInvoice({ customerId, customerName, deliveryDate, docNumber, lines }) {
  const tokens = await getValidTokens();

  const lineItems = lines.map((line, i) => ({
    Id: String(i + 1),
    LineNum: i + 1,
    Description: `${line.sku} — ${line.description}`,
    Amount: 0,
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      ItemRef: { value: line.itemId, name: line.itemName },
      Qty: line.qty,
    },
  }));

  const payload = {
    Line: lineItems,
    CustomerRef: { value: customerId, name: customerName },
    TxnDate: deliveryDate,
    ...(docNumber ? { DocNumber: docNumber } : {}),
    PrivateNote: 'Created by meat-order-system',
  };

  const response = await qboRequest({
    method: 'POST',
    path: `/v3/company/${tokens.realm_id}/invoice?minorversion=65`,
    body: payload,
    accessToken: tokens.access_token,
    realmId: tokens.realm_id,
    sandbox: tokens.sandbox,
  });

  return response.Invoice;
}

module.exports = { findCustomerByName, findItemBySku, createInvoice };
