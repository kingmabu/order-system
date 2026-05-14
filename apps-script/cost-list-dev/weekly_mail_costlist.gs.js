/***** Weekly Mail：cost list から作る完全版 *****
 * - 参照元：COST_LIST_URL のスプレッドシート
 *   - 本文表：  weekly list!A1:E8
 *   - 受信者：  Recipients Price!A:A（BCC）
 * - 宛先(TO)：空なら自分のメール
 * - 送信：Draft/Send 両対応
 **************************************************/

// ===== 設定 =====
const WL_SHEET_NAME   = 'weekly list';
const WL_TABLE_RANGE  = 'A1:E8';
const RECIP_SHEETNAME = 'Recipients';
const COMPANY_NAME    = 'California Food Product';
const LANG_MODE       = 'both';      // 'ja' | 'en' | 'both'
const DEFAULT_TO      = '';          // 空なら自分宛に作成

// メニューから使う関数
function createWeeklyDraftFromCostList(){ return createOrSendFromCostList_('draft'); }
function sendWeeklyMailFromCostListNow(){ return createOrSendFromCostList_('send');  }
function installWeeklyTriggerFromCostList(){
  // 毎週 月曜 13:00 に下書きを自動作成
  deleteTriggerByHandler_('createWeeklyDraftFromCostList');
  ScriptApp.newTrigger('createWeeklyDraftFromCostList')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(13).nearMinute(0).create();
}
function uninstallWeeklyTriggerFromCostList(){ deleteTriggerByHandler_('createWeeklyDraftFromCostList'); }

// ここが本体
function createOrSendFromCostList_(mode){
  // cost list のURL（既存定数を再利用。無ければ下のコメント部にURLを入れてください）
  const URL = (typeof COST_LIST_URL !== 'undefined')
    ? COST_LIST_URL
    : 'https://docs.google.com/spreadsheets/d/1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k/edit';

  const tz = Session.getScriptTimeZone();
  const ext = SpreadsheetApp.openByUrl(URL);

  // 本文テーブル
  const dataSh = ext.getSheetByName(WL_SHEET_NAME);
  if (!dataSh) throw new Error(`cost list にシートが見つかりません: ${WL_SHEET_NAME}`);
  const values = dataSh.getRange(WL_TABLE_RANGE).getDisplayValues();
  if (!values.length || !values[0].length) throw new Error(`範囲が空です: ${WL_TABLE_RANGE}`);

  // 受信者（BCC）
  const recipSh = ext.getSheetByName(RECIP_SHEETNAME);
  if (!recipSh) throw new Error(`cost list にシートが見つかりません: ${RECIP_SHEETNAME}`);
  const last = recipSh.getLastRow();
  const bcc = (last>0 ? recipSh.getRange(1,1,last,1).getDisplayValues() : [])
               .map(r => String(r[0]||'').trim())
               .filter(v => v && /.+@.+\..+/.test(v))
               .join(',');
  if (!bcc) throw new Error(`${RECIP_SHEETNAME}!A に有効なメールがありません`);

  // 宛先（TO）
  const to = (DEFAULT_TO && DEFAULT_TO.trim()) ? DEFAULT_TO : Session.getActiveUser().getEmail();

  // 件名・本文（JP/EN）
  const subject   = buildSubjectNextTue_(tz);
  const htmlTable = buildHtmlTable_(values);
  const bodyHtml  = buildHeader_() + htmlTable + buildFooter_();
  const options   = { htmlBody: bodyHtml, bcc: bcc };

  if (mode === 'send') {
    GmailApp.sendEmail(to, subject, stripHtml_(bodyHtml), options);
  } else {
    GmailApp.createDraft(to, subject, stripHtml_(bodyHtml), options);
  }
}

/******** ここから共通ヘルパー（編集不要） ********/
function buildSubjectNextTue_(tz){
  const today=new Date(); const nextTue=getNextWeekday_(today,2);
  const ja=Utilities.formatDate(nextTue,tz,'yyyy/MM/dd');
  const en=Utilities.formatDate(nextTue,tz,'EEE, MMM dd, yyyy');
  if (LANG_MODE==='ja') return `今週のフレッシュチキン価格のご案内（${ja} 火曜適用）`;
  if (LANG_MODE==='en') return `This Week’s Fresh Chicken Prices – Effective Tuesday ${en}`;
  return `今週のフレッシュチキン価格のご案内（${ja} 火曜適用） / This Week’s Fresh Chicken Prices – Effective Tuesday ${en}`;
}
function getNextWeekday_(d,target){ const x=new Date(d); x.setHours(0,0,0,0);
  const delta=(7+target-x.getDay())%7||7; x.setDate(x.getDate()+delta); return x; }
function buildHeader_(){
  const bannerJP=`<div style="background:#f0f8ff;padding:12px;margin:8px 0 10px;text-align:center;
                font-size:16px;font-weight:bold;color:#d9534f;border:1px solid #cdd;">★ 今週のフレッシュチキン価格 ★</div>`;
  const bannerEN=`<div style="background:#f0f8ff;padding:12px;margin:8px 0 10px;text-align:center;
                font-size:16px;font-weight:bold;color:#d9534f;border:1px solid #cdd;">★ This Week’s Fresh Chicken Prices ★</div>`;
  const jp=`<p>いつもお世話になっております。${escapeHtml_(COMPANY_NAME)}です。</p>${bannerJP}
            <p style="margin:6px 0;">下記の価格は <b>火曜日以降の配達分から適用</b> されます。<br>
            <u>月曜日の配達分には適用されません</u> のでご注意ください。</p>`;
  const en=`<p>Good morning from ${escapeHtml_(COMPANY_NAME)}.</p>${bannerEN}
            <p style="margin:6px 0;">The prices below <b>apply to deliveries starting Tuesday</b>.<br>
            <u>Monday deliveries are not subject to these prices.</u></p>`;
  if (LANG_MODE==='ja') return jp; if (LANG_MODE==='en') return en; return jp+en;
}
function buildFooter_(){
  const jp=`<p style="margin:10px 0 6px;">フレッシュチキンの価格は <b>毎週月曜日に更新</b> され、
            火曜日以降の配達分から新価格が適用されます。</p>
            <p style="margin:6px 0;">ご不明点やご注文は本メールにご返信ください。</p>
            <p>よろしくお願いいたします。<br>${escapeHtml_(COMPANY_NAME)}</p>`;
  const en=`<p style="margin:10px 0 6px;">Fresh chicken prices are <b>updated every Monday</b> and apply to deliveries from Tuesday onward.</p>
            <p style="margin:6px 0;">If you have any questions or would like to place an order, just reply to this email.</p>
            <p>Best regards,<br>${escapeHtml_(COMPANY_NAME)}</p>`;
  if (LANG_MODE==='ja') return jp; if (LANG_MODE==='en') return en; return jp+en;
}
function buildHtmlTable_(values){
  let out='<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px">';
  values.forEach((row,i)=>{ out+='<tr>';
    row.forEach((cell,j)=>{
      const tag=(i===0)?'th':'td';
      const style=(i===0)?'padding:8px;background:#f6f7f8;border:1px solid #ccc;'
                         :'padding:8px;border:1px solid #eee;';
      const align=(j>=2)?'text-align:right;':(j===1?'text-align:left;':'text-align:left;');
      out += `<${tag} style="${style}${align}">${escapeHtml_(cell)}</${tag}>`;
    });
    out+='</tr>';
  });
  out+='</table>'; return out;
}
function escapeHtml_(v){ const s=(v==null)?'':String(v);
  return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function stripHtml_(html){ return String(html).replace(/<[^>]+>/g,' '); }
function deleteTriggerByHandler_(h){
  ScriptApp.getProjectTriggers().forEach(t=>{ if (t.getHandlerFunction()===h) ScriptApp.deleteTrigger(t); });
}

/******** メニュー追加（任意） ********/
// 既存 onOpen があるなら、その最後に下の1行を追記してください： addWeeklyMailMenu();
function addWeeklyMailMenu(){
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Weekly Mail')
    .addItem('下書きを作成（cost list）', 'createWeeklyDraftFromCostList')
    .addItem('（上級）即送信', 'sendWeeklyMailFromCostListNow')
    .addSeparator()
    .addItem('［トリガー作成］毎週月曜13:00', 'installWeeklyTriggerFromCostList')
    .addItem('［トリガー削除］自動作成を停止', 'uninstallWeeklyTriggerFromCostList')
    .addToUi();
}
