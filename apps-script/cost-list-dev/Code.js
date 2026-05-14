
function updateImageLinks() {
  const sheetName = "商品一覧";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const startRow = 5;
  const lastRow = sheet.getLastRow();

  const aValues = sheet.getRange(startRow, 1, lastRow - startRow + 1).getValues(); // A列 品番
  const wValues = sheet.getRange(startRow, 23, lastRow - startRow + 1).getValues(); // W列 画像URL
  const vRange = sheet.getRange(startRow, 22, lastRow - startRow + 1); // V列 出力対象

  const formulas = [];

  for (let i = 0; i < aValues.length; i++) {
    const code = aValues[i][0];
    const url = wValues[i][0];

    if (code && url) {
      formulas.push([`=HYPERLINK(W${i + startRow}, "📷")`]);
    } else {
      formulas.push([""]);
    }
  }

  vRange.setFormulas(formulas);
}
