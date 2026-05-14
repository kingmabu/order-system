# 03. Cost list Apps Script 改修詳細

このファイルでは、Cost list の Apps Script に対する全改修内容を定義します。

**改修は2種類あります：**

1. **既存ファイル4つの「除外リスト追加」**（最小限の変更）
2. **新規ファイル3つの作成**（custom_prices_form.gs / .html / cost_reference.gs）

**実装に着手する前に、必ずこのファイル全体を読んでください。**

---

## 1. 改修サマリー

| ファイル | 種別 | 改修内容 | 行数目安 |
|---|---|---|---|
| `_main.gs` | 既存 | onOpen() 末尾にメニュー追加 | +10行 |
| `price_sync_test.gs` | 既存 | EXCLUDE_SHEETS に3行追加 | +3行 |
| `vedor_formulas.gs` | 既存 | VF_EXCLUDE に3行追加 | +3行 |
| `rebuild preferred price.gs` | 既存 | PP_EXCLUDE_SHEETS に3行追加 | +3行 |
| `cost_reference.gs` | **新規** | Cost Reference シート生成 | 約150行 |
| `custom_prices_form.gs` | **新規** | 価格管理フォーム本体 | 約400行 |
| `custom_prices_form.html` | **新規** | 価格管理フォームUI | 約300行 |

---

## 2. 既存ファイル改修

### 2-1. `_main.gs` の改修

#### 改修箇所

`onOpen()` 関数の末尾に「価格管理」メニューを追加します。**既存のメニュー定義は一切変更しません**。

#### 改修前（既存の `onOpen` の末尾）

```javascript
  // ===== Weekly Mail =====
  if (typeof createWeeklyDraftFromCostList === 'function') {
    const w = ui.createMenu('Weekly Mail');
    w.addItem('下書きを作成（cost list）', 'createWeeklyDraftFromCostList');
    if (typeof sendWeeklyMailFromCostListNow      === 'function') w.addItem('（上級）即送信',                  'sendWeeklyMailFromCostListNow');
    if (typeof installWeeklyTriggerFromCostList   === 'function') w.addItem('［トリガー作成］毎週月曜13:00', 'installWeeklyTriggerFromCostList');
    if (typeof uninstallWeeklyTriggerFromCostList === 'function') w.addItem('［トリガー削除］自動作成を停止', 'uninstallWeeklyTriggerFromCostList');
    w.addToUi();
  }
}
```

#### 改修後（末尾に追加）

```javascript
  // ===== Weekly Mail =====
  if (typeof createWeeklyDraftFromCostList === 'function') {
    const w = ui.createMenu('Weekly Mail');
    w.addItem('下書きを作成（cost list）', 'createWeeklyDraftFromCostList');
    if (typeof sendWeeklyMailFromCostListNow      === 'function') w.addItem('（上級）即送信',                  'sendWeeklyMailFromCostListNow');
    if (typeof installWeeklyTriggerFromCostList   === 'function') w.addItem('［トリガー作成］毎週月曜13:00', 'installWeeklyTriggerFromCostList');
    if (typeof uninstallWeeklyTriggerFromCostList === 'function') w.addItem('［トリガー削除］自動作成を停止', 'uninstallWeeklyTriggerFromCostList');
    w.addToUi();
  }

  // ===== 価格管理（Custom Prices）===== ← 追加
  if (typeof showCustomPriceFormAdd === 'function') {            // ← 追加
    const cp = ui.createMenu('価格管理');                          // ← 追加
    cp.addItem('個別価格を追加', 'showCustomPriceFormAdd');         // ← 追加
    cp.addItem('個別価格を変更', 'showCustomPriceFormEdit');        // ← 追加
    cp.addItem('個別価格を削除', 'showCustomPriceFormDelete');      // ← 追加
    cp.addSeparator();                                             // ← 追加
    cp.addItem('一覧を確認', 'jumpToCustomPricesSheet');            // ← 追加
    cp.addSeparator();                                             // ← 追加
    cp.addItem('Cost Reference を更新', 'rebuildCostReference');    // ← 追加
    cp.addToUi();                                                  // ← 追加
  }                                                                // ← 追加
}
```

#### 注意点

- **既存の他のメニュー定義は変更しない**
- `typeof showCustomPriceFormAdd === 'function'` で関数の存在チェックをすることで、新規ファイル未デプロイ時にエラーが出ないようにする

---

### 2-2. `price_sync_test.gs` の改修

#### 改修箇所

`EXCLUDE_SHEETS` 定数に新規シート名3つを追加します。

#### 改修前

```javascript
const EXCLUDE_SHEETS = new Set([
  'ORIGINAL',            // テンプレ（空フォーム）
  '商品一覧',
  'Script Manual',
  'VendorLog',
  'weekly list',
  'Recipients',
  'Recipients Price',
  'Preferred Price',
  '仕様書/Manual',
  'Summary',
  'Cost list', 'cost list',
  'Master', 'Templates',
  'Discontinued',
  'VENDOR TEMPLATE'
]);
```

#### 改修後

```javascript
const EXCLUDE_SHEETS = new Set([
  'ORIGINAL',            // テンプレ（空フォーム）
  '商品一覧',
  'Script Manual',
  'VendorLog',
  'weekly list',
  'Recipients',
  'Recipients Price',
  'Preferred Price',
  '仕様書/Manual',
  'Summary',
  'Cost list', 'cost list',
  'Master', 'Templates',
  'Discontinued',
  'VENDOR TEMPLATE',
  'Custom Prices',       // ← 追加
  'Custom Price Log',    // ← 追加
  'Cost Reference'       // ← 追加
]);
```

---

### 2-3. `vedor_formulas.gs` の改修

#### 改修箇所

`VF_EXCLUDE` 定数に新規シート名3つを追加します。

#### 改修前

```javascript
const VF_EXCLUDE = new Set([
  'ORIGINAL', '商品一覧', 'Script Manual', 'VendorLog',
  'weekly list', 'Recipients', 'Recipients Price',
  'Preferred Price', '仕様書/Manual', 'Summary',
  'Cost list', 'cost list', 'Master', 'Templates',
  'Discontinued', 'VENDOR TEMPLATE'
]);
```

#### 改修後

```javascript
const VF_EXCLUDE = new Set([
  'ORIGINAL', '商品一覧', 'Script Manual', 'VendorLog',
  'weekly list', 'Recipients', 'Recipients Price',
  'Preferred Price', '仕様書/Manual', 'Summary',
  'Cost list', 'cost list', 'Master', 'Templates',
  'Discontinued', 'VENDOR TEMPLATE',
  'Custom Prices',       // ← 追加
  'Custom Price Log',    // ← 追加
  'Cost Reference'       // ← 追加
]);
```

---

### 2-4. `rebuild preferred price.gs` の改修

#### 改修箇所

`PP_EXCLUDE_SHEETS` 定数に新規シート名3つを追加します。

**重要：** このリストは**小文字で比較**するため、登録時も**小文字**にしてください。

#### 改修前

```javascript
const PP_EXCLUDE_SHEETS = [
  'preferred price',
  'recipients',
  'weekly list',
  'template',
  'master',
  'memo',
  'readme',
  'sandbox',
];
```

#### 改修後

```javascript
const PP_EXCLUDE_SHEETS = [
  'preferred price',
  'recipients',
  'weekly list',
  'template',
  'master',
  'memo',
  'readme',
  'sandbox',
  'custom prices',         // ← 追加（小文字）
  'custom price log',      // ← 追加（小文字）
  'cost reference',        // ← 追加（小文字）
];
```

---

## 3. 新規ファイル：`cost_reference.gs`

### 3-1. ファイルの役割

- **Cost Reference シートの自動生成・更新**
- 各ベンダータブの G列（Each Cost）を SKU ごとに集計
- 「価格管理 → Cost Reference を更新」メニューから呼ばれる
- フォーム起動時にも自動で呼ばれる

### 3-2. 完全実装

```javascript
/**
 * cost_reference.gs - Cost Reference シート生成
 *
 * 役割：
 * - 全ベンダータブの G列（Each Cost）と F列（LBS Cost）を SKU ごとに集計
 * - 最新の日付（H列）を持つコストを採用
 * - Cost Reference シートに SKU 昇順で書き込み
 *
 * 配置先: Cost list スプレッドシート
 */

const COST_REF_SHEET = 'Cost Reference';

// 除外シート（小文字比較）
const COST_REF_EXCLUDE = [
  'preferred price',
  'recipients',
  'weekly list',
  'template',
  'master',
  'memo',
  'readme',
  'sandbox',
  'original',
  '商品一覧',
  'script manual',
  'vendorlog',
  'recipients price',
  '仕様書/manual',
  'summary',
  'cost list',
  'templates',
  'discontinued',
  'vendor template',
  'custom prices',
  'custom price log',
  'cost reference',
];

// 列番号（1始まり）
const CR_COL_SKU       = 1;   // A
const CR_COL_LBS_COST  = 6;   // F
const CR_COL_EACH_COST = 7;   // G
const CR_COL_DATE      = 8;   // H

/**
 * Cost Reference を再構築する
 */
function rebuildCostReference() {
  const ss = SpreadsheetApp.getActive();
  let target = ss.getSheetByName(COST_REF_SHEET);

  // シートが無ければ作成
  if (!target) {
    target = ss.insertSheet(COST_REF_SHEET);
    _setupCostReferenceHeader_(target);
  }

  const all = ss.getSheets();
  const vendorSheets = all.filter(sh => {
    const name = sh.getName().trim().toLowerCase();
    if (COST_REF_EXCLUDE.indexOf(name) !== -1) return false;
    if (name.startsWith('_')) return false;
    if (sh.isSheetHidden()) return false;
    return true;
  });

  // SKU -> { eachCost, lbsCost, date, vendor } （最新日付を保持）
  const latest = {};
  const skipped = [];

  vendorSheets.forEach(sh => {
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < CR_COL_DATE) {
      skipped.push(`${sh.getName()} (行/列不足)`);
      return;
    }

    const vendor = sh.getName();
    const range = sh.getRange(2, 1, lastRow - 1, CR_COL_DATE).getValues();
    let pickedAny = false;

    range.forEach(row => {
      const sku       = row[CR_COL_SKU       - 1];
      const lbsCost   = row[CR_COL_LBS_COST  - 1];
      const eachCost  = row[CR_COL_EACH_COST - 1];
      const date      = row[CR_COL_DATE      - 1];

      if (!sku || eachCost === '' || eachCost === null || !date) return;
      const eachCostNum = Number(eachCost);
      if (isNaN(eachCostNum) || eachCostNum <= 0) return;
      const lbsCostNum = Number(lbsCost);

      const dateMs = (date instanceof Date) ? date.getTime() : new Date(date).getTime();
      if (isNaN(dateMs)) return;

      const key = String(sku).trim();
      if (!key) return;
      pickedAny = true;

      const prev = latest[key];
      if (!prev || dateMs > prev.dateMs) {
        latest[key] = {
          eachCost: eachCostNum,
          lbsCost: isNaN(lbsCostNum) ? '' : lbsCostNum,
          dateMs: dateMs,
          vendor: vendor,
        };
      }
    });

    if (!pickedAny) skipped.push(`${sh.getName()} (有効データ0件)`);
  });

  // 出力配列：SKU昇順
  const skus = Object.keys(latest).sort();
  const out = skus.map(sku => {
    const r = latest[sku];
    return [
      sku,
      r.eachCost,
      r.lbsCost,
      r.vendor,
      new Date(r.dateMs),
    ];
  });

  // 既存データクリア（A2:E 末尾まで）
  const lastTargetRow = target.getLastRow();
  if (lastTargetRow >= 2) {
    target.getRange(2, 1, lastTargetRow - 1, 5).clearContent();
  }
  if (out.length > 0) {
    target.getRange(2, 1, out.length, 5).setValues(out);
    target.getRange(2, 5, out.length, 1).setNumberFormat('M/d/yyyy');
  }

  const msg =
    `Cost Reference 再構築完了\n` +
    `対象ベンダータブ: ${vendorSheets.length}\n` +
    `集計SKU数: ${out.length}\n` +
    (skipped.length ? `スキップ: ${skipped.join(', ')}` : '');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/**
 * Cost Reference シートのヘッダー設定
 */
function _setupCostReferenceHeader_(sheet) {
  const headers = ['SKU', 'Each Cost', 'LBS Cost', 'Vendor', 'Update Date'];
  const hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setBackground('#34a853');
  hRange.setFontColor('#ffffff');
  hRange.setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 110);
}

/**
 * Cost Reference からSKUのコスト情報を取得（フォームから使用）
 * @param {string} sku SKU
 * @return {Object|null} { eachCost, lbsCost, vendor, updateDate } または null
 */
function getCostForSku(sku) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(COST_REF_SHEET);
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const data = sh.getRange(2, 1, lastRow - 1, 5).getValues();
  const target = String(sku).trim();

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      return {
        sku: data[i][0],
        eachCost: data[i][1],
        lbsCost: data[i][2],
        vendor: data[i][3],
        updateDate: data[i][4],
      };
    }
  }
  return null;
}
```

### 3-3. 関数一覧

| 関数 | 役割 | 呼ばれ方 |
|---|---|---|
| `rebuildCostReference()` | Cost Reference シートを再構築 | メニュー・フォーム起動時 |
| `_setupCostReferenceHeader_(sheet)` | ヘッダー初期化 | 初回シート作成時 |
| `getCostForSku(sku)` | 特定SKUのコスト取得 | フォーム内のJS から |

---

## 4. 新規ファイル：`custom_prices_form.gs`

### 4-1. ファイルの役割

- 「価格管理」メニューから呼ばれる関数群を定義
- Custom Prices シート・Custom Price Log シートの自動作成
- 個別価格の追加・変更・削除のロジック
- フォームHTML（custom_prices_form.html）を起動

### 4-2. 完全実装

```javascript
/**
 * custom_prices_form.gs - 価格管理フォーム本体
 *
 * 役割：
 * - 「価格管理」メニューから呼ばれる関数群
 * - Custom Prices シートと Custom Price Log シートの管理
 * - フォーム（HTML）を起動して、ユーザー操作を受け付ける
 *
 * 配置先: Cost list スプレッドシート
 */

const CP_SHEET = 'Custom Prices';
const CP_LOG_SHEET = 'Custom Price Log';

// Client Information のスプレッドシートID（環境変数化推奨）
const CLIENT_INFO_ID = '1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8'; // ← 開発時は開発用IDに変更
const CLIENT_LIST_SHEET = 'Client list';

// Item List のスプレッドシートID
const ITEM_LIST_ID = '14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc'; // ← 開発時は開発用IDに変更
const ITEM_LIST_SHEET = '商品一覧';

// Client list の列番号（W列 = Price Group, X列 = Markup %）
const CL_COL_CUSTOMER_ID = 1;  // A
const CL_COL_CUSTOMER_NAME = 2; // B（必要に応じて調整）
const CL_COL_PRICE_GROUP = 23; // W
const CL_COL_MARKUP = 24;      // X

// Item List の列番号
const IL_COL_SKU = 1;          // A
const IL_COL_ITEM_NAME = 4;    // D
const IL_COL_UNIT_CHECK = 9;   // I（量り売り/定量売り）
const IL_COL_PRICE_LB = 10;    // J
const IL_COL_PRICE_UNIT = 11;  // K
const IL_HEADER_ROW = 4;       // データは5行目から

// ============================================================
// シート初期化
// ============================================================

/**
 * Custom Prices シートを作成（既に存在すればスキップ）
 */
function _ensureCustomPricesSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CP_SHEET);
  if (sh) return sh;

  sh = ss.insertSheet(CP_SHEET);
  const headers = [
    'Customer ID', 'Customer Name', 'SKU', 'Item Name',
    'Custom Price', 'Update Date', 'Note'
  ];
  const hRange = sh.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setBackground('#4a86e8');
  hRange.setFontColor('#ffffff');
  hRange.setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(3, 80);
  sh.setColumnWidth(4, 220);
  sh.setColumnWidth(5, 110);
  sh.setColumnWidth(6, 110);
  sh.setColumnWidth(7, 250);
  return sh;
}

/**
 * Custom Price Log シートを作成（既に存在すればスキップ）
 */
function _ensureCustomPriceLogSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CP_LOG_SHEET);
  if (sh) return sh;

  sh = ss.insertSheet(CP_LOG_SHEET);
  const headers = [
    'Timestamp', 'Action', 'Customer ID', 'Customer Name',
    'SKU', 'Item Name', 'Price Before', 'Price After', 'Note'
  ];
  const hRange = sh.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setBackground('#666666');
  hRange.setFontColor('#ffffff');
  hRange.setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

// ============================================================
// メニュー関数（_main.gs の onOpen から呼ばれる）
// ============================================================

/**
 * 「個別価格を追加」フォーム表示
 */
function showCustomPriceFormAdd() {
  _ensureCustomPricesSheet_();
  _ensureCustomPriceLogSheet_();
  if (typeof rebuildCostReference === 'function') {
    rebuildCostReference(); // フォーム起動前に最新コスト取得
  }
  _showForm_('Add');
}

/**
 * 「個別価格を変更」フォーム表示
 */
function showCustomPriceFormEdit() {
  _ensureCustomPricesSheet_();
  _ensureCustomPriceLogSheet_();
  if (typeof rebuildCostReference === 'function') {
    rebuildCostReference();
  }
  _showForm_('Edit');
}

/**
 * 「個別価格を削除」フォーム表示
 */
function showCustomPriceFormDelete() {
  _ensureCustomPricesSheet_();
  _ensureCustomPriceLogSheet_();
  _showForm_('Delete');
}

/**
 * Custom Prices シートへジャンプ
 */
function jumpToCustomPricesSheet() {
  const ss = SpreadsheetApp.getActive();
  const sh = _ensureCustomPricesSheet_();
  ss.setActiveSheet(sh);
}

/**
 * フォーム共通起動
 */
function _showForm_(mode) {
  const html = HtmlService.createHtmlOutputFromFile('custom_prices_form')
    .setWidth(720)
    .setHeight(620)
    .setTitle(`価格管理 - ${mode}`);
  PropertiesService.getScriptProperties().setProperty('CP_FORM_MODE', mode);
  SpreadsheetApp.getUi().showModalDialog(html, `価格管理 - ${mode}`);
}

/**
 * フォームから現在のモードを取得
 */
function getFormMode() {
  return PropertiesService.getScriptProperties().getProperty('CP_FORM_MODE') || 'Add';
}

// ============================================================
// フォームに供給するデータ取得関数（クライアントJSから呼ばれる）
// ============================================================

/**
 * Individual分類の顧客一覧を取得
 * @return {Array} [{ id, name }, ...]
 */
function getIndividualCustomers() {
  const ss = SpreadsheetApp.openById(CLIENT_INFO_ID);
  const sh = ss.getSheetByName(CLIENT_LIST_SHEET);
  if (!sh) throw new Error('Client list が見つかりません');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2, 1, lastRow - 1, CL_COL_PRICE_GROUP).getValues();
  const result = [];
  data.forEach(row => {
    const id = String(row[CL_COL_CUSTOMER_ID - 1] || '').trim();
    const name = String(row[CL_COL_CUSTOMER_NAME - 1] || '').trim();
    const group = String(row[CL_COL_PRICE_GROUP - 1] || '').trim();
    if (id && name && group === 'Individual') {
      result.push({ id: _normalizeId_(id), name: name });
    }
  });
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 全顧客一覧を取得（Individual変更ボタン用）
 * @return {Array} [{ id, name, group }, ...]
 */
function getAllCustomers() {
  const ss = SpreadsheetApp.openById(CLIENT_INFO_ID);
  const sh = ss.getSheetByName(CLIENT_LIST_SHEET);
  if (!sh) throw new Error('Client list が見つかりません');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2, 1, lastRow - 1, CL_COL_PRICE_GROUP).getValues();
  const result = [];
  data.forEach(row => {
    const id = String(row[CL_COL_CUSTOMER_ID - 1] || '').trim();
    const name = String(row[CL_COL_CUSTOMER_NAME - 1] || '').trim();
    const group = String(row[CL_COL_PRICE_GROUP - 1] || '').trim();
    if (id && name) {
      result.push({ id: _normalizeId_(id), name: name, group: group || 'Standard' });
    }
  });
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 全SKU一覧を取得
 * @return {Array} [{ sku, name, isUnit, basePrice, cost }, ...]
 */
function getAllItems() {
  const ss = SpreadsheetApp.openById(ITEM_LIST_ID);
  const sh = ss.getSheetByName(ITEM_LIST_SHEET);
  if (!sh) throw new Error('商品一覧が見つかりません');

  const lastRow = sh.getLastRow();
  if (lastRow <= IL_HEADER_ROW) return [];

  const data = sh.getRange(
    IL_HEADER_ROW + 1, 1,
    lastRow - IL_HEADER_ROW,
    IL_COL_PRICE_UNIT
  ).getValues();

  const result = [];
  data.forEach(row => {
    const sku = String(row[IL_COL_SKU - 1] || '').trim();
    const name = String(row[IL_COL_ITEM_NAME - 1] || '').trim();
    const isUnit = row[IL_COL_UNIT_CHECK - 1] === true;
    const priceLb = Number(row[IL_COL_PRICE_LB - 1]) || 0;
    const priceUnit = Number(row[IL_COL_PRICE_UNIT - 1]) || 0;
    const basePrice = isUnit ? priceUnit : priceLb;

    if (sku && name) {
      result.push({
        sku: sku,
        name: name,
        isUnit: isUnit,
        basePrice: basePrice,
        priceLb: priceLb,
        priceUnit: priceUnit,
      });
    }
  });
  return result.sort((a, b) => a.sku.localeCompare(b.sku));
}

/**
 * 既存のCustom Price全件取得（変更・削除モードで使用）
 * @return {Array} [{ customerId, sku, price, ... }, ...]
 */
function getAllCustomPrices() {
  const sh = _ensureCustomPricesSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  const result = [];
  data.forEach((row, idx) => {
    const customerId = _normalizeId_(String(row[0] || '').trim());
    const customerName = String(row[1] || '').trim();
    const sku = String(row[2] || '').trim();
    const itemName = String(row[3] || '').trim();
    const price = Number(row[4]) || 0;
    const updateDate = row[5];
    const note = String(row[6] || '');

    if (customerId && sku && price > 0) {
      result.push({
        rowIndex: idx + 2, // シート上の実際の行番号
        customerId, customerName, sku, itemName,
        price, updateDate, note
      });
    }
  });
  return result;
}

/**
 * 特定の顧客・SKUのCustom Priceを取得
 * @return {Object|null}
 */
function findCustomPrice(customerId, sku) {
  const normId = _normalizeId_(customerId);
  const all = getAllCustomPrices();
  return all.find(cp => cp.customerId === normId && cp.sku === sku) || null;
}

// ============================================================
// 操作関数（追加・変更・削除）
// ============================================================

/**
 * 個別価格を追加
 * @param {Object} data { customerId, sku, price, note }
 * @return {Object} { success, message }
 */
function addCustomPrice(data) {
  try {
    const normId = _normalizeId_(data.customerId);

    // 重複チェック
    const existing = findCustomPrice(normId, data.sku);
    if (existing) {
      return {
        success: false,
        duplicate: true,
        existing: existing,
        message: `既に登録があります: ${existing.customerName} × ${existing.sku}（現在 $${existing.price}）`
      };
    }

    // Customer Name と Item Name を取得
    const customer = getAllCustomers().find(c => c.id === normId);
    if (!customer) return { success: false, message: '顧客が見つかりません' };

    const items = getAllItems();
    const item = items.find(i => i.sku === data.sku);
    if (!item) return { success: false, message: 'SKUが見つかりません' };

    // 価格の妥当性チェック
    const priceNum = Number(data.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return { success: false, message: '価格は0より大きい数値で入力してください' };
    }

    // シートに追加
    const sh = _ensureCustomPricesSheet_();
    const today = new Date();
    sh.appendRow([
      normId,
      customer.name,
      data.sku,
      item.name,
      priceNum,
      today,
      data.note || ''
    ]);

    // 日付フォーマット
    const lastRow = sh.getLastRow();
    sh.getRange(lastRow, 6).setNumberFormat('M/d/yyyy');

    // ログ記録
    _appendLog_('Add', normId, customer.name, data.sku, item.name, null, priceNum, data.note);

    return {
      success: true,
      message: `追加しました: ${customer.name} × ${data.sku} → $${priceNum}`
    };
  } catch (err) {
    return { success: false, message: 'エラー: ' + err.message };
  }
}

/**
 * 個別価格を変更
 */
function changeCustomPrice(data) {
  try {
    const normId = _normalizeId_(data.customerId);
    const existing = findCustomPrice(normId, data.sku);
    if (!existing) {
      return { success: false, message: '対象データが見つかりません' };
    }

    const newPrice = Number(data.price);
    if (isNaN(newPrice) || newPrice <= 0) {
      return { success: false, message: '価格は0より大きい数値で入力してください' };
    }

    const sh = _ensureCustomPricesSheet_();
    const row = existing.rowIndex;
    const today = new Date();

    sh.getRange(row, 5).setValue(newPrice);
    sh.getRange(row, 6).setValue(today).setNumberFormat('M/d/yyyy');
    if (data.note !== undefined && data.note !== null) {
      sh.getRange(row, 7).setValue(data.note);
    }

    // ログ記録
    _appendLog_('Change', normId, existing.customerName, data.sku, existing.itemName, existing.price, newPrice, data.note);

    return {
      success: true,
      message: `変更しました: ${existing.customerName} × ${data.sku}: $${existing.price} → $${newPrice}`
    };
  } catch (err) {
    return { success: false, message: 'エラー: ' + err.message };
  }
}

/**
 * 個別価格を削除
 */
function deleteCustomPrice(data) {
  try {
    const normId = _normalizeId_(data.customerId);
    const existing = findCustomPrice(normId, data.sku);
    if (!existing) {
      return { success: false, message: '対象データが見つかりません' };
    }

    const sh = _ensureCustomPricesSheet_();
    sh.deleteRow(existing.rowIndex);

    // ログ記録
    _appendLog_('Delete', normId, existing.customerName, data.sku, existing.itemName, existing.price, null, data.note);

    return {
      success: true,
      message: `削除しました: ${existing.customerName} × ${data.sku}（Standard価格に戻ります）`
    };
  } catch (err) {
    return { success: false, message: 'エラー: ' + err.message };
  }
}

/**
 * 顧客のPrice GroupをIndividualに変更
 */
function changeCustomerToIndividual(customerId) {
  try {
    const normId = _normalizeId_(customerId);
    const ss = SpreadsheetApp.openById(CLIENT_INFO_ID);
    const sh = ss.getSheetByName(CLIENT_LIST_SHEET);
    const lastRow = sh.getLastRow();
    const ids = sh.getRange(2, CL_COL_CUSTOMER_ID, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (_normalizeId_(String(ids[i][0]).trim()) === normId) {
        sh.getRange(i + 2, CL_COL_PRICE_GROUP).setValue('Individual');
        return { success: true, message: `顧客 ${normId} をIndividualに変更しました` };
      }
    }
    return { success: false, message: '顧客が見つかりません' };
  } catch (err) {
    return { success: false, message: 'エラー: ' + err.message };
  }
}

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * Customer ID を3桁ゼロ埋めに正規化
 */
function _normalizeId_(id) {
  const num = parseInt(String(id).replace(/\D/g, ''), 10);
  if (isNaN(num)) return String(id);
  return ('000' + num).slice(-3);
}

/**
 * ログに1行追記
 */
function _appendLog_(action, customerId, customerName, sku, itemName, priceBefore, priceAfter, note) {
  const sh = _ensureCustomPriceLogSheet_();
  const now = new Date();
  sh.appendRow([
    now,
    action,
    customerId,
    customerName,
    sku,
    itemName,
    priceBefore !== null ? priceBefore : '',
    priceAfter !== null ? priceAfter : '',
    note || ''
  ]);
  // タイムスタンプの書式設定
  const lastRow = sh.getLastRow();
  sh.getRange(lastRow, 1).setNumberFormat('yyyy/MM/dd HH:mm:ss');
}
```

### 4-3. 関数一覧

#### メニュー関数（onOpen から呼ばれる）

| 関数 | 役割 |
|---|---|
| `showCustomPriceFormAdd()` | 追加フォーム表示 |
| `showCustomPriceFormEdit()` | 変更フォーム表示 |
| `showCustomPriceFormDelete()` | 削除フォーム表示 |
| `jumpToCustomPricesSheet()` | シートへジャンプ |

#### フォームへのデータ供給（HTMLから google.script.run で呼ばれる）

| 関数 | 戻り値 |
|---|---|
| `getFormMode()` | 'Add' / 'Edit' / 'Delete' |
| `getIndividualCustomers()` | Individual顧客一覧 |
| `getAllCustomers()` | 全顧客一覧 |
| `getAllItems()` | 全SKU一覧 |
| `getAllCustomPrices()` | Custom Prices全件 |
| `findCustomPrice(customerId, sku)` | 特定の組み合わせ検索 |
| `getCostForSku(sku)` | コスト情報（cost_reference.gs から） |

#### 操作関数

| 関数 | 役割 |
|---|---|
| `addCustomPrice(data)` | 追加実行 |
| `changeCustomPrice(data)` | 変更実行 |
| `deleteCustomPrice(data)` | 削除実行 |
| `changeCustomerToIndividual(customerId)` | 顧客をIndividualに変更 |

---

## 5. 新規ファイル：`custom_prices_form.html`

### 5-1. ファイルの役割

「価格管理」フォームのUIを定義するHTMLファイルです。Apps Script の `HtmlService` で読み込まれます。

### 5-2. 完全実装

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      padding: 16px;
      color: #333;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
      color: #4a86e8;
    }
    .mode-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      color: #fff;
      margin-left: 8px;
    }
    .mode-add { background: #34a853; }
    .mode-edit { background: #fbbc04; color: #333; }
    .mode-delete { background: #ea4335; }

    label { display: block; margin: 10px 0 4px; font-weight: bold; }
    select, input[type=text], input[type=number], textarea {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-sizing: border-box;
      font-size: 13px;
    }
    .row { margin-bottom: 10px; }
    .row.inline { display: flex; gap: 10px; }
    .row.inline > div { flex: 1; }

    .info-box {
      background: #f6f8fa;
      border: 1px solid #ddd;
      padding: 10px;
      border-radius: 4px;
      margin: 12px 0;
      font-size: 12px;
    }
    .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .info-row .label { color: #666; }
    .info-row .value { font-weight: bold; }

    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 8px 12px;
      margin: 10px 0;
      font-size: 12px;
    }
    .error {
      background: #f8d7da;
      border-left: 4px solid #dc3545;
      padding: 8px 12px;
      margin: 10px 0;
      font-size: 12px;
      color: #721c24;
    }
    .success {
      background: #d4edda;
      border-left: 4px solid #28a745;
      padding: 8px 12px;
      margin: 10px 0;
      font-size: 12px;
      color: #155724;
    }

    .button-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #eee;
    }
    button {
      padding: 8px 18px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 13px;
    }
    button.primary { background: #4a86e8; color: white; }
    button.primary:hover { background: #3a76d8; }
    button.danger { background: #ea4335; color: white; }
    button.danger:hover { background: #d33a2c; }
    button.secondary { background: #eee; color: #333; }
    button.secondary:hover { background: #ddd; }
    button:disabled { background: #ccc; cursor: not-allowed; }

    .text-link {
      color: #4a86e8;
      cursor: pointer;
      text-decoration: underline;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h2 id="title">価格管理 <span id="mode-tag" class="mode-tag mode-add">Add</span></h2>

  <div id="messages"></div>

  <div class="row">
    <label>顧客</label>
    <select id="customer">
      <option value="">読み込み中…</option>
    </select>
    <span class="text-link" id="show-all-customers">他の顧客を追加（Individualに変更）</span>
  </div>

  <div class="row">
    <label>SKU / 商品検索</label>
    <input type="text" id="sku-search" placeholder="SKUまたは商品名で検索（例: B033, beef short）" />
    <select id="sku" size="6" style="display:none; margin-top:6px;"></select>
  </div>

  <div class="info-box" id="info-box" style="display:none;">
    <div class="info-row"><span class="label">商品名:</span><span class="value" id="info-item-name">-</span></div>
    <div class="info-row"><span class="label">販売単位:</span><span class="value" id="info-unit">-</span></div>
    <div class="info-row"><span class="label">仕入価格:</span><span class="value" id="info-cost">-</span></div>
    <div class="info-row"><span class="label">標準販売価格:</span><span class="value" id="info-base">-</span></div>
    <div class="info-row"><span class="label">粗利率:</span><span class="value" id="info-margin">-</span></div>
    <div class="info-row" id="info-current-row" style="display:none;">
      <span class="label">現在のCustom Price:</span><span class="value" id="info-current">-</span>
    </div>
  </div>

  <div class="row" id="price-row">
    <label id="price-label">新しい価格 ($)</label>
    <input type="number" id="price" step="0.01" min="0" placeholder="例: 22.50" />
  </div>

  <div class="row">
    <label>Note（任意）</label>
    <textarea id="note" rows="2" placeholder="例: 2026年5月見直し"></textarea>
  </div>

  <div class="button-bar">
    <button class="secondary" onclick="google.script.host.close()">キャンセル</button>
    <button class="primary" id="submit" onclick="onSubmit()">保存</button>
  </div>

  <script>
    let mode = 'Add';
    let customers = [];
    let items = [];
    let customPrices = [];
    let selectedCustomer = null;
    let selectedItem = null;
    let existingCustomPrice = null;

    // 初期化
    window.onload = function() {
      google.script.run.withSuccessHandler(setMode).getFormMode();
    };

    function setMode(m) {
      mode = m;
      const tag = document.getElementById('mode-tag');
      tag.textContent = m;
      tag.className = 'mode-tag mode-' + m.toLowerCase();
      const submitBtn = document.getElementById('submit');
      submitBtn.textContent = m === 'Add' ? '追加' : (m === 'Edit' ? '変更' : '削除');
      submitBtn.className = m === 'Delete' ? 'danger' : 'primary';
      if (m === 'Delete') {
        document.getElementById('price-row').style.display = 'none';
      }
      loadCustomers();
    }

    function loadCustomers() {
      if (mode === 'Edit' || mode === 'Delete') {
        google.script.run.withSuccessHandler(allCps => {
          customPrices = allCps;
          // CustomPrices にある顧客のみを抽出
          const idSet = new Set(allCps.map(c => c.customerId));
          google.script.run.withSuccessHandler(all => {
            customers = all.filter(c => idSet.has(c.id));
            renderCustomers();
          }).getAllCustomers();
        }).getAllCustomPrices();
      } else {
        google.script.run.withSuccessHandler(list => {
          customers = list;
          renderCustomers();
        }).getIndividualCustomers();
      }

      google.script.run.withSuccessHandler(list => { items = list; }).getAllItems();
    }

    function renderCustomers() {
      const sel = document.getElementById('customer');
      sel.innerHTML = '<option value="">-- 選択してください --</option>';
      customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.id})`;
        sel.appendChild(opt);
      });
      sel.onchange = onCustomerChange;
    }

    function onCustomerChange() {
      const cid = document.getElementById('customer').value;
      selectedCustomer = customers.find(c => c.id === cid) || null;
      document.getElementById('sku-search').value = '';
      document.getElementById('sku').style.display = 'none';
      document.getElementById('info-box').style.display = 'none';
      selectedItem = null;
      existingCustomPrice = null;

      if (mode === 'Edit' || mode === 'Delete') {
        const skus = customPrices.filter(cp => cp.customerId === cid);
        showSkuOptions(skus.map(cp => ({
          sku: cp.sku,
          name: cp.itemName,
          isUnit: null,
          basePrice: null
        })));
      }
    }

    document.getElementById('sku-search').addEventListener('input', function() {
      const q = this.value.trim().toLowerCase();
      if (!q) {
        document.getElementById('sku').style.display = 'none';
        return;
      }
      let candidates;
      if (mode === 'Edit' || mode === 'Delete') {
        const cid = selectedCustomer ? selectedCustomer.id : null;
        candidates = customPrices.filter(cp => cp.customerId === cid).map(cp => ({
          sku: cp.sku, name: cp.itemName
        }));
      } else {
        candidates = items;
      }
      const filtered = candidates.filter(i =>
        i.sku.toLowerCase().includes(q) ||
        (i.name || '').toLowerCase().includes(q)
      ).slice(0, 30);
      showSkuOptions(filtered);
    });

    function showSkuOptions(list) {
      const sel = document.getElementById('sku');
      sel.innerHTML = '';
      list.forEach(i => {
        const opt = document.createElement('option');
        opt.value = i.sku;
        opt.textContent = `${i.sku} - ${i.name}`;
        sel.appendChild(opt);
      });
      sel.style.display = list.length > 0 ? 'block' : 'none';
      sel.onchange = onSkuChange;
    }

    function onSkuChange() {
      const sku = document.getElementById('sku').value;
      if (!sku || !selectedCustomer) return;
      // 商品マスター取得
      const itemFull = items.find(i => i.sku === sku);
      selectedItem = itemFull || null;
      // 既存Custom Price検索
      google.script.run.withSuccessHandler(cp => {
        existingCustomPrice = cp;
        renderInfo();
      }).findCustomPrice(selectedCustomer.id, sku);

      // コスト情報取得
      google.script.run.withSuccessHandler(cost => {
        renderCost(cost);
      }).getCostForSku(sku);
    }

    function renderInfo() {
      if (!selectedItem) {
        document.getElementById('info-box').style.display = 'none';
        return;
      }
      document.getElementById('info-box').style.display = 'block';
      document.getElementById('info-item-name').textContent = selectedItem.name || '-';
      document.getElementById('info-unit').textContent = selectedItem.isUnit ? '定量売り（箱単価）' : '量り売り（ポンド単価）';
      document.getElementById('info-base').textContent = '$' + (selectedItem.basePrice || 0).toFixed(2);
      if (existingCustomPrice) {
        document.getElementById('info-current-row').style.display = 'flex';
        document.getElementById('info-current').textContent = '$' + existingCustomPrice.price.toFixed(2);
        if (mode === 'Edit') {
          document.getElementById('price').value = existingCustomPrice.price;
        }
      } else {
        document.getElementById('info-current-row').style.display = 'none';
      }
    }

    function renderCost(cost) {
      if (!cost || !cost.eachCost) {
        document.getElementById('info-cost').textContent = '-';
        document.getElementById('info-margin').textContent = '-';
        return;
      }
      document.getElementById('info-cost').textContent = '$' + Number(cost.eachCost).toFixed(2);
      if (selectedItem && selectedItem.basePrice > 0) {
        const margin = ((selectedItem.basePrice - cost.eachCost) / selectedItem.basePrice * 100).toFixed(1);
        document.getElementById('info-margin').textContent = margin + '%';
      }
    }

    function onSubmit() {
      if (!selectedCustomer) { showMsg('顧客を選択してください', 'error'); return; }
      const sku = document.getElementById('sku').value;
      if (!sku) { showMsg('SKUを選択してください', 'error'); return; }
      const note = document.getElementById('note').value.trim();

      if (mode === 'Delete') {
        if (!confirm(`削除すると標準価格に戻ります。よろしいですか？\n\n${selectedCustomer.name} × ${sku}`)) return;
        google.script.run.withSuccessHandler(onResult).deleteCustomPrice({
          customerId: selectedCustomer.id,
          sku: sku,
          note: note
        });
        return;
      }

      const price = parseFloat(document.getElementById('price').value);
      if (isNaN(price) || price <= 0) {
        showMsg('価格は0より大きい数値で入力してください', 'error');
        return;
      }

      // 高額警告
      if (price >= 1000) {
        if (!confirm(`価格 $${price.toFixed(2)} が高額です。本当によろしいですか？`)) return;
      }
      // 赤字売り警告
      const costText = document.getElementById('info-cost').textContent;
      const costMatch = costText.match(/\$([\d.]+)/);
      if (costMatch) {
        const cost = parseFloat(costMatch[1]);
        if (price < cost) {
          if (!confirm(`仕入価格 $${cost.toFixed(2)} を下回ります（赤字売り）。本当によろしいですか？`)) return;
        }
      }

      const data = {
        customerId: selectedCustomer.id,
        sku: sku,
        price: price,
        note: note
      };

      if (mode === 'Add') {
        google.script.run.withSuccessHandler(onResult).addCustomPrice(data);
      } else if (mode === 'Edit') {
        google.script.run.withSuccessHandler(onResult).changeCustomPrice(data);
      }
    }

    function onResult(res) {
      if (res.success) {
        showMsg(res.message, 'success');
        setTimeout(() => google.script.host.close(), 1200);
      } else if (res.duplicate) {
        if (confirm(res.message + '\n\n変更画面に切り替えますか？')) {
          mode = 'Edit';
          setMode('Edit');
        }
      } else {
        showMsg(res.message, 'error');
      }
    }

    function showMsg(text, type) {
      const box = document.getElementById('messages');
      box.innerHTML = `<div class="${type}">${text}</div>`;
    }

    document.getElementById('show-all-customers').onclick = function() {
      google.script.run.withSuccessHandler(all => {
        const id = prompt('Individualに変更したい顧客のCustomer IDまたは名前を入力:');
        if (!id) return;
        const target = all.find(c => c.id === id || c.name === id || c.name.toLowerCase().includes(id.toLowerCase()));
        if (!target) { alert('顧客が見つかりません'); return; }
        if (target.group === 'Individual') { alert('既にIndividualです'); return; }
        if (!confirm(`${target.name} (${target.id}) をIndividualに変更しますか？`)) return;
        google.script.run.withSuccessHandler(res => {
          if (res.success) { alert(res.message); loadCustomers(); }
          else alert(res.message);
        }).changeCustomerToIndividual(target.id);
      }).getAllCustomers();
    };
  </script>
</body>
</html>
```

### 5-3. HTML/JSの構造

- **フォーム要素**：顧客プルダウン、SKU検索ボックス、価格入力、Note
- **参考情報ボックス**：商品名・販売単位・仕入価格・標準価格・粗利率・現在のCustom Price
- **モード切替**：Add / Edit / Delete でボタンと挙動を変える
- **警告ダイアログ**：高額（$1000以上）、赤字売り（仕入未満）、重複登録時

---

## 6. デプロイ手順（開発用）

開発用 Cost list スプレッドシートで実施：

### Step 1：既存ファイルを改修

1. `_main.gs` の `onOpen()` 末尾に「価格管理」メニュー追加
2. `price_sync_test.gs` の `EXCLUDE_SHEETS` に3行追加
3. `vedor_formulas.gs` の `VF_EXCLUDE` に3行追加
4. `rebuild preferred price.gs` の `PP_EXCLUDE_SHEETS` に3行追加（小文字で）

### Step 2：新規ファイル3つを追加

5. Apps Scriptエディタで「+」ボタンから新規ファイル作成
6. `cost_reference.gs` を作成して本ファイルの内容を貼り付け
7. `custom_prices_form.gs` を作成して本ファイルの内容を貼り付け
8. `custom_prices_form.html` を作成して本ファイルの内容を貼り付け
   - ファイル種別：HTML を選択

### Step 3：環境変数を開発用に書き換え

9. `custom_prices_form.gs` の以下の定数を開発用IDに書き換え：
   - `CLIENT_INFO_ID`
   - `ITEM_LIST_ID`

### Step 4：動作確認

10. Cost list を再読み込み（F5）
11. メニューバーに「価格管理」が表示されることを確認
12. 「個別価格を追加」をクリック → フォームが起動することを確認
13. 「Cost Reference を更新」をクリック → Cost Reference シートが生成されることを確認

---

## 7. テスト項目（フェーズ1完了確認）

開発用 Cost list で以下が動作することを確認：

- [ ] メニュー「価格管理」が表示される
- [ ] 「個別価格を追加」フォームが起動する
- [ ] Individual顧客のプルダウンが表示される
- [ ] SKU検索でオートコンプリート動作
- [ ] 商品選択時に参考情報（仕入価格・標準価格・粗利）が表示される
- [ ] 個別価格を追加 → Custom Prices シートに記録される
- [ ] 同時に Custom Price Log にログが記録される
- [ ] 重複追加 → 「変更画面に切替」ダイアログ表示
- [ ] 価格を変更 → 変更前後がログに残る
- [ ] 価格を削除 → シートから消えて、ログに「Delete」記録
- [ ] 「他の顧客を追加」→ 任意顧客をIndividualに変更できる
- [ ] 「Cost Reference を更新」で Cost Reference シートが正しく集計される
- [ ] Sort & Clean を全タブに実行しても、新規シート3つは整列対象外
- [ ] Preferred Price 再構築でも、新規シート3つはスキャン対象外

---

## 8. 実装把握チェックリスト

このファイルを読み終わったら、以下を確認してください：

- [ ] 既存ファイル4つの改修は「追加のみ」だと理解した
- [ ] 新規ファイル3つの役割と関数構成を把握した
- [ ] フォームの動作フロー（モード切替・データ取得・操作実行）を理解した
- [ ] 開発用にスプレッドシートIDを書き換えることを忘れない
- [ ] テスト項目14項目を確認することを理解した

OKならば **04-server-changes.md** に進んでください。
