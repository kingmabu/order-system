/*******************************************************
 * price_sync_test.gs（旧 vendortools）
 *
 * 役割：
 * - ベンダータブの自動検出
 * - F/N列の変更 → 同行 H列に更新日を自動記録
 * - 手入力: onVendorEdit で即時反映（_main.gs から呼ばれる）
 * - 数式/連動: 5分監視 watchVendorPrices で追随
 * - 🔒保護タブ・テンプレ・管理タブは自動除外
 *
 * 注意：
 * - onEdit / onOpen は _main.gs に統合しました
 * - このファイルは「機能関数」だけを提供します
 *******************************************************/

// ===== 列番号 =====
const COL_F = 6;   // F列（価格1）
const COL_N = 14;  // N列（価格2）
const COL_H = 8;   // H列（更新日）
const H_DATE_FORMAT = 'M/d/yyyy';

const DP = PropertiesService.getDocumentProperties();

/* ===== 明示除外するタブ名 =====
   ※ ここにある名前は対象外。完全一致で判定。
   ※ costlist_cleanup.gs もこの定数を参照しています。 */
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

/* ===== ログ（任意） ===== */
function vendorLog_(msg, obj) {
  try {
    const ss = SpreadsheetApp.getActive();
    if (!ss) return;
    const sh = ss.getSheetByName('VendorLog') || ss.insertSheet('VendorLog');
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
    sh.appendRow([now, msg, JSON.stringify(obj || {})]);
  } catch (_) {}
}

/* ===== ユーティリティ ===== */
function _memKey_(sheetName) { return `vendor_prevFN_${sheetName}`; }

/** シートが保護（鍵アイコン）されているか */
function _isProtected_(sh) {
  try {
    if (typeof sh.getProtections === 'function') {
      const arr = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET) || [];
      if (arr.length > 0) return true;
    }
  } catch (_) {}
  return false;
}

/** 対象タブか？（テンプレ/保護/空データを除外） */
function _isVendorSheet_(sh) {
  const name = String(sh.getName() || '').trim();
  if (EXCLUDE_SHEETS.has(name)) return false;
  if (_isProtected_(sh)) return false;

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < Math.max(COL_F, COL_N, COL_H)) return false;

  const n = lastRow - 1;
  const fDisp = sh.getRange(2, COL_F, n, 1).getDisplayValues().flat();
  const nDisp = sh.getRange(2, COL_N, n, 1).getDisplayValues().flat();
  const hasData = fDisp.some(v => String(v).trim() !== '') || nDisp.some(v => String(v).trim() !== '');
  return hasData;
}

/** 対象タブ一覧 */
function _listVendorSheets_() {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheets().filter(_isVendorSheet_);
}

/* ================= onVendorEdit（手入力即時反映） =================
 * _main.gs の onEdit から呼ばれます
 ================================================================ */
function onVendorEdit(e) {
  if (!e) return;
  const sh = e.range.getSheet();
  if (!_isVendorSheet_(sh)) return;

  const c0 = e.range.getColumn();
  const c1 = c0 + e.range.getNumColumns() - 1;
  const hitsF = (c0 <= COL_F && COL_F <= c1);
  const hitsN = (c0 <= COL_N && COL_N <= c1);
  if (!(hitsF || hitsN)) return;

  const r0 = e.range.getRow();
  const startRow = Math.max(r0, 2);
  const nRows = r0 + e.range.getNumRows() - startRow;
  if (nRows <= 0) return;

  const today = new Date();
  try {
    const fDisp = sh.getRange(startRow, COL_F, nRows, 1).getDisplayValues();
    const nDisp = sh.getRange(startRow, COL_N, nRows, 1).getDisplayValues();

    const outH = Array.from({ length: nRows }, (_, i) => {
      const f = String(fDisp[i][0] ?? '').trim();
      const n = String(nDisp[i][0] ?? '').trim();
      return [(f !== '' || n !== '') ? today : ''];
    });

    sh.getRange(startRow, COL_H, nRows, 1)
      .setValues(outH)
      .setNumberFormat(H_DATE_FORMAT);

    const key = _memKey_(sh.getName());
    const prevMap = JSON.parse(DP.getProperty(key) || '{}');
    for (let i = 0; i < nRows; i++) {
      const row = String(startRow + i);
      const f  = String(fDisp[i][0] ?? '');
      const nn = String(nDisp[i][0] ?? '');
      prevMap[row] = `${f}|${nn}`;
    }
    DP.setProperty(key, JSON.stringify(prevMap));
  } catch (err) {
    vendorLog_('onVendorEdit setValues error', { sheet: sh.getName(), err: String(err) });
  }
}

/* ================= 5分監視（数式・連動対応） ================= */
function watchVendorPrices() {
  const ss = SpreadsheetApp.getActive();
  _listVendorSheets_().forEach(sh => {
    const name = sh.getName();
    const last = sh.getLastRow();
    if (last < 2) return;

    const n = last - 1;
    const fDisp = sh.getRange(2, COL_F, n, 1).getDisplayValues();
    const nDisp = sh.getRange(2, COL_N, n, 1).getDisplayValues();

    const key = _memKey_(name);
    let prevMap = JSON.parse(DP.getProperty(key) || '{}');

    if (Object.keys(prevMap).length === 0) {
      const init = {};
      for (let i = 0; i < n; i++) {
        const f  = String(fDisp[i][0] ?? '');
        const nn = String(nDisp[i][0] ?? '');
        init[String(2 + i)] = `${f}|${nn}`;
      }
      DP.setProperty(key, JSON.stringify(init));
      return;
    }

    const outH = sh.getRange(2, COL_H, n, 1).getValues();
    let changed = false;
    for (let i = 0; i < n; i++) {
      const row = String(2 + i);
      const f  = String(fDisp[i][0] ?? '').trim();
      const nn = String(nDisp[i][0] ?? '').trim();
      const cur = `${f}|${nn}`;
      const old = String(prevMap[row] ?? '');
      if (cur !== old) {
        outH[i][0] = (f !== '' || nn !== '') ? new Date() : '';
        prevMap[row] = cur;
        changed = true;
      }
    }
    if (changed) {
      try {
        sh.getRange(2, COL_H, n, 1).setValues(outH).setNumberFormat(H_DATE_FORMAT);
        DP.setProperty(key, JSON.stringify(prevMap));
      } catch (err) {
        vendorLog_('watchVendorPrices setValues error', { sheet: name, err: String(err) });
      }
    }
  });
}

/* ================= セットアップ／メンテ ================= */
function setupInstall() {
  removeAllVendorTriggers();
  ScriptApp.newTrigger('onVendorEdit')
    .forSpreadsheet(SpreadsheetApp.getActive().getId())
    .onEdit().create();
  ScriptApp.newTrigger('watchVendorPrices')
    .timeBased().everyMinutes(5).create();
  SpreadsheetApp.getActive().toast('onEdit と 5分監視トリガーをセットしました');
}

function removeAllVendorTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  SpreadsheetApp.getActive().toast('すべてのトリガーを削除しました');
}

function clearVendorMemory() {
  _listVendorSheets_().forEach(sh => DP.deleteProperty(_memKey_(sh.getName())));
  SpreadsheetApp.getActive().toast('前回値メモリを削除しました');
}

function showVendorTargets() {
  const names = _listVendorSheets_().map(s => s.getName());
  SpreadsheetApp.getActive().toast(`対象タブ: ${names.join(', ')}`);
}