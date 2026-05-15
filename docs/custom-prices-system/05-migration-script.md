# 05. 初期データ移行スクリプト

このファイルでは、QBOのPrice Levelsから現在の個別価格を取得し、Custom Pricesシートに投入する**使い捨てスクリプト**の仕様を定義します。

**実装に着手する前に、必ずこのファイル全体を読んでください。**

---

## 1. 目的とスコープ

### 目的

Individual分類の15社の個別単価を、QBO側の **PriceLevel エンティティ** から取得して、開発用 Custom Prices シートに自動投入します。

### スコープ

- 対象：**Per item 形式（商品ごとに固定単価）の Price Level のみ**
- 対象外：Fixed % 形式（Group Aの+2.00%等）→ こちらはロジックで処理するため移行不要
- **使い捨てスクリプト**：1回実行したら破棄前提（ただし再実行可能な設計にする）

### 前提

- Group A の12社（Jinya Group）は Fixed +2.00% で QBO 登録されている → 移行スコープ外
- Individual の15社は Per item で QBO 登録されている → これを取得

---

## 2. スクリプトの配置と実行方法

### 2-1. 配置場所

`order-system` リポジトリ内に**使い捨て用ディレクトリ**を作成：

```
order-system/
├── scripts/
│   └── migrate-price-levels.js   ← 新規作成
└── ...
```

### 2-2. 実行方法

```bash
cd order-system
NODE_ENV=development node scripts/migrate-price-levels.js
```

### 2-3. 完了後の扱い

- スクリプトを実行して CSV を出力
- CSV内容を確認・調整
- Custom Pricesシートに投入完了したら、**`scripts/migrate-price-levels.js` を削除**（or `.gitignore` で除外）

---

## 3. スクリプトの動作フロー

```
[1] 環境変数読み込み (.env.development)
   ↓
[2] QBOトークン取得（既存 order-system の認証処理を流用）
   ↓
[3] QBO API で PriceLevel 全件取得
   ↓
[4] PerItem 形式のものだけ抽出
   ↓
[5] 各 Price Level に紐づく Customer 情報を取得
   ↓
[6] 各 Price Level の SalesItemBasis（商品ごと単価）を取得
   ↓
[7] Customer ID / SKU をマッピング
   - QBO Customer ID → Client list の Customer ID（3桁ゼロ埋め）
   - QBO Item ID → Item List の SKU
   ↓
[8] CSV ファイルとして出力（scripts/output/migrated_prices.csv）
   ↓
[9] サマリー表示（移行件数・マッピング失敗件数）
```

---

## 4. 完全実装

```javascript
/**
 * scripts/migrate-price-levels.js
 *
 * QBO の PriceLevel から Per Item 形式の個別単価を取得し、
 * Custom Prices シートに投入するためのCSVを生成する。
 *
 * 使い捨てスクリプト（実行後は削除前提）
 *
 * 実行方法:
 *   NODE_ENV=development node scripts/migrate-price-levels.js
 */

const path = require('path');
const fs = require('fs');
const axios = require('axios');

// 環境変数読み込み
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '..', envFile) });

const { loadAllClients, loadAllItems } = require('../routes/sheets-client');

// QBO API設定
const QBO_BASE_URL = process.env.QBO_BASE_URL || 'https://quickbooks.api.intuit.com';
const QBO_REALM_ID = process.env.QBO_REALM_ID;

// 出力先
const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'migrated_prices.csv');

// ============================================================
// メイン処理
// ============================================================

async function main() {
  console.log('=== QBO Price Levels Migration ===\n');

  // QBOトークン取得（既存処理を流用）
  const accessToken = await getQboAccessToken();
  console.log('✓ QBO アクセストークン取得完了');

  // QBO から PriceLevel 全件取得
  const priceLevels = await fetchAllPriceLevels(accessToken);
  console.log(`✓ QBO Price Level 取得: ${priceLevels.length} 件`);

  // PerItem 形式のみ抽出
  const perItemLevels = priceLevels.filter(pl => pl.PriceLevelPerItem && pl.PriceLevelPerItem.length > 0);
  console.log(`✓ Per Item 形式: ${perItemLevels.length} 件`);
  console.log(`  （Fixed % 形式は対象外: ${priceLevels.length - perItemLevels.length} 件をスキップ）`);

  // QBO Customer 全件取得（マッピング用）
  const qboCustomers = await fetchAllCustomers(accessToken);
  console.log(`✓ QBO Customer 取得: ${qboCustomers.length} 件`);

  // QBO Item 全件取得（マッピング用）
  const qboItems = await fetchAllItems(accessToken);
  console.log(`✓ QBO Item 取得: ${qboItems.length} 件`);

  // Client list と Item List を Sheets から取得
  const clients = await loadAllClients();
  const items = await loadAllItems();
  console.log(`✓ Client list: ${clients.length} 件 / Item List: ${items.length} 件\n`);

  // マッピング処理
  const csvRows = [];
  const unmappedCustomers = [];
  const unmappedSkus = [];

  for (const pl of perItemLevels) {
    // QBO Customer ID から Customer 情報を取得
    // PriceLevel に直接 Customer が紐づいているか、Customer.SalesTermRef などから取得
    // 注: QBOのPriceLevel構造は環境により異なるため、実際のレスポンス構造を確認すること
    const qboCustomer = findCustomerByPriceLevelId(qboCustomers, pl.Id);
    if (!qboCustomer) {
      console.warn(`  ⚠ PriceLevel ID ${pl.Id} に紐づくCustomerが見つかりません`);
      continue;
    }

    // QBO Customer 名 → Client list の Customer ID にマッピング
    const matchedClient = findClientByName(clients, qboCustomer.DisplayName);
    if (!matchedClient) {
      unmappedCustomers.push({ qboName: qboCustomer.DisplayName, qboId: qboCustomer.Id });
      console.warn(`  ⚠ Customer未マッピング: ${qboCustomer.DisplayName}`);
      continue;
    }

    // 各 Price Level Item を処理
    for (const item of pl.PriceLevelPerItem) {
      const qboItem = qboItems.find(i => i.Id === item.ItemElementRef.value);
      if (!qboItem) {
        unmappedSkus.push({ qboItemId: item.ItemElementRef.value });
        continue;
      }

      // QBO Item Name → Item List の SKU にマッピング
      const matchedItem = findItemBySku(items, qboItem.Sku || qboItem.Name);
      if (!matchedItem) {
        unmappedSkus.push({ qboName: qboItem.Name, qboSku: qboItem.Sku });
        console.warn(`  ⚠ SKU未マッピング: ${qboItem.Name} (${qboItem.Sku})`);
        continue;
      }

      // CSV 1行分を構築
      const customPrice = item.CustomPrice || item.CustomAmount; // QBO仕様による
      const finalPrice = Number(customPrice);
      if (isNaN(finalPrice) || finalPrice <= 0) {
        console.warn(`  ⚠ 価格無効: ${qboCustomer.DisplayName} × ${matchedItem.sku}`);
        continue;
      }

      csvRows.push({
        customerId: matchedClient.customerId,
        customerName: matchedClient.customerName,
        sku: matchedItem.sku,
        itemName: matchedItem.itemName,
        customPrice: finalPrice,
        updateDate: formatDate(new Date()),
        note: '初期移行',
      });
    }
  }

  // CSV 出力
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  writeCsv(OUTPUT_FILE, csvRows);
  console.log(`\n✓ CSV出力完了: ${OUTPUT_FILE}`);
  console.log(`  - 移行レコード数: ${csvRows.length} 件`);
  console.log(`  - Customer未マッピング: ${unmappedCustomers.length} 件`);
  console.log(`  - SKU未マッピング: ${unmappedSkus.length} 件`);

  // 未マッピング情報を別ファイルに出力
  if (unmappedCustomers.length > 0 || unmappedSkus.length > 0) {
    const unmappedFile = path.join(OUTPUT_DIR, 'unmapped.json');
    fs.writeFileSync(unmappedFile, JSON.stringify({ unmappedCustomers, unmappedSkus }, null, 2));
    console.log(`  - 未マッピング詳細: ${unmappedFile}`);
  }

  console.log('\n=== Migration 完了 ===');
}

// ============================================================
// QBO API 呼び出し
// ============================================================

/**
 * QBOアクセストークン取得（既存処理を流用）
 */
async function getQboAccessToken() {
  // 既存の routes/qboAuth.js などから取得
  // 実装は order-system の認証処理を流用
  // 例：
  //   const { getValidAccessToken } = require('../routes/qboAuth');
  //   return await getValidAccessToken();

  // 仮実装：環境変数から直接取得（実際は既存のリフレッシュロジックを使う）
  if (process.env.QBO_ACCESS_TOKEN) return process.env.QBO_ACCESS_TOKEN;
  throw new Error('QBO アクセストークン取得方法を実装してください（routes/qboAuth.js を流用）');
}

/**
 * QBO PriceLevel 全件取得
 */
async function fetchAllPriceLevels(accessToken) {
  const url = `${QBO_BASE_URL}/v3/company/${QBO_REALM_ID}/query`;
  const query = "SELECT * FROM PriceLevel MAXRESULTS 1000";
  const res = await axios.get(url, {
    params: { query },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  return res.data.QueryResponse.PriceLevel || [];
}

/**
 * QBO Customer 全件取得
 */
async function fetchAllCustomers(accessToken) {
  const url = `${QBO_BASE_URL}/v3/company/${QBO_REALM_ID}/query`;
  const query = "SELECT * FROM Customer MAXRESULTS 1000";
  const res = await axios.get(url, {
    params: { query },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  return res.data.QueryResponse.Customer || [];
}

/**
 * QBO Item 全件取得
 */
async function fetchAllItems(accessToken) {
  const url = `${QBO_BASE_URL}/v3/company/${QBO_REALM_ID}/query`;
  const query = "SELECT * FROM Item MAXRESULTS 1000";
  const res = await axios.get(url, {
    params: { query },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  return res.data.QueryResponse.Item || [];
}

// ============================================================
// マッピングヘルパー
// ============================================================

/**
 * PriceLevel ID から Customer を特定
 * QBOの構造: Customer.SalesTermRef や Customer.PriceLevel に紐づく場合がある
 * ※ 実際のQBO構造を確認して調整すること
 */
function findCustomerByPriceLevelId(qboCustomers, priceLevelId) {
  return qboCustomers.find(c => {
    // Customer.PriceLevelRef がある場合
    if (c.PriceLevelRef && c.PriceLevelRef.value === priceLevelId) return true;
    // または、PriceLevel名で照合する場合もある
    return false;
  });
}

/**
 * QBO顧客名 → Client list 検索（あいまいマッチ）
 */
function findClientByName(clients, qboName) {
  if (!qboName) return null;
  const target = String(qboName).toLowerCase().trim();
  // 完全一致を優先
  let match = clients.find(c => c.customerName.toLowerCase().trim() === target);
  if (match) return match;
  // 前方一致
  match = clients.find(c => c.customerName.toLowerCase().trim().startsWith(target));
  if (match) return match;
  // 部分一致
  match = clients.find(c => c.customerName.toLowerCase().includes(target) || target.includes(c.customerName.toLowerCase()));
  return match || null;
}

/**
 * SKU検索
 */
function findItemBySku(items, sku) {
  if (!sku) return null;
  const target = String(sku).trim().toUpperCase();
  return items.find(i => i.sku.trim().toUpperCase() === target) || null;
}

// ============================================================
// CSV出力ヘルパー
// ============================================================

function writeCsv(filepath, rows) {
  const headers = ['Customer ID', 'Customer Name', 'SKU', 'Item Name', 'Custom Price', 'Update Date', 'Note'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.customerId),
      csvEscape(r.customerName),
      csvEscape(r.sku),
      csvEscape(r.itemName),
      r.customPrice,
      csvEscape(r.updateDate),
      csvEscape(r.note),
    ].join(','));
  }
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
}

function csvEscape(s) {
  const str = String(s || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatDate(d) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}

// ============================================================
// 実行
// ============================================================

main().catch(err => {
  console.error('\n✗ エラー発生:', err.message);
  console.error(err.stack);
  process.exit(1);
});
```

---

## 5. 出力ファイル形式

### 5-1. `scripts/output/migrated_prices.csv`

| Customer ID | Customer Name | SKU | Item Name | Custom Price | Update Date | Note |
|---|---|---|---|---|---|---|
| 011 | BENI HOLLYWOOD | B033 | Beef Short Rib | 22.50 | 5/13/2026 | 初期移行 |
| 011 | BENI HOLLYWOOD | C037 | Drumsticks | 18.00 | 5/13/2026 | 初期移行 |
| 035 | KUSHIYAKI BAR | B008 | Beef Ribeye 10oz | 14.20 | 5/13/2026 | 初期移行 |

### 5-2. `scripts/output/unmapped.json`（未マッピング情報）

```json
{
  "unmappedCustomers": [
    { "qboName": "OLD RESTAURANT LLC", "qboId": "152" }
  ],
  "unmappedSkus": [
    { "qboName": "Beef Sukiyaki Cut", "qboSku": "B099" }
  ]
}
```

→ このファイルを見て手動で対応します。

---

## 6. CSV から Custom Prices シートへの投入手順

スクリプト実行後、生成された CSV を **開発用 Custom Prices シート**に投入する方法：

### 方法A：Google Sheetsで直接インポート（推奨）

1. 開発用 Cost list を開く
2. Custom Prices シートを開く（無ければメニュー「価格管理 → 一覧を確認」で作成）
3. **A2セル**を選択
4. ファイル → インポート → アップロード → CSV選択
5. インポート場所：「**選択したセルに置換**」
6. 区切り文字：「カンマ」
7. インポート完了 → 数値・日付の書式を確認

### 方法B：手動でコピー＆ペースト

1. CSVをExcelやGoogle Sheetsで開く
2. ヘッダー行を除いてA2セルから貼り付け

### 投入後の確認

- [ ] 行数が想定通りか
- [ ] Customer ID が3桁ゼロ埋めになっているか
- [ ] SKU が Item List に存在するか
- [ ] Custom Price がすべて正数か
- [ ] Update Date が日付として認識されているか

---

## 7. 注意事項

### 7-1. QBO API の認証

スクリプト実行時に QBO アクセストークンが必要です。既存の `routes/qboAuth.js` の関数を流用してください：

```javascript
const { getValidAccessToken } = require('../routes/qboAuth');
const accessToken = await getValidAccessToken();
```

トークンが期限切れの場合、自動リフレッシュ機能を使います。

### 7-2. QBO PriceLevel の構造確認

QBOの `PriceLevel` の構造は組織によって異なる場合があります。実行前に小規模なテストで構造確認することを推奨：

```javascript
// 構造確認用の簡易スクリプト
const priceLevels = await fetchAllPriceLevels(accessToken);
console.log(JSON.stringify(priceLevels[0], null, 2));
```

→ 出力を見て、`PriceLevelPerItem` 配列の構造を確認してから本実装の処理に入る。

### 7-3. マッピング失敗時の対応

- **Customer未マッピング**：QBO顧客名と Client list の顧客名がズレている可能性
  → 手動で Client list の顧客名を QBO に合わせるか、マッピング辞書を作る
- **SKU未マッピング**：QBO Item の SKU と Item List の SKU がズレている可能性
  → Item List の SKU を QBO に合わせる

### 7-4. 再実行可能性

このスクリプトは**何度実行しても同じ結果**になる設計です（読み取りのみ・CSV出力）。
失敗してもデータが壊れないので、安心して試行錯誤できます。

### 7-5. 本番運用後の扱い

- スクリプトは**1回だけ使う想定**
- 投入完了後、Custom Pricesシートが正本となる
- 以降は「価格管理」メニューから操作する
- スクリプトファイルは削除して構いません（Git履歴には残るので将来参照可能）

---

## 8. 代替案：手動移行（スクリプトが動かない場合）

もし QBO API でうまく取れない場合の代替案：

### 8-1. QBO画面から手動でリスト化

1. QBOの「Price Rules」一覧画面を開く
2. 各 Price Rule をクリックして詳細を確認
3. Excelに以下を手動入力：

| Customer Name | SKU | Custom Price |
|---|---|---|
| BENI HOLLYWOOD | B033 | 22.50 |
| ... | ... | ... |

4. このExcelをCSV化して Custom Prices シートに投入

**手間はかかるが、確実な方法**です。15社×平均5アイテム = 約75レコードなので、半日程度で完了します。

---

## 9. 実装把握チェックリスト

このファイルを読み終わったら、以下を確認してください：

- [ ] スクリプトは使い捨て（実行後削除）であることを理解した
- [ ] 対象は Per Item 形式のみで、Fixed % は対象外と理解した
- [ ] CSV出力 → Custom Pricesシートへ手動投入する流れを理解した
- [ ] 未マッピングが発生し得ること（顧客名・SKUのズレ）を理解した
- [ ] 代替案として手動移行も可能と理解した

OKならば **06-testing.md** に進んでください。
