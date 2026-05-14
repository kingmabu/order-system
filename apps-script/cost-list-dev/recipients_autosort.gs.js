/***** Recipients 自動ソート（インストール型 onEdit） *****/
const RECIP_SHEET   = 'Recipients';
const RECIP_HEADERS = 1;       // ヘッダー行数（1行）
const COL_EMAIL     = 1;       // A列
const COL_NAME      = 2;       // B列

/** 初回セットアップ：権限付与＆onEditトリガー作成 */
function setupRecipientsAutosort(){
  removeRecipientsAutosort(); // 重複防止
  ScriptApp.newTrigger('onRecipientsEdit')
    .forSpreadsheet(SpreadsheetApp.getActive().getId())
    .onEdit()
    .create();
  SpreadsheetApp.getActive().toast('Recipients の自動ソートを有効化しました');
}

/** 停止（トリガー削除） */
function removeRecipientsAutosort(){
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction && t.getHandlerFunction()==='onRecipientsEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/** 受け口（既存 onEdit と競合しない独立トリガー） */
function onRecipientsEdit(e){
  try{
    if (!e) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== RECIP_SHEET) return;

    // ヘッダー行での編集は無視
    if (e.range.getRow() <= RECIP_HEADERS) return;

    // B列（名前）を編集した時・まとめて貼り付け/削除時 いずれも整列
    const c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
    const touchedNameCol = (c0 <= COL_NAME && COL_NAME <= c1); // B列が含まれる？
    if (touchedNameCol || e.range.getNumRows() > 1 || e.oldValue === undefined){
      recipientsResort_(sh);
    }
  }catch(err){
    // 失敗しても他処理を邪魔しない
    Logger.log('onRecipientsEdit error: ' + err);
  }
}

/** 実処理：空行を詰めて、B列A→Zで安定ソート（B空白は下へ） */
function recipientsResort_(sh){
  const last = sh.getLastRow();
  if (last <= RECIP_HEADERS) return;

  // 既存データを取得
  const rng = sh.getRange(RECIP_HEADERS+1, 1, last-RECIP_HEADERS, 2); // A:B
  const values = rng.getValues()
    .map(([a,b]) => [String(a||'').trim().toLowerCase(), String(b||'').trim()]); // emailは小文字化

  // 完全空行は除去、重複メールは先勝ちで除去（同一メールが複数あっても1つに）
  const seen = new Set();
  const rows = [];
  for (const [email, name] of values){
    if (email==='' && name==='') continue;
    const key = email || ('__noemail__'+name); // email無しは名前基準で仮キー
    if (!seen.has(key)){
      seen.add(key);
      rows.push([email, name]);
    }
  }

  // B列（名前）で昇順、名前空白は後ろへ。タイはEmailで昇順
  rows.sort((r1, r2)=>{
    const [e1, n1] = r1, [e2, n2] = r2;
    const n1empty = n1==='', n2empty = n2==='';
    if (n1empty && !n2empty) return 1;
    if (!n1empty && n2empty) return -1;
    const c = n1.localeCompare(n2, undefined, {sensitivity:'base'});
    if (c!==0) return c;
    return e1.localeCompare(e2, undefined, {sensitivity:'base'});
  });

  // いったん全消去→上から書き戻し→残りは空白のまま
  rng.clearContent();
  if (rows.length){
    sh.getRange(RECIP_HEADERS+1, 1, rows.length, 2).setValues(rows);
  }
}
