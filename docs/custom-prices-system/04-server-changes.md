# 04. order-system / server.js 改修詳細

このファイルでは、order-system（Node.js / Express）の改修内容を定義します。

**実装に着手する前に、必ずこのファイル全体を読んでください。**

---

## 1. 改修サマリー

| 対象 | 種別 | 改修内容 |
|---|---|---|
| `server.js` | 既存 | 価格決定ロジック改修・一括取得方式導入 |
| `routes/pricing.js` | **新規** | 価格決定ロジックを別モジュールに分離（推奨）|
| `routes/sheets-client.js` | **新規** | Google Sheets 読み取りユーティリティ |
| `.env.development` | **新規** | 開発環境変数 |
| `.env.production` | **新規/既存** | 本番環境変数 |
| `package.json` | 既存 | 依存関係追加（必要に応じて）|

**ブランチ：** `feature/custom-prices`

---

## 2. 全体フロー

```
[QRコード注文受信] POST /api/scan-order
   ↓
[Step 1] 注文データ検証
   ↓
[Step 2] 一括取得（Custom Prices, Client list, Item List, Cost Reference）
   ↓
[Step 3] 各SKUに対して価格決定
   ├ 商品の販売単位を判定（I列 - 量り売り or 定量売り）
   ├ ベース価格を決定（J列 or K列）
   ├ Price Group による調整
   │   ├ Standard → ベース価格
   │   ├ Group A  → ベース価格 × 1.015
   │   └ Individual → Custom Prices 検索 → 無ければベース価格
   ↓
[Step 4] インボイスデータ構築
   ↓
[Step 5] QBO送信（or dry-run）
   ↓
[Step 6] order-system record に記録
   ↓
[Step 7] レスポンス返却
```

---

## 3. 環境変数の設定

### 3-1. `.env.development`（新規作成）

```env
# 開発環境
NODE_ENV=development

# 開発用スプレッドシートID（コピー作成後に記入）
COST_LIST_ID=YOUR_DEV_COST_LIST_ID
ITEM_LIST_ID=YOUR_DEV_ITEM_LIST_ID
CLIENT_INFO_ID=YOUR_DEV_CLIENT_INFO_ID
ORDER_RECORD_ID=YOUR_DEV_ORDER_RECORD_ID

# シート名
ITEM_LIST_SHEET=商品一覧
CLIENT_LIST_SHEET=Client list
CUSTOM_PRICES_SHEET=Custom Prices
COST_REFERENCE_SHEET=Cost Reference

# QBOモード
QBO_MODE=dry-run

# QBO認証（開発時は本番のものを流用可、dry-runで送信されないため安全）
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
QBO_REALM_ID=...
QBO_BASE_URL=https://quickbooks.api.intuit.com

# Google認証
GOOGLE_SERVICE_ACCOUNT_KEY=path/to/key.json
# または環境変数として直接JSON文字列を渡す

# アラート送信先
ALERT_EMAIL=ordercfp@gmail.com
```

### 3-2. `.env.production`（既存または新規）

```env
# 本番環境
NODE_ENV=production

# 本番スプレッドシートID
COST_LIST_ID=1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k
ITEM_LIST_ID=14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc
CLIENT_INFO_ID=1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8
ORDER_RECORD_ID=1Qi7IuVjksPQa3wv_YIid_UCHaHYmmmyBH3oT8BJKLIk

# シート名（本番でも同じ）
ITEM_LIST_SHEET=商品一覧
CLIENT_LIST_SHEET=Client list
CUSTOM_PRICES_SHEET=Custom Prices
COST_REFERENCE_SHEET=Cost Reference

# QBOモード
QBO_MODE=production

# QBO認証（本番）
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
QBO_REALM_ID=...
QBO_BASE_URL=https://quickbooks.api.intuit.com

# Google認証
GOOGLE_SERVICE_ACCOUNT_KEY=...

# アラート送信先
ALERT_EMAIL=ordercfp@gmail.com
```

### 3-3. 起動時の環境ファイル切替

`server.js` の冒頭で以下のように切り替え：

```javascript
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';
require('dotenv').config({ path: envFile });
```

### 3-4. `.gitignore` への追加

```
.env.development
.env.production
.env
```

→ 環境変数ファイルは Git にコミットしない。

---

## 4. 新規ファイル：`routes/sheets-client.js`

### 4-1. ファイルの役割

Google Sheets からデータを読み取るためのユーティリティ関数を提供します。**全ての改修対象シートを一括取得**できるように設計します。

### 4-2. 完全実装

```javascript
/**
 * routes/sheets-client.js - Google Sheets 読み取りユーティリティ
 *
 * 役割：
 * - Custom Prices / Client list / Item List / Cost Reference の読み取り
 * - リトライ機能付き
 */

const { google } = require('googleapis');

// Google Sheets API クライアント（既存の認証方法を流用）
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    // 既存のサービスアカウントキーパスを使用
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * 汎用：指定範囲を読み取り、リトライ付き
 */
async function readRangeWithRetry(spreadsheetId, range, maxRetries = 3) {
  const sheets = getSheetsClient();
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      return res.data.values || [];
    } catch (err) {
      lastError = err;
      console.error(`[sheets-client] ${spreadsheetId} ${range} attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        const waitMs = Math.pow(3, attempt - 1) * 1000; // 1秒, 3秒, 9秒
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw new Error(`readRange failed after ${maxRetries} retries: ${lastError.message}`);
}

/**
 * Custom Prices 全件読み取り
 * @return {Array} [{ customerId, customerName, sku, itemName, price, updateDate, note }, ...]
 */
async function loadAllCustomPrices() {
  const range = `${process.env.CUSTOM_PRICES_SHEET}!A2:G`;
  const rows = await readRangeWithRetry(process.env.COST_LIST_ID, range);
  return rows
    .filter(r => r[0] && r[2] && r[4]) // Customer ID, SKU, Price必須
    .map(r => ({
      customerId: normalizeId(r[0]),
      customerName: String(r[1] || '').trim(),
      sku: String(r[2]).trim(),
      itemName: String(r[3] || '').trim(),
      price: Number(r[4]),
      updateDate: r[5] || null,
      note: String(r[6] || ''),
    }));
}

/**
 * Client list 全件読み取り
 * @return {Array} [{ customerId, customerName, priceGroup, markup }, ...]
 */
async function loadAllClients() {
  // A列〜Y列（25列）まで読む
  const range = `${process.env.CLIENT_LIST_SHEET}!A2:Y`;
  const rows = await readRangeWithRetry(process.env.CLIENT_INFO_ID, range);
  return rows
    .filter(r => r[0]) // Customer ID 必須
    .map(r => ({
      customerId: normalizeId(r[0]),
      customerName: String(r[1] || '').trim(), // ※ B列が顧客名と仮定。実際の列に合わせて調整
      // ...他の既存列はここでは省略...
      priceGroup: String(r[23] || 'Standard').trim(), // X列（0-indexed: 23）
      markup: Number(r[24]) || 0,                       // Y列（0-indexed: 24）
    }));
}

/**
 * Item List 全件読み取り
 * @return {Array} [{ sku, itemName, isUnit, priceLb, priceUnit, basePrice }, ...]
 */
async function loadAllItems() {
  // 商品一覧はヘッダーが4行目なのでデータは5行目から
  const range = `${process.env.ITEM_LIST_SHEET}!A5:K`;
  const rows = await readRangeWithRetry(process.env.ITEM_LIST_ID, range);
  return rows
    .filter(r => r[0]) // SKU 必須
    .map(r => {
      const sku = String(r[0]).trim();
      const itemName = String(r[3] || '').trim(); // D列
      const isUnit = r[8] === true || r[8] === 'TRUE'; // I列（チェックボックス）
      const priceLb = Number(r[9]) || 0;   // J列
      const priceUnit = Number(r[10]) || 0; // K列
      return {
        sku,
        itemName,
        isUnit,
        priceLb,
        priceUnit,
        basePrice: isUnit ? priceUnit : priceLb,
      };
    });
}

/**
 * Cost Reference 全件読み取り（任意・ログ用）
 * @return {Array} [{ sku, eachCost, lbsCost, vendor, updateDate }, ...]
 */
async function loadAllCostReferences() {
  const range = `${process.env.COST_REFERENCE_SHEET}!A2:E`;
  try {
    const rows = await readRangeWithRetry(process.env.COST_LIST_ID, range);
    return rows
      .filter(r => r[0])
      .map(r => ({
        sku: String(r[0]).trim(),
        eachCost: Number(r[1]) || 0,
        lbsCost: Number(r[2]) || 0,
        vendor: String(r[3] || '').trim(),
        updateDate: r[4] || null,
      }));
  } catch (err) {
    console.warn('[sheets-client] Cost Reference 読み込み失敗（処理は継続）:', err.message);
    return [];
  }
}

/**
 * Customer IDを3桁ゼロ埋めに正規化
 */
function normalizeId(id) {
  const num = parseInt(String(id).replace(/\D/g, ''), 10);
  if (isNaN(num)) return String(id);
  return ('000' + num).slice(-3);
}

module.exports = {
  loadAllCustomPrices,
  loadAllClients,
  loadAllItems,
  loadAllCostReferences,
  normalizeId,
};
```

### 4-3. 関数一覧

| 関数 | 用途 | 戻り値 |
|---|---|---|
| `loadAllCustomPrices()` | Custom Prices 全件取得 | Array |
| `loadAllClients()` | Client list 全件取得 | Array |
| `loadAllItems()` | Item List 全件取得 | Array |
| `loadAllCostReferences()` | Cost Reference 全件取得（任意）| Array |
| `normalizeId(id)` | Customer ID 正規化 | String |
| `readRangeWithRetry()` | 汎用読み取り（3回リトライ）| Array |

### 4-4. 重要な注意点

1. **Client list の列番号は要確認**
   - 上記コードでは `customerName` を **B列（index 1）** と仮定
   - 実際の Client list で異なる場合は調整が必要
   - X列（Price Group）= index 23、Y列（Markup）= index 24 は確定

2. **Item List のヘッダー行は4行目**
   - データは5行目から開始

3. **リトライ間隔は指数バックオフ**
   - 1秒 → 3秒 → 9秒

---

## 5. 新規ファイル：`routes/pricing.js`

### 5-1. ファイルの役割

価格決定ロジックを **server.js から分離**し、テストしやすい純粋関数として定義します。

### 5-2. 完全実装

```javascript
/**
 * routes/pricing.js - 価格決定ロジック
 *
 * 役割：
 * - Customer ID + SKU + 商品データ + Custom Prices + Client list を入力に、
 *   インボイス単価を決定する純粋関数群
 */

const { normalizeId } = require('./sheets-client');

const GROUP_A_MARKUP = 0.015; // 1.5%

/**
 * 価格決定のメイン関数
 *
 * @param {string} customerId - Customer ID（3桁ゼロ埋め前でもOK、内部で正規化）
 * @param {string} sku - SKU
 * @param {Array} clients - Client list 全件
 * @param {Array} items - Item List 全件
 * @param {Array} customPrices - Custom Prices 全件
 *
 * @return {Object} {
 *   sku, customerId, priceGroup, basePrice, finalPrice, isUnit,
 *   source: 'custom' | 'group-a' | 'standard' | 'fallback',
 *   item, warning
 * }
 */
function determinePrice({ customerId, sku, clients, items, customPrices }) {
  const normId = normalizeId(customerId);
  const item = items.find(i => i.sku === sku);

  if (!item) {
    return {
      sku, customerId: normId,
      finalPrice: 0,
      source: 'error',
      warning: `SKU ${sku} が Item List に見つかりません`,
    };
  }

  const client = clients.find(c => c.customerId === normId);
  const priceGroup = client ? client.priceGroup : 'Standard';
  const basePrice = item.basePrice;

  // Individual → Custom Prices検索
  if (priceGroup === 'Individual') {
    const cp = customPrices.find(p => p.customerId === normId && p.sku === sku);
    if (cp && cp.price > 0) {
      return {
        sku, customerId: normId, priceGroup,
        basePrice, finalPrice: cp.price,
        isUnit: item.isUnit,
        source: 'custom',
        item,
        note: cp.note || null,
      };
    }
    // 見つからない → Standard扱いでフォールバック
    return {
      sku, customerId: normId, priceGroup,
      basePrice, finalPrice: basePrice,
      isUnit: item.isUnit,
      source: 'fallback',
      item,
      warning: `Customer ${normId} は Individual ですが、SKU ${sku} の Custom Price が未登録のため Standard を使用`,
    };
  }

  // Group A → +1.5%
  if (priceGroup === 'Group A') {
    const adjusted = roundPrice(basePrice * (1 + GROUP_A_MARKUP));
    return {
      sku, customerId: normId, priceGroup,
      basePrice, finalPrice: adjusted,
      isUnit: item.isUnit,
      source: 'group-a',
      item,
    };
  }

  // Standard
  return {
    sku, customerId: normId, priceGroup: 'Standard',
    basePrice, finalPrice: basePrice,
    isUnit: item.isUnit,
    source: 'standard',
    item,
  };
}

/**
 * 価格を小数点以下2桁に丸める
 */
function roundPrice(price) {
  return Math.round(price * 100) / 100;
}

/**
 * 注文全体（複数SKU）の価格決定をまとめて実行
 *
 * @param {Object} order - { customerId, items: [{ sku, qty }, ...] }
 * @param {Object} dataSources - { clients, items, customPrices }
 * @return {Array} [{ sku, qty, ...determinedPrice }, ...]
 */
function determinePricesForOrder(order, dataSources) {
  const { customerId, items: orderItems } = order;
  const { clients, items, customPrices } = dataSources;

  return orderItems.map(orderItem => {
    const decided = determinePrice({
      customerId,
      sku: orderItem.sku,
      clients, items, customPrices,
    });
    return {
      ...decided,
      qty: orderItem.qty,
      lineTotal: roundPrice(decided.finalPrice * orderItem.qty),
    };
  });
}

module.exports = {
  determinePrice,
  determinePricesForOrder,
  roundPrice,
  GROUP_A_MARKUP,
};
```

### 5-3. 関数一覧

| 関数 | 役割 |
|---|---|
| `determinePrice()` | 1つのSKUに対する価格決定 |
| `determinePricesForOrder()` | 注文全体の価格決定（複数SKU）|
| `roundPrice(price)` | 小数点以下2桁丸め |

### 5-4. テスト容易性

このモジュールは純粋関数なので、ユニットテストが容易です：

```javascript
// テスト例
const { determinePrice } = require('./routes/pricing');

const clients = [{ customerId: '011', customerName: 'BENI', priceGroup: 'Individual' }];
const items = [{ sku: 'B033', itemName: 'Beef Short Rib', isUnit: false, priceLb: 25.80, priceUnit: 0, basePrice: 25.80 }];
const customPrices = [{ customerId: '011', sku: 'B033', price: 22.50 }];

const result = determinePrice({ customerId: '011', sku: 'B033', clients, items, customPrices });
console.log(result);
// { finalPrice: 22.50, source: 'custom', ... }
```

---

## 6. `server.js` の改修

### 6-1. 改修方針

- 既存の `/api/scan-order` または `/api/create-invoice` エンドポイントを改修
- **一括取得方式**を導入
- **価格決定ロジックを `routes/pricing.js` から呼び出し**
- **dry-runモード**を実装
- **エラーハンドリング**を強化

### 6-2. 改修対象エンドポイント

`server.js` の既存コードを完全に置き換えるのではなく、**価格決定部分のみを改修**します。

#### 改修前（イメージ）

```javascript
// 既存コード（イメージ）
app.post('/api/create-invoice', async (req, res) => {
  const orderData = req.body;
  // 注文の各SKUに対して、QBO商品マスターのUnitPriceをそのまま使用
  for (const item of orderData.items) {
    const qboItem = await fetchQboItem(item.sku);
    item.rate = qboItem.UnitPrice; // ← ここを改修
  }
  const invoiceId = await createQboInvoice(orderData);
  res.json({ invoiceId });
});
```

#### 改修後（イメージ）

```javascript
const { loadAllCustomPrices, loadAllClients, loadAllItems } = require('./routes/sheets-client');
const { determinePricesForOrder } = require('./routes/pricing');

app.post('/api/create-invoice', async (req, res) => {
  const orderData = req.body;

  try {
    // 一括取得
    const [customPrices, clients, items] = await Promise.all([
      loadAllCustomPrices(),
      loadAllClients(),
      loadAllItems(),
    ]);

    // 価格決定
    const pricedItems = determinePricesForOrder(
      { customerId: orderData.customerId, items: orderData.items },
      { customPrices, clients, items }
    );

    // インボイスデータ構築
    const invoiceData = buildInvoicePayload(orderData, pricedItems);

    // QBOへ送信（or dry-run）
    const result = await createInvoiceInQBO(invoiceData);

    // 警告があればメール通知
    const warnings = pricedItems.filter(p => p.warning).map(p => p.warning);
    if (warnings.length > 0) {
      await sendAlertEmail('価格決定で警告あり', warnings.join('\n'));
    }

    // order-system record に記録
    await logToOrderRecord(orderData, pricedItems, result);

    res.json({
      success: true,
      invoiceId: result.invoiceId || result.mockInvoiceId,
      dryRun: result.dryRun || false,
      items: pricedItems.map(p => ({
        sku: p.sku, finalPrice: p.finalPrice, source: p.source
      })),
    });
  } catch (err) {
    console.error('[/api/create-invoice] Error:', err);
    await sendAlertEmail('インボイス作成失敗', err.message + '\n' + err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

### 6-3. ヘルパー関数

#### `buildInvoicePayload()`

```javascript
/**
 * QBO Invoice ペイロード構築
 * @param {Object} order 注文データ
 * @param {Array} pricedItems determinePricesForOrder の結果
 * @return {Object} QBO API 用のインボイスペイロード
 */
function buildInvoicePayload(order, pricedItems) {
  return {
    CustomerRef: { value: getQboCustomerId(order.customerId) },
    Line: pricedItems.map((p, idx) => ({
      LineNum: idx + 1,
      DetailType: 'SalesItemLineDetail',
      Amount: p.lineTotal,
      Description: `${p.sku} - ${p.item.itemName}` + (p.source === 'custom' ? ' [Custom Price]' : ''),
      SalesItemLineDetail: {
        ItemRef: { value: getQboItemId(p.sku) },
        Qty: p.qty,
        UnitPrice: p.finalPrice,
      },
    })),
    // PrivateNote にメモを残す
    PrivateNote: buildPrivateNote(pricedItems),
  };
}

function buildPrivateNote(pricedItems) {
  const lines = pricedItems.map(p => {
    let line = `${p.sku}: ${p.source} → $${p.finalPrice}`;
    if (p.source === 'custom' && p.note) line += ` (${p.note})`;
    return line;
  });
  return lines.join('\n');
}
```

#### `createInvoiceInQBO()`

```javascript
/**
 * QBO へインボイス送信（dry-run対応）
 */
async function createInvoiceInQBO(invoiceData) {
  if (process.env.QBO_MODE === 'dry-run') {
    console.log('[DRY-RUN] Would create QBO Invoice:');
    console.log(JSON.stringify(invoiceData, null, 2));
    return {
      dryRun: true,
      mockInvoiceId: 'DRY-' + Date.now(),
      status: 'simulated',
    };
  }

  // 本番モード: 実際にQBO APIを呼ぶ
  return await qboCreateInvoiceWithRetry(invoiceData);
}

async function qboCreateInvoiceWithRetry(invoiceData, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${process.env.QBO_BASE_URL}/v3/company/${process.env.QBO_REALM_ID}/invoice`,
        invoiceData,
        { headers: await getQboHeaders() }
      );
      return {
        dryRun: false,
        invoiceId: response.data.Invoice.Id,
        status: 'created',
      };
    } catch (err) {
      lastError = err;
      console.error(`[QBO] attempt ${attempt} failed:`, err.response?.data || err.message);
      if (attempt < maxRetries && isRetryable(err)) {
        const waitMs = Math.pow(3, attempt - 1) * 1000;
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        break;
      }
    }
  }
  throw new Error(`QBO Invoice creation failed: ${lastError.message}`);
}

function isRetryable(err) {
  const status = err.response?.status;
  // ネットワークエラー or 5xx系のみリトライ
  return !status || (status >= 500 && status < 600);
}
```

#### `sendAlertEmail()`

```javascript
const nodemailer = require('nodemailer'); // 既存の設定を流用

async function sendAlertEmail(subject, body) {
  try {
    // 既存のGmail設定を使用
    await sendGmail({
      to: process.env.ALERT_EMAIL,
      subject: `[order-system] ${subject}`,
      body: body,
    });
  } catch (err) {
    console.error('[Alert] 送信失敗:', err);
  }
}
```

#### `logToOrderRecord()`

```javascript
/**
 * order-system record に処理結果を記録
 */
async function logToOrderRecord(order, pricedItems, result) {
  const rows = pricedItems.map(p => [
    new Date(),                  // A: Order Date
    order.deliveryDate || '',    // B: Delivery Date
    order.customerId,            // C: Customer ID
    order.customerName,          // D: Customer Name
    p.sku,                       // E: SKU
    p.item.itemName,             // F: Item Name
    p.qty,                       // G: Quantity
    `${p.source} $${p.finalPrice}` + (result.dryRun ? ' [DRY-RUN]' : ''), // H: Note
  ]);
  // 既存のシート書き込み関数を呼ぶ
  await appendToOrderRecord(rows);
}
```

---

## 7. キャッシュ戦略（推奨：将来追加）

現状の一括取得方式で十分速いですが、注文が増えてきた場合は**サーバー側メモリキャッシュ**を追加することで更に高速化できます。

```javascript
// 将来追加例（現状は実装不要）
let cache = {
  customPrices: null,
  clients: null,
  items: null,
  timestamp: 0,
};
const CACHE_TTL = 5 * 60 * 1000; // 5分

async function loadDataSourcesWithCache() {
  const now = Date.now();
  if (cache.customPrices && (now - cache.timestamp) < CACHE_TTL) {
    return { customPrices: cache.customPrices, clients: cache.clients, items: cache.items };
  }
  const [customPrices, clients, items] = await Promise.all([
    loadAllCustomPrices(), loadAllClients(), loadAllItems(),
  ]);
  cache = { customPrices, clients, items, timestamp: now };
  return { customPrices, clients, items };
}
```

**現在の実装方針：キャッシュなし**（価格変更の即時反映を優先）

---

## 8. エラーハンドリング詳細

| エラー種別 | 対応 | 通知 |
|---|---|---|
| **Customer ID が Client list に無い** | Standardとして処理 | 警告メール送信 |
| **SKU が Item List に無い** | 該当行をスキップ・処理継続 | エラーメール送信 |
| **Custom Prices 読み取り失敗** | Standardにフォールバック | エラーメール送信 |
| **Sheets API ネットワークエラー** | 3回リトライ（指数バックオフ）| 全失敗時にエラーメール |
| **QBO API エラー** | 3回リトライ（5xxのみ）| エラーメール＋order-system recordに「失敗」記録 |
| **QBO トークン期限切れ** | 自動リフレッシュ（既存処理）| なし |
| **数値計算エラー（NaN等）** | 該当行をスキップ・処理継続 | エラーメール |

### 8-1. 共通エラーハンドラ

```javascript
async function safeHandler(fn, errorContext) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${errorContext}]`, err);
    await sendAlertEmail(`Error: ${errorContext}`, err.message + '\n' + err.stack);
    throw err;
  }
}
```

---

## 9. デプロイ手順

### Step 1：ブランチ作成・依存追加

```bash
cd order-system
git checkout main
git pull origin main
git checkout -b feature/custom-prices
npm install dotenv  # まだなら
```

### Step 2：新規ファイルを作成

```bash
mkdir -p routes
touch routes/pricing.js
touch routes/sheets-client.js
touch .env.development
touch .env.production
```

→ それぞれに本ファイルのコードを記述。

### Step 3：環境変数ファイルを設定

`.env.development` に開発用スプレッドシートIDを記入。

### Step 4：server.js を改修

`/api/create-invoice` および関連エンドポイントを上記サンプルに従って改修。

### Step 5：ローカル動作確認

```bash
NODE_ENV=development node server.js
```

→ 別ターミナルからcurlでテスト：

```bash
curl -X POST http://localhost:3000/api/create-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "011",
    "customerName": "BENI HOLLYWOOD",
    "items": [
      { "sku": "B033", "qty": 5 }
    ]
  }'
```

→ レスポンスに `dryRun: true` が含まれることを確認。
→ コンソールに `[DRY-RUN]` ログが出ることを確認。
→ 開発用 order-system record にも記録されることを確認。

### Step 6：本番デプロイ準備

開発完了後：

```bash
git add .
git commit -m "feat: custom prices integration"
git push origin feature/custom-prices
# GitHubでPR作成、レビュー後 main へマージ
```

Render側で `.env.production` をデプロイ環境変数として設定し、自動デプロイ。

---

## 10. テスト項目（フェーズ4完了確認）

`feature/custom-prices` ブランチで以下を確認：

- [ ] 一括取得が成功する（Custom Prices / Client / Items）
- [ ] Standard顧客の注文 → Item List J列 or K列の価格が反映される
- [ ] Group A顧客の注文 → ベース価格 × 1.015 が反映される
- [ ] Individual顧客（Custom Price あり）→ Custom Price が反映される
- [ ] Individual顧客（Custom Price なし）→ ベース価格にフォールバック
- [ ] 量り売り商品 → J列の単価が使われる
- [ ] 定量売り商品 → K列の単価が使われる
- [ ] dry-runモードで QBO へ実送信されない
- [ ] エラー時にメール通知が届く
- [ ] order-system record に処理状況が記録される
- [ ] Sheets API リトライが正常動作する（一時的にネットワーク切断で試す）
- [ ] QBO Customer ID マッピングが正常動作する

---

## 11. 実装把握チェックリスト

このファイルを読み終わったら、以下を確認してください：

- [ ] 環境変数を `.env.development` と `.env.production` で分けて管理することを理解した
- [ ] 一括取得方式の意味とメリットを理解した
- [ ] `routes/pricing.js` が純粋関数で構成されていることを理解した
- [ ] dry-runモードでQBOへ送信されないことを理解した
- [ ] エラー時のフォールバック・通知の流れを理解した
- [ ] テスト項目12項目を確認することを理解した

OKならば **05-migration-script.md** に進んでください。
