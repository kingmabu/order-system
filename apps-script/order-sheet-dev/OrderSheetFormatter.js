/**
 * OrderSheetFormatter.gs（統合版 v2 / 改良版）
 * オーダーシート関連スクリプト
 *
 * このファイル1つで以下の2機能を提供する:
 *   1) Adjust Layout          … 既存：縞模様復元 / Replacement・Contact行の再描画 / QR手前クリア
 *   2) 現在のタブを再フォーマット … 新規：バックアップ作成 + 行高/列幅の最適化（撮影向け）
 *
 * 【v2 改良点】
 *   ・「QR(32行目)より上の合計高さは一定」を保ったまま、QR手前の“余白行”を縮め、
 *     その分を商品行の高さへ振り替える。→ QRは動かず（=2ページ目にあふれない）、表だけが拡大。
 *   ・商品数に応じて自動計算で、表がページの40%前後を占めるようにする。
 *   ・商品名の見切れ対策：B列を広げ、商品名セルを折り返し表示にする。
 *   ・Need replacement / Contact me 行の結合を A:E（行全体）にして文字の見切れを解消。
 *
 * 【重要】onOpen() は1つだけにすること（Apps Scriptは全ファイルが同一スコープに統合され、
 *        onOpen が複数あると後から読まれた方しか有効にならず、メニューが消える）。
 *        このファイルを「スクリプト本体」として使い、他ファイルに onOpen を残さないこと。
 *
 * 対象スプレッドシートID: 15gbPAWhROz0t33tBsnIMXYwlev1WH0vQ4YoqLxilybQ
 * 仕様書: OrderSheet_Reformat_Spec_v1.md（v2はその拡張）
 */


/* =========================================================================
 *  メニュー（統合 onOpen）
 *  1つのメニュー「📷 オーダーシート」に2項目を集約する。
 * ========================================================================= */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📷 オーダーシート')
    .addItem('Adjust Layout', 'adjustLayout')
    .addSeparator()
    .addItem('現在のタブを再フォーマット', 'reformatCurrentSheet')
    .addItem('全タブを一括再フォーマット', 'reformatAllSheets')
    .addSeparator()
    .addItem('バックアップタブを一括削除', 'deleteAllBackups')
    .addToUi();
}


/* =========================================================================
 *  【既存機能】Adjust Layout
 *  ※ ロジックは元のスクリプトのまま温存（onOpenの統合と、
 *     下記writer2つの結合範囲を A:B → A:E に拡大した点のみ変更）
 * ========================================================================= */
function adjustLayout() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const sheetName = sheet.getName();
  if (!sheetName.startsWith('OS-') || sheetName === 'OS-000-Template') return;

  const START_ROW = 10;
  const MAX_ROWS  = 25;

  const colorEven = sheet.getRange(START_ROW,     1).getBackground();
  const colorOdd  = sheet.getRange(START_ROW + 1, 1).getBackground();

  let lastSkuRow = START_ROW - 1;
  const allValues = sheet.getRange(START_ROW, 1, MAX_ROWS, 1).getValues();
  for (let i = 0; i < MAX_ROWS; i++) {
    const val = allValues[i][0].toString().trim();
    if (val.includes('Contact') || val.includes('Need replacement')) break;
    if (val !== '') lastSkuRow = START_ROW + i;
  }

  const blankRow       = lastSkuRow + 1;
  const replacementRow = lastSkuRow + 2;
  const contactRow     = lastSkuRow + 3;
  const qrStartRow     = 32;

  // SKU行の縞模様を復元
  for (let r = START_ROW; r <= lastSkuRow; r++) {
    const bg = ((r - START_ROW) % 2 === 0) ? colorEven : colorOdd;
    sheet.getRange(r, 1, 1, 5).setBackground(bg);
  }

  // blankRow〜QR直前をクリア
  const clearEnd = qrStartRow - 1;
  if (clearEnd >= blankRow) {
    sheet.getRange(blankRow, 1, clearEnd - blankRow + 1, 5)
      .clearContent()
      .setBackground('#ffffff')
      .setBorder(false, false, false, false, false, false);  // 全枠線をクリア
  }

  // Need replacement → Contact me の順で書き込み
  writeReplacementRow_(sheet, replacementRow);
  writeContactRow_(sheet, contactRow);

  // 最終SKU行の下枠線を復元
  sheet.getRange(lastSkuRow, 1, 1, 5).setBorder(
    null, null, true, null, null, null,
    '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  SpreadsheetApp.getActive().toast('Layout adjusted!');
}

function writeContactRow_(sheet, row) {
  // 既存の結合を解除してからクリア
  try { sheet.getRange(row, 1, 1, 5).breakApart(); } catch(e) {}
  sheet.getRange(row, 1, 1, 5).clearContent().setBackground('#ffffff');
  // A:E を行全体でマージして書き込み（文字の見切れ防止）
  const merged = sheet.getRange(row, 1, 1, 5);
  merged.merge();
  merged.setValue('Contact me : [  ]  Text  [  ]  Call          Message :');
  merged.setFontWeight('bold');
  merged.setFontColor('#000000');
  merged.setHorizontalAlignment('left');
  merged.setVerticalAlignment('middle');
}

function writeReplacementRow_(sheet, row) {
  try { sheet.getRange(row, 1, 1, 5).breakApart(); } catch(e) {}
  sheet.getRange(row, 1, 1, 5).clearContent().setBackground('#ffffff');
  // A:E を行全体でマージして書き込み（文字の見切れ防止）
  const merged = sheet.getRange(row, 1, 1, 5);
  merged.merge();
  merged.setValue('Need replacement : [  ]  Marker  [  ]  Sleeve');
  merged.setFontWeight('bold');
  merged.setFontColor('#000000');
  merged.setHorizontalAlignment('left');
  merged.setVerticalAlignment('middle');
}


/* =========================================================================
 *  【新規機能 v2】現在のタブを再フォーマット
 *  目的: 商品数が少ないタブでも表が大きく写るよう、QR手前の余白を商品行へ振り替える。
 *        変更するのは「行高」と「列幅」（＋商品名の折り返しと、フッター行の結合範囲）のみ。
 *        商品データ・テキスト内容・フォント・文字色・罫線・背景色は変更しない。
 * ========================================================================= */

// マスターテンプレートのタブ名（再フォーマット対象外）
var MASTER_TEMPLATE_NAME = 'OS-000-Template';

// QRブロックの開始行（テンプレート固定。adjustLayoutのqrStartRowと共通）
var QR_TOP_ROW   = 32;
var GAP_END_ROW  = QR_TOP_ROW - 1; // 余白行の最終行（=31）

// 余白行の最小高さ（px）。ほぼ詰めて、その分を表へ回す
var MIN_GAP_ROW_HEIGHT = 3;

// 商品行高の上限・下限（px）。1〜2商品が極端に高くなりすぎないよう上限を設ける
var MAX_PRODUCT_ROW_HEIGHT = 130;
var MIN_PRODUCT_ROW_HEIGHT = 26;

// 列幅の設定（ピクセル）。印刷時の右余白を埋めるため拡大（合計1000px）
var COLUMN_WIDTHS = {
  A: 100,  // SKU                                    // ← 変更（60→100）
  B: 400,  // ITEM NAME（長い商品名対策）            // ← 変更（300→400）
  C: 100,  // WEIGHT (lbs)
  D: 150,  // QTY（手書き数字をAIが読み取りやすいよう拡大） // ← 変更（135→150）
  E: 250   // NOTE                                    // ← 変更（350→250）
};

// SKU列（商品行）の文字サイズ
var SKU_FONT_SIZE = 20; // ← 変更（追加）


/**
 * 現在のタブを再フォーマットするメイン関数。
 *
 * 処理順序:
 *   0. 事前チェック（マスターテンプレート / 表ヘッダー / 商品数）
 *   1. 確認ダイアログ
 *   2. バックアップタブ作成
 *   3. 列幅の調整
 *   4. フッター行（Need replacement / Contact me）の結合をA:Eに整え直す（見切れ解消）
 *   5. 行高の再配分（余白→商品行。QR位置=32行目は不動）
 *   6. 商品名の折り返しを有効化
 *   7. 完了通知（トースト）
 */
function reformatCurrentSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();
  var ui = SpreadsheetApp.getUi();

  // --- 事前チェック1: マスターテンプレートは対象外 ---
  if (sheetName === MASTER_TEMPLATE_NAME) {
    ui.alert('マスターテンプレートは再フォーマットの対象外です');
    return;
  }

  // --- 事前チェック2: 表ヘッダー（"SKU"行）を探す ---
  var colA = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
  var headerRow = findHeaderRow_(colA); // 1始まりの行番号 / 見つからなければ -1
  if (headerRow === -1) {
    ui.alert('このタブにはオーダーシートの表が見つかりませんでした');
    return;
  }

  // --- 事前チェック3: 商品行数のカウント ---
  var productCount = countProductRows_(colA, headerRow);
  if (productCount === 0) {
    ui.alert('商品が登録されていません。先に商品を追加してください');
    return;
  }

  // --- ステップ1: 確認ダイアログ ---
  if (!showConfirmDialog_(sheetName)) {
    return; // キャンセルされたら何もしない
  }

  // --- ステップ2〜6: バックアップ作成＋列幅・フッター・行高・折返し・SKU文字（共通処理） ---
  var result;
  try {
    result = applyReformat_(sheet, colA, headerRow, productCount);
  } catch (e) {
    ui.alert('バックアップタブの作成に失敗しました。再度お試しください');
    return;
  }

  // 念のため元のタブをアクティブに戻す（バックアップ作成でコピー側に移っているため）
  ss.setActiveSheet(sheet);

  // --- ステップ7: 完了通知 ---
  ss.toast(
    'タブ: ' + sheetName + '\n' +
    '商品数: ' + productCount + '個\n' +
    '各行の高さ: ' + result.rowHeight + 'px\n' +
    'バックアップ: ' + result.backupName,
    '✅ 再フォーマット完了',
    8
  );
}


/**
 * 【共通処理】1タブ分の再フォーマット本体（UIなし）。
 *   バックアップ作成 → 列幅 → フッター整形 → 行高再配分 → 折返し → SKU文字拡大。
 *   reformatCurrentSheet（単体）と reformatAllSheets（一括）の両方から呼ぶ。
 *   ※ 事前チェック（テンプレ/表/商品数）は呼び出し側で済ませること。
 *
 * @param {Sheet}        sheet
 * @param {Array<Array>} colA          A列全体の値
 * @param {number}       headerRow     SKUヘッダー行（1始まり）
 * @param {number}       productCount  商品数
 * @return {{backupName:string, rowHeight:number}}
 * @throws バックアップ作成に失敗した場合
 */
function applyReformat_(sheet, colA, headerRow, productCount) {
  var firstProductRow = headerRow + 1;
  var lastProductRow  = headerRow + productCount;

  // フッター行を探す（Need replacement / Contact me）
  var replacementRow = findRowContaining_(colA, 'Need replacement', lastProductRow + 1, GAP_END_ROW);
  var contactRow     = findRowContaining_(colA, 'Contact',          lastProductRow + 1, GAP_END_ROW);

  // バックアップ作成（失敗時は例外を投げる）
  var backupName = createBackup_(sheet);

  // 列幅の調整（A〜E列）
  sheet.setColumnWidth(1, COLUMN_WIDTHS.A); // A: SKU
  sheet.setColumnWidth(2, COLUMN_WIDTHS.B); // B: ITEM NAME
  sheet.setColumnWidth(3, COLUMN_WIDTHS.C); // C: WEIGHT (lbs)
  sheet.setColumnWidth(4, COLUMN_WIDTHS.D); // D: QTY
  sheet.setColumnWidth(5, COLUMN_WIDTHS.E); // E: NOTE

  // フッター行の結合をA:Eに整え直す（見つかった場合のみ）
  if (replacementRow !== -1) writeReplacementRow_(sheet, replacementRow);
  if (contactRow     !== -1) writeContactRow_(sheet, contactRow);

  // 行高の再配分（余白→商品行。QR位置=32行目は不動）
  var rowHeight = applyFillLayout_(sheet, firstProductRow, productCount, contactRow, lastProductRow);

  // 商品名（B列）の折り返し ＋ SKU列（商品行）の文字サイズ拡大
  sheet.getRange(firstProductRow, 2, productCount, 1).setWrap(true);
  sheet.getRange(firstProductRow, 1, productCount, 1).setFontSize(SKU_FONT_SIZE);

  return { backupName: backupName, rowHeight: rowHeight };
}


/**
 * 【一括】全顧客タブ（OS-で始まるタブ）をまとめて再フォーマットする。
 *   ・マスターテンプレート / バックアップタブ / OS-以外 は対象外。
 *   ・既に「【タブ名】_backup」が存在するタブは「処理済み」とみなしスキップ
 *     （＝テスト済みタブや、前回の続きを二重に処理しない）。
 *   ・実行が5分を超えそうなら安全に中断し、再実行で続きから処理できる。
 */
function reformatAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // 処理開始前にシート一覧を固定（途中で作られるバックアップは対象に含めない）
  var sheets = ss.getSheets();

  var pending = [];
  var alreadyDone = 0;
  for (var i = 0; i < sheets.length; i++) {
    var nm = sheets[i].getName();
    if (nm === MASTER_TEMPLATE_NAME) continue;          // テンプレ除外
    if (isBackupName_(nm)) continue;                    // バックアップ除外
    if (nm.indexOf('OS-') !== 0) continue;              // OS-タブのみ対象
    if (ss.getSheetByName(nm + '_backup')) { alreadyDone++; continue; } // 処理済み
    pending.push(sheets[i]);
  }

  if (pending.length === 0) {
    ui.alert('再フォーマット対象のタブはありません（すべて処理済みか対象外です）。');
    return;
  }

  var resp = ui.alert(
    '全タブ一括再フォーマット',
    '対象 ' + pending.length + ' タブを再フォーマットします。\n' +
    '（処理済み ' + alreadyDone + ' タブはスキップ）\n\n' +
    '● 各タブにバックアップが作成されます\n' +
    '● 数分かかる場合があります\n' +
    '● 内容（商品データ）は変更されません\n\n' +
    '実行しますか？',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp !== ui.Button.OK) return;

  var start = Date.now();
  var success = 0;
  var problems = [];
  var stoppedEarly = false;

  for (var j = 0; j < pending.length; j++) {
    // 実行時間制限(6分)対策：5分で安全に打ち切り、再実行で続行
    if (Date.now() - start > 300000) { stoppedEarly = true; break; }

    var s = pending[j];
    var nm2 = s.getName();
    try {
      var colA = s.getRange(1, 1, s.getMaxRows(), 1).getValues();
      var hr = findHeaderRow_(colA);
      if (hr === -1) { problems.push(nm2 + '（表なし）'); continue; }
      var cnt = countProductRows_(colA, hr);
      if (cnt === 0) { problems.push(nm2 + '（商品0）'); continue; }
      applyReformat_(s, colA, hr, cnt);
      success++;
    } catch (e) {
      problems.push(nm2 + '（失敗）');
    }
  }

  // アクティブをテンプレ（無ければ先頭シート）に戻す
  var home = ss.getSheetByName(MASTER_TEMPLATE_NAME) || ss.getSheets()[0];
  if (home) ss.setActiveSheet(home);

  // 結果サマリー
  var msg = '✅ 再フォーマット完了: ' + success + ' タブ\n';
  if (problems.length > 0) {
    msg += '\n⚠️ スキップ/失敗: ' + problems.length + ' 件\n' + problems.join('\n') + '\n';
  }
  if (stoppedEarly) {
    msg += '\n⏱ 5分制限のため一部のみ処理しました。\nもう一度「全タブを一括再フォーマット」を実行すると、続きから処理します。';
  }
  ui.alert('一括再フォーマット結果', msg, ui.ButtonSet.OK);
}


/**
 * 【一括】バックアップタブ（名前に "_backup" を含むタブ）をまとめて削除する。
 *   元のオーダーシートタブ（OS-XXX）は削除しない。
 */
function deleteAllBackups() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var sheets = ss.getSheets();
  var backups = [];
  for (var i = 0; i < sheets.length; i++) {
    if (isBackupName_(sheets[i].getName())) backups.push(sheets[i]);
  }

  if (backups.length === 0) {
    ui.alert('バックアップタブはありません。');
    return;
  }

  var resp = ui.alert(
    'バックアップ一括削除',
    'バックアップタブ ' + backups.length + ' 件を削除します。\n' +
    'この操作は元に戻せません。\n\n削除しますか？',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp !== ui.Button.OK) return;

  // 削除前に、バックアップでないタブをアクティブにしておく
  for (var k = 0; k < sheets.length; k++) {
    if (!isBackupName_(sheets[k].getName())) { ss.setActiveSheet(sheets[k]); break; }
  }

  var deleted = 0;
  for (var m = 0; m < backups.length; m++) {
    try { ss.deleteSheet(backups[m]); deleted++; } catch (e) {}
  }

  ss.toast(deleted + ' 件のバックアップタブを削除しました', '🗑 削除完了', 6);
}


/**
 * タブ名がバックアップ用かどうか（"_backup" を含むか）。
 * @param {string} name タブ名
 * @return {boolean}
 */
function isBackupName_(name) {
  return String(name).indexOf('_backup') !== -1;
}


/**
 * 余白行を商品行へ振り替えて、表を最大限に拡大する。
 * 「QR(32行目)より上の合計高さ」を一定に保つため、QRは動かない（2ページ目にあふれない）。
 *
 * @param {Sheet}  sheet
 * @param {number} firstProductRow 最初の商品行（1始まり）
 * @param {number} productCount    商品数
 * @param {number} contactRow      Contact me 行（1始まり）。見つからなければ -1
 * @param {number} lastProductRow  最後の商品行（1始まり）
 * @return {number} 実際に設定した商品行の高さ(px)
 */
function applyFillLayout_(sheet, firstProductRow, productCount, contactRow, lastProductRow) {
  // 余白行の範囲：Contact行の次 〜 QR直前。
  //   Contactが見つからない場合は「商品行+空白+Replacement+Contact(計+3)」を想定し、その次から。
  var gapStart = (contactRow !== -1 ? contactRow : (lastProductRow + 3)) + 1;
  var gapEnd   = GAP_END_ROW;
  var gapRows  = gapEnd - gapStart + 1;

  // 余白行が無ければ、商品行高のみ控えめに設定して終了
  if (gapRows < 1) {
    var h0 = Math.min(MAX_PRODUCT_ROW_HEIGHT, 60);
    sheet.setRowHeights(firstProductRow, productCount, h0);
    return h0;
  }

  // 現在の「商品行＋余白行」の合計高さ（= 再配分できる総量）。この合計を保てばQRは不動。
  var curTable = 0;
  for (var r = firstProductRow; r <= lastProductRow; r++) curTable += sheet.getRowHeight(r);
  var curGap = 0;
  for (var g = gapStart; g <= gapEnd; g++) curGap += sheet.getRowHeight(g);
  var redistributable = curTable + curGap;

  // 余白を最小まで詰めた前提で、表に回せる最大量
  var minGapTotal = gapRows * MIN_GAP_ROW_HEIGHT;
  var targetTable = redistributable - minGapTotal;

  // 1行あたりの高さを決定（上限・下限でクランプ）
  var h = Math.floor(targetTable / productCount);
  if (h > MAX_PRODUCT_ROW_HEIGHT) h = MAX_PRODUCT_ROW_HEIGHT;
  if (h < MIN_PRODUCT_ROW_HEIGHT) h = MIN_PRODUCT_ROW_HEIGHT;

  // 余白行に最低1pxは残るよう、念のため上限ガード
  var maxAllowed = Math.floor((redistributable - gapRows * 1) / productCount);
  if (h > maxAllowed) h = maxAllowed;
  if (h < 1) h = 1;

  // 商品行を設定
  sheet.setRowHeights(firstProductRow, productCount, h);

  // 余白行に残りを配分（合計を保ち、QR=32行目の位置を維持）
  var newGapTotal = redistributable - h * productCount;
  if (newGapTotal < gapRows) newGapTotal = gapRows; // 各行最低1px
  var base = Math.floor(newGapTotal / gapRows);
  if (base < 1) base = 1;
  for (var k = gapStart; k <= gapEnd; k++) {
    // 端数は最終行で吸収して合計を厳密に一致させる
    var hh = (k === gapEnd) ? (newGapTotal - base * (gapRows - 1)) : base;
    if (hh < 1) hh = 1;
    sheet.setRowHeight(k, hh);
  }

  return h;
}


/**
 * A列の値から表ヘッダー行（"SKU"のある行）を探す。
 * @param {Array<Array>} colA  A列全体の値（getValues()の結果）
 * @return {number} 1始まりの行番号。見つからなければ -1。
 */
function findHeaderRow_(colA) {
  for (var i = 0; i < colA.length; i++) {
    var v = colA[i][0];
    if (v !== null && v !== undefined && String(v).trim().toUpperCase() === 'SKU') {
      return i + 1; // 配列index(0始まり) → 行番号(1始まり)
    }
  }
  return -1;
}


/**
 * 表ヘッダー行の直下から、空白行が出現するまでの商品行数をカウントする。
 * （A列が空白でない行を商品行とみなす）
 * @param {Array<Array>} colA       A列全体の値
 * @param {number}       headerRow  ヘッダー行（1始まり）
 * @return {number} 商品行数
 */
function countProductRows_(colA, headerRow) {
  var count = 0;
  // ヘッダー行(1始まり)の次の行は、配列ではindex=headerRow から
  for (var i = headerRow; i < colA.length; i++) {
    var v = colA[i][0];
    if (v === null || v === undefined || String(v).trim() === '') {
      break; // 空白行が出たら終了
    }
    count++;
  }
  return count;
}


/**
 * A列の指定行範囲から、keyword を含む最初の行を探す。
 * @param {Array<Array>} colA     A列全体の値
 * @param {string}       keyword  含まれていれば一致とみなす語
 * @param {number}       fromRow1 検索開始行（1始まり）
 * @param {number}       toRow1   検索終了行（1始まり、含む）
 * @return {number} 1始まりの行番号。見つからなければ -1。
 */
function findRowContaining_(colA, keyword, fromRow1, toRow1) {
  var start = Math.max(1, fromRow1);
  var end   = Math.min(colA.length, toRow1);
  for (var r = start; r <= end; r++) {
    var v = colA[r - 1][0];
    if (v !== null && v !== undefined && String(v).indexOf(keyword) !== -1) {
      return r;
    }
  }
  return -1;
}


/**
 * 現在のタブをコピーしてバックアップタブを作成する。
 * 元のタブのすぐ右側に配置する。
 *   通常 : 「【元のタブ名】_backup」
 *   同名が既にある場合 : 「【元のタブ名】_backup_YYYYMMDD_HHMMSS」
 * @param {Sheet} sheet  バックアップ対象のシート
 * @return {string} 作成したバックアップタブ名
 */
function createBackup_(sheet) {
  var ss = sheet.getParent();
  var baseName = sheet.getName() + '_backup';
  var backupName = baseName;

  // 同名バックアップが既に存在する場合は日時を付与
  if (ss.getSheetByName(backupName)) {
    var ts = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmmss');
    backupName = baseName + '_' + ts;
  }

  // コピーを作成（末尾に追加される）→ 名前を変更
  var copy = sheet.copyTo(ss);
  copy.setName(backupName);

  // 元のタブのすぐ右隣へ移動（getIndex は1始まり）
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(sheet.getIndex() + 1);

  return backupName;
}


/**
 * 再フォーマット実行前の確認ダイアログを表示する。
 * @param {string} sheetName 現在のタブ名
 * @return {boolean} OK（実行）が押されたら true、キャンセルなら false
 */
function showConfirmDialog_(sheetName) {
  var ui = SpreadsheetApp.getUi();
  var message =
    'タブ「' + sheetName + '」を再フォーマットしますか？\n\n' +
    '● バックアップ「' + sheetName + '_backup」が作成されます\n' +
    '● 行高・列幅・余白が最適化されます（表が大きくなります）\n' +
    '● 内容（商品データ）は変更されません';
  var response = ui.alert('確認', message, ui.ButtonSet.OK_CANCEL);
  return response === ui.Button.OK;
}
