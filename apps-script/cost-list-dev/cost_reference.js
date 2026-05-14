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
      const dateVal = data[i][4]; // ← 変更
      return {
        sku: data[i][0],
        eachCost: data[i][1],
        lbsCost: data[i][2],
        vendor: data[i][3],
        updateDate: (dateVal instanceof Date) ? dateVal.toISOString() : String(dateVal || ''), // ← 変更（Date→ISO文字列化）
      };
    }
  }
  return null;
}
