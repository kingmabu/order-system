/**
 * Phase 2: Client list に Price Group 列・Markup % 列を追加する使い捨てセットアップスクリプト
 *
 * 🛑 重要: Code.gs を上書きしないこと
 *   開発用 Client Information の Code.gs には CustomerID生成・QBOリンク・Form自動生成 などの
 *   本番ロジックが入っています。本スクリプトは「別ファイル」として追加してください。
 *
 * 実行手順:
 *   1. 開発用 Client Information スプレッドシートを開く
 *   2. 拡張機能 → Apps Script でスクリプトエディタを開く
 *   3. 左サイドバーの「ファイル」横の「＋」→「スクリプト」で新規ファイル `setup_price_group` を作成
 *      （既に同名ファイルがある場合は事前に古い方を削除。同一定数・関数の二重定義はエラーになる）
 *   4. 新規ファイルの中身を全削除し、このファイルの内容を全コピーで貼り付ける
 *   5. setupPriceGroupColumns 関数を選択して実行
 *   6. ログを確認（表示 → ログ）
 *
 * 冪等性: 何度実行してもOK（ヘッダーは上書き、プルダウンは再設定）
 *
 * 仕様:
 *   - W列: Price Group（プルダウン: Standard / Group A / Group B / Group C / Group D / Individual） // ← 変更（6分類対応）
 *   - X列: Markup %（Group Aのみ 2.00、それ以外は空欄）
 */

// ============================================================
// 設定値（必要に応じて変更）
// ============================================================
const PG_SHEET_NAME = 'Client list';
const PG_HEADER_ROW = 1;              // ヘッダー行の位置
const PG_COL_PRICE_GROUP = 23;        // W列
const PG_COL_MARKUP = 24;             // X列
const PG_VALID_GROUPS = ['Standard', 'Group A', 'Group B', 'Group C', 'Group D', 'Individual']; // ← 変更（Group B/C/D 追加）

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
      .setHelpText('Standard / Group A / Group B / Group C / Group D / Individual のいずれかを選択してください') // ← 変更
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
  Logger.log('次のステップ: Group A 12社 / Group B 6社 / Group C 4社 / Group D 5社 / Individual 9社 のW列を入力。残りは "Standard" で一括埋め。'); // ← 変更（6分類対応）

  SpreadsheetApp.getUi().alert(
    'セットアップ完了',
    `W列 (Price Group) と X列 (Markup %) を追加しました。\n\n` +
    `次のステップ:\n` +
    `1. Group A 12社（Jinya Group）の行のW列に "Group A" を選択\n` +     // ← 変更
    `2. Group B 6社（Daikoku Group）の行のW列に "Group B" を選択\n` +   // ← 変更
    `3. Group C 4社（Manpuku）の行のW列に "Group C" を選択\n` +         // ← 変更
    `4. Group D 5社（Ramen Joint-Aikan）の行のW列に "Group D" を選択\n` + // ← 変更
    `5. Individual 9社 の行のW列に "Individual" を選択\n` +              // ← 変更
    `6. 残りの行に "Standard" を一括入力\n` +
    `7. Group A の行は X列に 2.00 を入力（Group B/C/D/Individual は X列空欄）`, // ← 変更
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

// ============================================================
// 本番移植用: Customer ID で W列(Price Group)/X列(Markup %)を一括分類 // ← 追加
//   実行するのはこの関数: classifyClients
//   - A列(Customer ID)を読み、6分類を自動入力。リスト外は Standard。
//   - Group A のみ X列 = 2.00（それ以外は空欄）
//   - 冪等: 何度実行してもOK
// ============================================================
const PG_COL_CUSTOMER_ID = 1; // A列

const PG_CLASS_MAP = {
  'Group A': ['060', '008', '021', '024', '084', '093', '051', '062', '022', '068', '094', '061'],
  'Group B': ['064', '025', '013', '014', '002', '003'],
  'Group C': ['001', '019', '016', '028'],
  'Group D': ['035', '045', '070', '088', '033'],
  'Individual': ['011', '080', '018', '053', '050', '083', '006', '048'],
};

function classifyClients() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PG_SHEET_NAME);
  if (!sheet) {
    throw new Error(`シート "${PG_SHEET_NAME}" が見つかりません。`);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= PG_HEADER_ROW) {
    Logger.log('データ行がありません。');
    return;
  }
  const numRows = lastRow - PG_HEADER_ROW;

  // A列(Customer ID)を取得
  const idValues = sheet.getRange(PG_HEADER_ROW + 1, PG_COL_CUSTOMER_ID, numRows, 1).getValues();

  // ID → グループ の逆引きマップ（正規化キー）
  const idToGroup = {};
  Object.keys(PG_CLASS_MAP).forEach(function (group) {
    PG_CLASS_MAP[group].forEach(function (id) {
      idToGroup[normalizePgId_(id)] = group;
    });
  });

  const wValues = [];
  const xValues = [];
  const counts = { 'Standard': 0, 'Group A': 0, 'Group B': 0, 'Group C': 0, 'Group D': 0, 'Individual': 0, '(空行)': 0 };
  const foundIds = {};

  for (let i = 0; i < numRows; i++) {
    const normId = normalizePgId_(idValues[i][0]);
    if (normId === '') {
      wValues.push(['']);
      xValues.push(['']);
      counts['(空行)']++;
      continue;
    }
    const group = idToGroup[normId] || 'Standard';
    wValues.push([group]);
    xValues.push([group === 'Group A' ? 2.00 : '']);
    counts[group]++;
    if (idToGroup[normId]) foundIds[normId] = true;
  }

  // W列・X列に一括書き込み
  sheet.getRange(PG_HEADER_ROW + 1, PG_COL_PRICE_GROUP, numRows, 1).setValues(wValues);
  sheet.getRange(PG_HEADER_ROW + 1, PG_COL_MARKUP, numRows, 1).setValues(xValues);

  Logger.log('=== 分類結果（件数）===');
  Logger.log(`Group A   : ${counts['Group A']}  (期待 12)`);
  Logger.log(`Group B   : ${counts['Group B']}  (期待 6)`);
  Logger.log(`Group C   : ${counts['Group C']}  (期待 4)`);
  Logger.log(`Group D   : ${counts['Group D']}  (期待 5)`);
  Logger.log(`Individual: ${counts['Individual']}  (期待 8)`);
  Logger.log(`Standard  : ${counts['Standard']}`);
  Logger.log(`(空行)    : ${counts['(空行)']}`);

  // リストにあるのにシートで見つからなかったID
  const missing = [];
  Object.keys(idToGroup).forEach(function (id) {
    if (!foundIds[id]) missing.push(`${id}(${idToGroup[id]})`);
  });
  if (missing.length > 0) {
    Logger.log('⚠ シートに見つからなかったID: ' + missing.join(', '));
  } else {
    Logger.log('✅ リストの35社すべてシートで一致しました');
  }
}

// Customer ID 正規化: 文字列化→trim→数字のみなら3桁ゼロ埋め
function normalizePgId_(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (s === '') return '';
  if (/^\d+$/.test(s)) {
    while (s.length < 3) s = '0' + s;
  }
  return s;
}
