/******************************************************
 * vedor_formulas.gs
 *
 * 役割：
 * - 商品一覧シート: E列でカテゴリ選択 → A列に品番自動生成
 *   （_codeGsOnEdit_ は _main.gs の onEdit から呼ばれる）
 * - ベンダータブのG/I/J/K/L/N列に数式を一括適用
 * - 新ベンダー用のテンプレートタブを作成
 *
 * 注意：
 * - onEdit / onOpen は _main.gs に統合しました
 * - F列編集時のH列日付更新は price_sync_test.gs が担当します
 * - このファイルでは F列監視はしません（重複を避けるため）
 ******************************************************/

// ===== 除外タブ（price_sync_test.gs の EXCLUDE_SHEETS と同期） =====
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

// 列番号
const VF_COL_C = 3;   // Weight
const VF_COL_E = 5;   // /Each (TRUE/FALSE)
const VF_COL_F = 6;   // LBS Cost
const VF_COL_G = 7;   // Each cost ← 数式
const VF_COL_H = 8;   // Update date
const VF_COL_I = 9;   // 15%
const VF_COL_J = 10;  // 20%
const VF_COL_K = 11;  // 25%
const VF_COL_L = 12;  // 30%
const VF_COL_M = 13;  // QB Price
const VF_COL_N = 14;  // Price ($/lbs)

const VF_DATE_FORMAT = 'M/d/yyyy';

// ===== ベンダータブかどうかの判定 =====
function _vfIsVendorSheet_(sh) {
  const name = sh.getName().trim();
  if (VF_EXCLUDE.has(name)) return false;
  if (sh.isSheetHidden()) return false;
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < VF_COL_N) return false;
  return true;
}

/* ================= 商品一覧の品番自動生成 =================
 * _main.gs の onEdit から呼ばれます
 * E列でカテゴリを選ぶと、A列に「B001」「P012」などの品番を自動生成
 ========================================================= */
function _codeGsOnEdit_(e) {
  if (!e || !e.source || !e.range) return;
  const sheet = e.source.getActiveSheet();
  const editedCell = e.range;
  if (sheet.getName() !== '商品一覧' || editedCell.getColumn() !== 5) return;

  const row = editedCell.getRow();
  if (row < 5) return;

  const 品番セル = sheet.getRange(row, 1);
  const カテゴリ = editedCell.getValue();

  if (品番セル.getValue() === '') {
    let prefix = 'X';
    switch (カテゴリ) {
      case '牛肉':   prefix = 'B'; break;
      case '豚肉':   prefix = 'P'; break;
      case '鶏肉':   prefix = 'C'; break;
      case 'ラム肉': prefix = 'L'; break;
      case '鴨肉':   prefix = 'D'; break;
      case '魚介類': prefix = 'S'; break;
      case 'その他': prefix = 'X'; break;
    }
    const data = sheet.getRange('A5:A').getValues().flat();
    const maxNum = data
      .filter(code => typeof code === 'string' && code.startsWith(prefix))
      .map(code => parseInt(code.slice(1)))
      .filter(n => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0);
    const newCode = prefix + ('000' + (maxNum + 1)).slice(-3);
    品番セル.setValue(newCode);
  }

  const lastRow = sheet.getLastRow();
  const sortRange = sheet.getRange(5, 1, lastRow - 4, sheet.getLastColumn());
  sortRange.sort({ column: 1, ascending: true });
}

// ===== 全ベンダータブに数式を一括適用 =====
function applyFormulasAllVendors() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();

  const res = ui.alert(
    '確認',
    '全ベンダータブのG/I/J/K/L/N列を数式で上書きします。\n' +
    'G列・N列の手入力値はすべて消えます。よろしいですか？',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  const sheets = ss.getSheets().filter(_vfIsVendorSheet_);
  const report = [];

  sheets.forEach(sh => {
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    const n = lastRow - 1; // データ行数（2行目〜）

    const gFormulas = [], iFormulas = [], jFormulas = [],
          kFormulas = [], lFormulas = [], nFormulas = [];

    for (let i = 0; i < n; i++) {
      const r = i + 2;
      // G = IF(E=TRUE, C*F, F)
      gFormulas.push([`=IF(E${r}=TRUE,C${r}*F${r},F${r})`]);
      // I = G * 1.15
      iFormulas.push([`=IF(G${r}="","",G${r}*1.15)`]);
      // J = G * 1.20
      jFormulas.push([`=IF(G${r}="","",G${r}*1.20)`]);
      // K = G * 1.25
      kFormulas.push([`=IF(G${r}="","",G${r}*1.25)`]);
      // L = G * 1.30
      lFormulas.push([`=IF(G${r}="","",G${r}*1.30)`]);
      // N = IF(C="", M, M/C)
      nFormulas.push([`=IF(C${r}="",M${r},IF(M${r}="","",M${r}/C${r}))`]);
    }

    sh.getRange(2, VF_COL_G, n, 1).setFormulas(gFormulas);
    sh.getRange(2, VF_COL_I, n, 1).setFormulas(iFormulas);
    sh.getRange(2, VF_COL_J, n, 1).setFormulas(jFormulas);
    sh.getRange(2, VF_COL_K, n, 1).setFormulas(kFormulas);
    sh.getRange(2, VF_COL_L, n, 1).setFormulas(lFormulas);
    sh.getRange(2, VF_COL_N, n, 1).setFormulas(nFormulas);

    report.push(`✅ ${sh.getName()}: ${n}行`);
  });

  ui.alert('完了\n\n' + report.join('\n'));
}

// ===== テンプレートタブを作成 =====
function createVendorTemplate() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const TMPL_NAME = 'VENDOR TEMPLATE';

  // すでにある場合は確認
  let tmpl = ss.getSheetByName(TMPL_NAME);
  if (tmpl) {
    const res = ui.alert(
      `「${TMPL_NAME}」はすでに存在します。\n上書きしますか？`,
      ui.ButtonSet.YES_NO
    );
    if (res !== ui.Button.YES) return;
    ss.deleteSheet(tmpl);
  }

  tmpl = ss.insertSheet(TMPL_NAME);

  // ヘッダー行
  const headers = [
    'SKU', 'Items', 'Weight', '/LBS', '/Each',
    'LBS Cost', 'Each cost', 'Update date',
    '15%', '20%', '25%', '30%',
    'QB Price', 'Price ($/lbs)'
  ];
  const hRange = tmpl.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setBackground('#4a86e8');
  hRange.setFontColor('#ffffff');
  hRange.setFontWeight('bold');
  tmpl.setFrozenRows(1);

  // サンプル行（2行目）に数式を入れてテンプレとして示す
  const r = 2;
  tmpl.getRange(r, VF_COL_G).setFormula(`=IF(E${r}=TRUE,C${r}*F${r},F${r})`);
  tmpl.getRange(r, VF_COL_I).setFormula(`=IF(G${r}="","",G${r}*1.15)`);
  tmpl.getRange(r, VF_COL_J).setFormula(`=IF(G${r}="","",G${r}*1.20)`);
  tmpl.getRange(r, VF_COL_K).setFormula(`=IF(G${r}="","",G${r}*1.25)`);
  tmpl.getRange(r, VF_COL_L).setFormula(`=IF(G${r}="","",G${r}*1.30)`);
  tmpl.getRange(r, VF_COL_N).setFormula(`=IF(C${r}="",M${r},IF(M${r}="","",M${r}/C${r}))`);

  // D列・E列にチェックボックス（/LBS と /Each）
  tmpl.getRange(r, 4).insertCheckboxes();
  tmpl.getRange(r, 5).insertCheckboxes();

  // H列の書式
  tmpl.getRange(r, VF_COL_H).setNumberFormat(VF_DATE_FORMAT);

  // 列幅の調整
  tmpl.setColumnWidth(1, 80);
  tmpl.setColumnWidth(2, 220);
  tmpl.setColumnWidth(8, 100);

  // 注記
  tmpl.getRange(4, 1).setValue('↑ このタブをコピーして新ベンダーのタブとして使用してください');
  tmpl.getRange(4, 1).setFontColor('#999999').setFontStyle('italic');

  ui.alert(
    `✅ 「${TMPL_NAME}」を作成しました。\n\n` +
    'このタブを右クリック →「コピーを作成」で\n' +
    '新しいベンダータブを追加できます。'
  );
}