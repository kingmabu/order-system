/**
 * Preferred Price 再構築スクリプト
 * - 除外シート以外の全タブをベンダータブとみなす
 * - 各タブから A=SKU, H=日付, N=価格 を読み、SKUごとに最新日付の行を残す
 * - Preferred Price!A2:C に一括書き込み（A=SKU, B=価格, C=ベンダー名）
 *
 * 配置先: Cost list スプレッドシート
 */

const PP_TARGET_SHEET = 'Preferred Price';

// ベンダータブとみなさないシート（小文字比較）
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

// 列番号（1始まり）
const PP_COL_SKU   = 1;  // A
const PP_COL_DATE  = 8;  // H
const PP_COL_PRICE = 14; // N

function rebuildPreferredPrice() {
  const ss = SpreadsheetApp.getActive();
  const target = ss.getSheetByName(PP_TARGET_SHEET);
  if (!target) {
    SpreadsheetApp.getUi().alert(`シート「${PP_TARGET_SHEET}」が見つかりません`);
    return;
  }

  const all = ss.getSheets();
  const vendorSheets = all.filter(sh => {
    const name = sh.getName().trim().toLowerCase();
    if (PP_EXCLUDE_SHEETS.indexOf(name) !== -1) return false;
    if (name.startsWith('_')) return false; // _hidden 等は除外
    if (sh.isSheetHidden()) return false;
    return true;
  });

  // SKU -> { price, date, vendor } （最新日付を保持）
  const latest = {};
  const skipped = [];

  vendorSheets.forEach(sh => {
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < PP_COL_PRICE) {
      skipped.push(`${sh.getName()} (行/列不足)`);
      return;
    }
    const vendor = sh.getName();
    const range = sh.getRange(2, 1, lastRow - 1, PP_COL_PRICE).getValues();
    let pickedAny = false;
    range.forEach(row => {
      const sku   = row[PP_COL_SKU   - 1];
      const date  = row[PP_COL_DATE  - 1];
      const price = row[PP_COL_PRICE - 1];
      if (!sku || price === '' || price === null || !date) return;
      const priceNum = Number(price);
      if (isNaN(priceNum)) return;
      const dateMs = (date instanceof Date) ? date.getTime() : new Date(date).getTime();
      if (isNaN(dateMs)) return;

      const key = String(sku).trim();
      if (!key) return;
      pickedAny = true;
      const prev = latest[key];
      if (!prev || dateMs > prev.dateMs) {
        latest[key] = { price: priceNum, dateMs: dateMs, vendor: vendor };
      }
    });
    if (!pickedAny) skipped.push(`${sh.getName()} (有効データ0件)`);
  });

  // 出力配列：SKU昇順
  const skus = Object.keys(latest).sort();
  const out = skus.map(sku => [sku, latest[sku].price, latest[sku].vendor]);

  // 既存データクリア（A2:C 末尾まで）
  const lastTargetRow = target.getLastRow();
  if (lastTargetRow >= 2) {
    target.getRange(2, 1, lastTargetRow - 1, 3).clearContent();
  }
  if (out.length > 0) {
    target.getRange(2, 1, out.length, 3).setValues(out);
  }

  // ヘッダー保証
  const header = target.getRange(1, 1, 1, 3).getValues()[0];
  if (!header[0]) target.getRange(1, 1, 1, 3).setValues([['SKU', 'Price', 'Vendor']]);

  const msg =
    `Preferred Price 再構築完了\n` +
    `対象ベンダータブ: ${vendorSheets.length}\n` +
    `集計SKU数: ${out.length}\n` +
    (skipped.length ? `スキップ: ${skipped.join(', ')}` : '');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/**
 * 各ベンダータブのN列に数式を入れる
 *   N = IF(C="", M, M/C)
 *   - M列が空の行はスキップ（Nを空のままにする）
 *   - M列に値がある行のみ数式を書き込む
 */
function applyNFormulaAllVendors() {
  const ss = SpreadsheetApp.getActive();
  const sheets = ss.getSheets().filter(sh => {
    const name = sh.getName().trim().toLowerCase();
    if (PP_EXCLUDE_SHEETS.indexOf(name) !== -1) return false;
    if (name.startsWith('_')) return false;
    if (sh.isSheetHidden()) return false;
    return true;
  });

  const report = [];
  sheets.forEach(sh => {
    const lastRow = sh.getLastRow();
    if (lastRow < 2) { report.push(`${sh.getName()}: 行なし`); return; }

    // M列の値を取得して、データがある行だけ数式を書き込む
    const mVals = sh.getRange(2, 13, lastRow - 1, 1).getValues(); // M=13
    const formulas = mVals.map((row, i) => {
      const r = i + 2;
      const m = row[0];
      if (m === '' || m === null) return [''];
      return [`=IF(C${r}="", M${r}, M${r}/C${r})`];
    });
    sh.getRange(2, 14, lastRow - 1, 1).setFormulas(formulas); // N=14
    const filled = formulas.filter(f => f[0] !== '').length;
    report.push(`${sh.getName()}: ${filled}行`);
  });

  const msg = `N列数式適用完了\n` + report.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function addRebuildPreferredPriceMenuSafe() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('💲 Preferred Price')
      .addItem('再構築（全ベンダータブから集計）', 'rebuildPreferredPrice')
      .addSeparator()
      .addItem('全タブのN列に数式適用 (=M/C)', 'applyNFormulaAllVendors')
      .addToUi();
  } catch (e) {}
}
