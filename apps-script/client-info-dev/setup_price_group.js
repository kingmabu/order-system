/**
 * Phase 2: Client list に Price Group 列・Markup % 列を追加する使い捨てセットアップスクリプト
 *
 * 実行手順:
 *   1. 開発用 Client Information スプレッドシートを開く
 *   2. 拡張機能 → Apps Script でスクリプトエディタを開く
 *   3. このファイルの内容をコピーして貼り付ける
 *   4. setupPriceGroupColumns 関数を選択して実行
 *   5. ログを確認（表示 → ログ）
 *
 * 冪等性: 何度実行してもOK（ヘッダーは上書き、プルダウンは再設定）
 *
 * 仕様:
 *   - W列: Price Group（プルダウン: Standard / Group A / Individual）
 *   - X列: Markup %（Group Aのみ 1.5、それ以外は空欄。将来拡張用）
 */

// ============================================================
// 設定値（必要に応じて変更）
// ============================================================
const PG_SHEET_NAME = 'Client list';
const PG_HEADER_ROW = 1;              // ヘッダー行の位置
const PG_COL_PRICE_GROUP = 23;        // W列
const PG_COL_MARKUP = 24;             // X列
const PG_VALID_GROUPS = ['Standard', 'Group A', 'Individual'];

// ============================================================
// メイン関数: 実行するのはこの関数
// ============================================================
function setupPriceGroupColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PG_SHEET_NAME);

  if (!sheet) {
    throw new Error(`シート "${PG_SHEET_NAME}" が見つかりません。シート名を確認してください。`);
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  Logger.log(`シート: ${PG_SHEET_NAME}`);
  Logger.log(`現在の最終行: ${lastRow}, 最終列: ${lastCol}`);

  if (lastCol >= PG_COL_PRICE_GROUP) {
    Logger.log(`⚠ 警告: 既に ${PG_COL_PRICE_GROUP}列目以降に何か入っています。上書きされます。`);
  }

  // 1. W列ヘッダー設定 (Price Group)
  setHeader_(sheet, PG_COL_PRICE_GROUP, 'Price Group', '#4a86e8');

  // 2. X列ヘッダー設定 (Markup %)
  setHeader_(sheet, PG_COL_MARKUP, 'Markup %', '#4a86e8');

  // 3. W列にプルダウン設定（ヘッダーの下の行から最終行まで）
  if (lastRow > PG_HEADER_ROW) {
    const numDataRows = lastRow - PG_HEADER_ROW;
    const validationRange = sheet.getRange(PG_HEADER_ROW + 1, PG_COL_PRICE_GROUP, numDataRows, 1);
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(PG_VALID_GROUPS, true)   // 第2引数=true → プルダウン表示
      .setAllowInvalid(false)                       // 範囲外の値を拒否
      .setHelpText('Standard / Group A / Individual のいずれかを選択してください')
      .build();
    validationRange.setDataValidation(rule);
    Logger.log(`プルダウン設定: W${PG_HEADER_ROW + 1}:W${lastRow} (${numDataRows}行)`);
  } else {
    Logger.log('データ行がないため、プルダウン設定はスキップしました。');
  }

  // 4. 1行目のフリーズ（既にフリーズされていれば変更しない）
  if (sheet.getFrozenRows() < PG_HEADER_ROW) {
    sheet.setFrozenRows(PG_HEADER_ROW);
    Logger.log(`${PG_HEADER_ROW}行目までフリーズしました。`);
  }

  // 5. 列幅を見やすく調整
  sheet.setColumnWidth(PG_COL_PRICE_GROUP, 130);
  sheet.setColumnWidth(PG_COL_MARKUP, 100);

  Logger.log('✅ セットアップ完了');
  Logger.log('次のステップ: Group A 10社 / Individual 15社 の行のW列に値を入力してください。残りは "Standard" で一括埋めできます。');

  SpreadsheetApp.getUi().alert(
    'セットアップ完了',
    `W列 (Price Group) と X列 (Markup %) を追加しました。\n\n` +
    `次のステップ:\n` +
    `1. Group A の10社の行のW列に "Group A" を選択\n` +
    `2. Individual の15社の行のW列に "Individual" を選択\n` +
    `3. 残りの行に "Standard" を一括入力\n` +
    `4. Group A の行は X列に 1.5 を入力`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ============================================================
// ユーティリティ: ヘッダーセル設定
// ============================================================
function setHeader_(sheet, col, label, bgColor) {
  const cell = sheet.getRange(PG_HEADER_ROW, col);
  cell.setValue(label);
  cell.setBackground(bgColor);
  cell.setFontColor('#ffffff');
  cell.setFontWeight('bold');
  cell.setHorizontalAlignment('center');
  cell.setVerticalAlignment('middle');
  Logger.log(`ヘッダー設定: ${columnToLetter_(col)}${PG_HEADER_ROW} = "${label}"`);
}

// ============================================================
// ユーティリティ: 列番号 → 列文字（23 → "W"）
// ============================================================
function columnToLetter_(col) {
  let letter = '';
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    letter = String.fromCharCode(65 + r) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// ============================================================
// 確認用: 現状を表示するだけ（実行前のチェック用）
// ============================================================
function checkClientListStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PG_SHEET_NAME);

  if (!sheet) {
    Logger.log(`❌ シート "${PG_SHEET_NAME}" が見つかりません`);
    return;
  }

  Logger.log(`シート名: ${sheet.getName()}`);
  Logger.log(`最終行: ${sheet.getLastRow()}`);
  Logger.log(`最終列: ${sheet.getLastColumn()} (${columnToLetter_(sheet.getLastColumn())})`);
  Logger.log(`フリーズ行: ${sheet.getFrozenRows()}`);

  // ヘッダー行を表示
  if (sheet.getLastColumn() > 0) {
    const headers = sheet.getRange(PG_HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log(`ヘッダー行 (${PG_HEADER_ROW}行目):`);
    headers.forEach((h, i) => {
      Logger.log(`  ${columnToLetter_(i + 1)}列: "${h}"`);
    });
  }
}
