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

// Group B / Group C は Custom Prices シートに「疑似Customer ID」で共有価格を持つ // ← 変更（5分類対応）
const GROUP_B_LOOKUP_KEY = 'GROUP_B'; // ← 変更
const GROUP_C_LOOKUP_KEY = 'GROUP_C'; // ← 変更
const GROUP_B_DISPLAY_NAME = 'Group B (Daikoku - 6社共通)'; // ← 変更
const GROUP_C_DISPLAY_NAME = 'Group C (Manpuku - 4社共通)'; // ← 変更

// Client Information のスプレッドシートID（開発用） // ← 変更
const CLIENT_INFO_ID = '1Jqmqs-FVmhXrG7GqPbh6bkvaRWHZXtAEHUsWkZV4f8o'; // ← 変更（開発用ID）
const CLIENT_LIST_SHEET = 'Client list';

// Item List のスプレッドシートID（開発用） // ← 変更
const ITEM_LIST_ID = '1dIiwCvK8DRXiRX9jGcaKmlc_x6QxsVmS_0dGpukjXAY'; // ← 変更（開発用ID）
const ITEM_LIST_SHEET = '商品一覧';

// Client list の列番号（W列 = Price Group, X列 = Markup %） // ← 変更
// Phase 2でX/Y列→W/X列に変更（仕様書 02-data-structures.md 5-2参照）
const CL_COL_CUSTOMER_ID = 1;  // A
const CL_COL_CUSTOMER_NAME = 2; // B（必要に応じて調整）
const CL_COL_PRICE_GROUP = 23; // W // ← 変更
const CL_COL_MARKUP = 24;      // X // ← 変更

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
  // A列（Customer ID）をテキスト形式に（"011" の先頭ゼロ保持） // ← 変更
  sh.getRange('A2:A').setNumberFormat('@');
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
 * Custom Price 入力対象の一覧を取得（Add モードで使用） // ← 変更（新規追加）
 * Group B / Group C の仮想エントリ（共有価格用）＋ Individual 顧客 を返す。
 * - Group B/C は Client list に該当顧客がいる場合のみ追加（社数表示は実件数）。
 * - 仮想エントリは id='GROUP_B' / 'GROUP_C'、isGroup=true で識別。
 * @return {Array} [{ id, name, isGroup }, ...]
 */
function getCustomPriceTargets() {
  const ss = SpreadsheetApp.openById(CLIENT_INFO_ID);
  const sh = ss.getSheetByName(CLIENT_LIST_SHEET);
  if (!sh) throw new Error('Client list が見つかりません');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2, 1, lastRow - 1, CL_COL_PRICE_GROUP).getValues();
  let countGroupB = 0;
  let countGroupC = 0;
  const individuals = [];

  data.forEach(row => {
    const id = String(row[CL_COL_CUSTOMER_ID - 1] || '').trim();
    const name = String(row[CL_COL_CUSTOMER_NAME - 1] || '').trim();
    const group = String(row[CL_COL_PRICE_GROUP - 1] || '').trim();
    if (!id || !name) return;
    if (group === 'Group B') countGroupB++;
    else if (group === 'Group C') countGroupC++;
    else if (group === 'Individual') {
      individuals.push({ id: _normalizeId_(id), name: name, isGroup: false });
    }
  });

  const result = [];
  if (countGroupB > 0) {
    result.push({
      id: GROUP_B_LOOKUP_KEY,
      name: `🔷 Group B (Daikoku - ${countGroupB}社共通)`,
      isGroup: true,
    });
  }
  if (countGroupC > 0) {
    result.push({
      id: GROUP_C_LOOKUP_KEY,
      name: `🔶 Group C (Manpuku - ${countGroupC}社共通)`,
      isGroup: true,
    });
  }
  individuals.sort((a, b) => a.name.localeCompare(b.name));
  return result.concat(individuals);
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
    // I列チェックボックスは true/false 真偽値だが、文字列 'TRUE' のケースにも備える // ← 変更
    const unitRaw = row[IL_COL_UNIT_CHECK - 1];
    const isUnit = unitRaw === true || unitRaw === 'TRUE' || unitRaw === 'true';
    const priceLb = _parsePrice_(row[IL_COL_PRICE_LB - 1]);     // J列（$/lb） // ← 変更
    const priceUnit = _parsePrice_(row[IL_COL_PRICE_UNIT - 1]); // K列（"$105.75/Box" 文字列も数値化） // ← 変更
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
    const updateDateRaw = row[5];                                                                       // ← 変更
    const updateDate = (updateDateRaw instanceof Date) ? updateDateRaw.toISOString() : String(updateDateRaw || ''); // ← 変更（Date→ISO文字列化、シリアライズ崩れ対策）
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

    // Customer Name を解決 // ← 変更（Group B/C 疑似ID対応）
    // - GROUP_B / GROUP_C は Client list に存在しないので仮想表示名を使う
    // - それ以外は従来通り Client list から取得
    let customerName;
    if (normId === GROUP_B_LOOKUP_KEY) {
      customerName = GROUP_B_DISPLAY_NAME;
    } else if (normId === GROUP_C_LOOKUP_KEY) {
      customerName = GROUP_C_DISPLAY_NAME;
    } else {
      const customer = getAllCustomers().find(c => c.id === normId);
      if (!customer) return { success: false, message: '顧客が見つかりません' };
      customerName = customer.name;
    }

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
      customerName, // ← 変更
      data.sku,
      item.name,
      priceNum,
      today,
      data.note || ''
    ]);

    // 日付フォーマット
    const lastRow = sh.getLastRow();
    sh.getRange(lastRow, 6).setNumberFormat('M/d/yyyy');
    // Customer ID を確実にテキストで保存（"011" の先頭ゼロを保持） // ← 変更
    // appendRow は列のPlain text書式が効かず数値化されることがあるため、書式設定後に再代入する
    sh.getRange(lastRow, 1).setNumberFormat('@').setValue(normId);

    // ログ記録
    _appendLog_('Add', normId, customerName, data.sku, item.name, null, priceNum, data.note); // ← 変更

    return {
      success: true,
      message: `追加しました: ${customerName} × ${data.sku} → $${priceNum}` // ← 変更
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
 * 価格セルの値を数値化する。 // ← 変更（箱単価バグ修正）
 * 数値ならそのまま、文字列なら数字部分だけを抽出する。
 *  Item List K列は表示用数式 =IF(I,"$"&TEXT(J*N,"0.00")&"/"&M,"") のため
 *  "$105.75/Box" のような文字列で返り、Number() では NaN→0 になる問題に対応。
 *  例: 105.75 → 105.75 / "$105.75/Box" → 105.75 / "$1,105.75/Box" → 1105.75 / "" → 0
 */
function _parsePrice_(val) {
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/,/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
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
  // Customer ID（C列）をテキストで保存（"011" の先頭ゼロを保持） // ← 変更
  sh.getRange(lastRow, 3).setNumberFormat('@').setValue(customerId);
}
