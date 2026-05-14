// ============================================================
//  Cost List - Sort & Clean
//  vendortools.gs の EXCLUDE_SHEETS を参照して除外タブを統一する
//  数式保持＋行参照自動更新版
// ============================================================

// カテゴリの並び順
const SORT_CATEGORY_ORDER = ['B', 'C', 'L', 'P', 'S', 'X'];

// ----------------------------------------------------------
// 現在表示中のタブのみ整理する
// ----------------------------------------------------------
function sortAndCleanCurrentSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const name  = sheet.getName();

  // vendortools.gs の EXCLUDE_SHEETS を使って除外判定
  if (EXCLUDE_SHEETS.has(name)) {
    SpreadsheetApp.getUi().alert(name + ' はスキップ対象タブです。');
    return;
  }

  const result = sortAndCleanSheet_(sheet);
  SpreadsheetApp.getUi().alert(
    '✅ 整理完了: ' + name + '\n\n' +
    '・整理済み行（SKUあり）: ' + result.sorted  + ' 行\n' +
    '・SKUなし行（末尾に移動）: ' + result.noSku + ' 行\n' +
    '・削除した空白行: '          + result.deleted + ' 行'
  );
}

// ----------------------------------------------------------
// 全タブを整理する（EXCLUDE_SHEETS は除外）
// ----------------------------------------------------------
function sortAndCleanAllSheets() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ui  = SpreadsheetApp.getUi();

  const conf = ui.alert(
    '全タブを整理します。よろしいですか？\n\n' +
    '（除外タブ: ' + [...EXCLUDE_SHEETS].join(', ') + '）',
    ui.ButtonSet.YES_NO
  );
  if (conf !== ui.Button.YES) return;

  const summary = [];
  ss.getSheets().forEach(function(sheet) {
    const name = sheet.getName();
    if (EXCLUDE_SHEETS.has(name)) return;
    if (_isProtected_(sheet)) return;
    const result = sortAndCleanSheet_(sheet);
    summary.push(
      name + ': ' + result.sorted + '行整理, ' +
      'SKUなし' + result.noSku + '行, ' +
      '空白' + result.deleted + '行削除'
    );
  });

  ui.alert('✅ 全タブ整理完了\n\n' + summary.join('\n'));
}

// ----------------------------------------------------------
// コアロジック: 1枚のシートを整理する（数式保持＋行参照自動更新版）
// ----------------------------------------------------------
function sortAndCleanSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sorted: 0, noSku: 0, deleted: 0 };

  const numCols = sheet.getLastColumn();
  const range   = sheet.getRange(2, 1, lastRow - 1, numCols);

  // 値と数式の両方を取得
  const values   = range.getValues();
  const formulas = range.getFormulas();

  // 各セル: 数式があれば数式文字列を、なければ値を保持
  // 同時に「元の行番号」も覚えておく（後で参照書き換えに使う）
  const combined = values.map(function(row, rIdx) {
    const cells = row.map(function(val, cIdx) {
      const f = formulas[rIdx][cIdx];
      return f ? f : val;
    });
    return {
      cells: cells,
      originalRow: rIdx + 2  // 元のシート行番号
    };
  });

  const withSku    = [];
  const withoutSku = [];
  let   deleted    = 0;

  combined.forEach(function(rowObj) {
    const sku   = (rowObj.cells[0] || '').toString().trim();
    const items = (rowObj.cells[1] || '').toString().trim();

    // 空白行: SKUもItemsも空 → 削除カウント
    if (!sku && !items) {
      deleted++;
      return;
    }

    if (sku) {
      withSku.push(rowObj);
    } else {
      withoutSku.push(rowObj);
    }
  });

  // SKUあり行をカテゴリ別・SKU番号順にソート
  withSku.sort(function(a, b) {
    const skuA   = (a.cells[0] || '').toString().trim();
    const skuB   = (b.cells[0] || '').toString().trim();
    const prefA  = skuA.charAt(0).toUpperCase();
    const prefB  = skuB.charAt(0).toUpperCase();
    let   orderA = SORT_CATEGORY_ORDER.indexOf(prefA);
    let   orderB = SORT_CATEGORY_ORDER.indexOf(prefB);
    if (orderA === -1) orderA = 999;
    if (orderB === -1) orderB = 999;
    if (orderA !== orderB) return orderA - orderB;
    const numA = parseInt(skuA.substring(1)) || 0;
    const numB = parseInt(skuB.substring(1)) || 0;
    return numA - numB;
  });

  // 並び順: SKUあり → SKUなし
  const sortedObjs = withSku.concat(withoutSku);

  // 数式の中の行参照を、新しい行番号に書き換える
  // 例: 元の行 5 にあった =G5*1.15 が、ソート後 2行目に来たら =G2*1.15 に
  const remapped = sortedObjs.map(function(rowObj, rIdx) {
    const newRowNum = rIdx + 2;  // 新しいシート行番号
    const oldRowNum = rowObj.originalRow;

    return rowObj.cells.map(function(cell) {
      if (typeof cell === 'string' && cell.charAt(0) === '=') {
        // 列文字 + 元の行番号 を、列文字 + 新しい行番号 に置換
        // (絶対参照 $ は維持。$は行番号の前にも列の前にも付き得る)
        const pattern = new RegExp(
          '(\\$?[A-Z]+)(\\$?)' + oldRowNum + '(?!\\d)',
          'g'
        );
        return cell.replace(pattern, function(match, col, dollarRow) {
          return col + dollarRow + newRowNum;
        });
      }
      return cell;
    });
  });

  // シートを書き直す
  range.clearContent();
  range.clearFormat();

  if (remapped.length > 0) {
    // setValues は "=" で始まる文字列を自動で数式として認識する
    sheet.getRange(2, 1, remapped.length, numCols).setValues(remapped);
    applyCleanupFormatting_(sheet, remapped.length, withSku.length, numCols);
  }

  // 余分な行を削除
  const newLastRow     = remapped.length + 1;
  const currentLastRow = sheet.getMaxRows();
  if (currentLastRow > newLastRow + 1) {
    sheet.deleteRows(newLastRow + 1, currentLastRow - newLastRow - 1);
  }

  return {
    sorted:  withSku.length,
    noSku:   withoutSku.length,
    deleted: deleted
  };
}

// ----------------------------------------------------------
// 書式を適用する
// ----------------------------------------------------------
function applyCleanupFormatting_(sheet, totalRows, skuRows, numCols) {
  if (totalRows < 1) return;

  // 縞模様
  for (let r = 2; r <= totalRows + 1; r++) {
    const bg = (r % 2 === 0) ? '#FFFFFF' : '#F8F9FA';
    sheet.getRange(r, 1, 1, numCols).setBackground(bg);
  }

  // SKUなし行（末尾）を薄い黄色に
  if (totalRows > skuRows) {
    const noSkuStart = skuRows + 2;
    const noSkuCount = totalRows - skuRows;
    sheet.getRange(noSkuStart, 1, noSkuCount, numCols)
      .setBackground('#FFF9C4');
  }

  // A列（SKU）を太字
  sheet.getRange(2, 1, totalRows, 1).setFontWeight('bold');
}

// ----------------------------------------------------------
// Discontinued タブを作成する（なければ）
// ----------------------------------------------------------
function setupDiscontinuedSheet() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const name = 'Discontinued';
  let   ds   = ss.getSheetByName(name);

  if (ds) {
    SpreadsheetApp.getUi().alert('Discontinued タブはすでに存在します。');
    return;
  }

  ds = ss.insertSheet(name);
  const headers = [
    'SKU','Items','Weight','/LBS','/Each',
    'LBS Cost','Each Cost','Update date',
    '15%','20%','25%','30%','QB Price','Price ($/lbs)',
    'Vendor Tab','Discontinued Date','Notes'
  ];
  const hRange = ds.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setBackground('#757575');
  hRange.setFontColor('#FFFFFF');
  hRange.setFontWeight('bold');
  ds.setFrozenRows(1);
  ds.setColumnWidth(1, 80);
  ds.setColumnWidth(2, 220);

  // EXCLUDE_SHEETS にも追加（自動除外対象に）
  EXCLUDE_SHEETS.add(name);

  SpreadsheetApp.getUi().alert(
    '✅ Discontinued タブを作成しました。\n\n' +
    '販売停止商品はここに移動してください。\n' +
    'O列（Vendor Tab）に元のタブ名を記録することを推奨します。'
  );
}