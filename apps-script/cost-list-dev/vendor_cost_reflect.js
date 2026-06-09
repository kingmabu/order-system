/**
 * vendor_cost_reflect.js  （仕入れコスト自動反映 v1）  追加日: 2026-06-03
 *
 * ★独自 onOpen は持たない。メニュー「💰 仕入コスト反映」は _main.js の onOpen に統合。
 * ★全関数 vcr_ 接頭辞、定数 VCR_CONFIG（既存ファイルと衝突回避）。
 * ★初回は DRY_RUN=true ＝ F列に書かず「変更案をログ出力するだけ」。
 *
 * 【絶対に守る（仕様書 §10）】
 *  - 書込んでよいのは F列・H列・Cost History タブ・アラート送信のみ。
 *  - M/N/G/I〜L列・Preferred price・Item List・QBO には一切触れない。
 *  - 判定不能/未照合/未登録/Qty=0/CS・EA・Sunrise は書かない＝保留・手動確認へ。
 *  - 既存ロジックは変更せず、本ファイルの追加のみ。
 *
 * v1 の範囲（仕様書 §11）：LB請求のみ自動反映。CS/EA・Sunrise はアラートに手動確認として列挙。
 */

/////////////////////////// 設定 ///////////////////////////
var VCR_CONFIG = {
  // ★既定は true（書込まない・安全）。本書込みするときだけ手動で false にする。
  // 2026-06-04: 本番(1dC88) go-live のため false。書込みは「▶本書込み」押下＋確認ダイアログYESのときだけ実行。
  DRY_RUN: false,

  // --- 読取元：CFP Operations（本番）。dry-run は読取専用 ---
  SRC_CFP_OPS_ID: '1m2wm3M0xeoCWE3a4U4e-xvBKMR3j2Wllts7OBjBtv6o',
  TAB_RECEIVING_LOG: 'Receiving Log',

  // --- 書込先：Cost list ---
  // 書込先。2026-06-04 go-live: 本番(cost list 1dC88)。
  // ★書込みは「▶本書込み」押下＋確認ダイアログ YES のときだけ実行（誤クリック防止）。
  // ★DEVで再テストするときは 1NPCw-Bz0kokXEe2Tv2PcF9XkQsa1c5IqiGh3IIkWpV8 に戻す。
  DEST_COST_LIST_ID: '1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k', // ← 本番 cost list
  TAB_COST_HISTORY: 'Cost History',

  // --- アラート ---
  ALERT_TO: 'ordercfp@gmail.com',
  ALERT_TEST_TO: 'califoodpro@gmail.com',
  ALERT_TEST_MODE: false,  // 2026-06-04 go-live: 本番モード。宛先=ALERT_TO(ordercfp)・件名 [DEV TEST] 無し

  // --- 判定パラメータ ---
  SWING_FLAG_PCT: 50,      // ±50%超で「要確認」マーク（消さない・仕様書 §7）
  COST_LIST_F_COL: 6,      // F = LBS Cost（全タブ共通・仕様書 §9）← 書込む
  COST_LIST_H_COL: 8,      // H = Update date ← 書込む（反映日）
  COST_LIST_SKU_COL: 1,    // A = SKU
  COST_LIST_NAME_COL: 2,   // B = Items（商品名・参考表示用）
  COST_LIST_K_COL: 11,     // K = 25% 推奨売価（参考表示。更新前の値）
  COST_LIST_M_COL: 13,     // M = QB Price（売値）← 絶対に触らない。検証用に読むだけ

  // --- ベンダー名 → Cost list タブ（仕様書 §4）---
  // 正規化キー（小文字化し英数字以外を除去した文字列）の「部分一致」で判定。
  // 具体的＝衝突しにくい順に並べる（先に一致したものを採用）。
  VENDOR_TAB: [
    { key: 'ltmeat',        tab: 'L&T' },            // L & T MEAT CO.
    { key: '29er',          tab: '29ers' },          // THE 29ERS' PROVISIONS
    { key: 'zant',          tab: 'Zant' },           // R. W. ZANT, LLC
    { key: 'tokaidenpun',   tab: 'Tokai Denpun' },   // Tokai Denpun USA, Inc.
    { key: 'tokai',         tab: 'Tokai Denpun' },   // 同上（短縮綴り対策）
    { key: 'unibright',     tab: 'Unibright' },      // UNIBRIGHT FOODS, INC.
    { key: 'glenrose',      tab: 'Glen Rose' },      // GLEN ROSE MEAT COMPANY
    { key: 'colonellee',    tab: 'T&T' },            // T & T Foods (Colonel Lee's)
    { key: 'ttfoods',       tab: 'T&T' },            // 同上
    { key: 'sunrise',       tab: 'Sun Rise' },       // Sunrise Food Co（SUN RISE 含む）
    { key: 'commercialmeat',tab: 'Commercial Meat' },// COMMERCIAL MEAT CO.
    { key: 'yamasa',        tab: 'Yamasa' },         // YAMASA ENTERPRISES
    { key: 'pacificfresh',  tab: 'Pacific' },        // Pacific Fresh Fish Co.（Blue Pacific と区別）
    { key: 'commodity',     tab: 'Commodity' },      // COMMODITY SALES, LLC
    { key: 'alswholesale',  tab: "Al's Meat" },      // AL's Wholesale Meats
    { key: 'koikoi',        tab: 'Koi Koi Trading' },// Koi Koi Trading
    { key: 'riverson',      tab: 'Riverson' }        // Riverson Foods
  ],

  // --- 週次（指定曜日のインボイスだけ反映）。getDay(): 日=0,月=1,…（仕様書 §6）---
  WEEKLY_TABS: { 'L&T': 1 },  // L&T は月曜のインボイスのみ

  // --- v1で自動反映しない品目＝手動確認（CS/EA・Sunrise・仕様書 §5）---
  // Our SKU 単位で除外（書かずにアラート末尾へ列挙）。
  MANUAL_SKUS: {
    'S045': 'Koi Koi うなぎ（CS）',
    'S046': 'Koi Koi うなぎ（CS）',
    'S047': 'Koi Koi うなぎ（CS）',
    'S048': 'Koi Koi うなぎ（CS）',
    'S049': 'Koi Koi うなぎ（CS）',
    'S008': 'Yamasa SURIMI（CS）',
    'S010': 'Tokai うなぎ11oz（EA）',
    'S030': 'Tokai Nobashi（CS）',
    'S031': 'Tokai Nobashi（CS）',
    'S007': 'Pacific 明太子等（要確認）',
    'P034': 'Sunrise 労務費（LABOR）',
    'P042': 'Sunrise 労務費（LABOR）',
    'P052': 'Sunrise 労務費（LABOR）',
    'P053': 'Sunrise 労務費（LABOR）',
    'P054': 'Sunrise 労務費（LABOR）',
    'P059': 'Sunrise 労務費（LABOR）'
  }
};


/////////////////////////// メニュー入口 ///////////////////////////

/** メニュー「💰 仕入コスト反映」→「変更案をプレビュー（dry-run）」から呼ばれる。 */
function vcr_previewDryRun() {
  var report = vcr_buildReport_();
  vcr_logReport_(report);

  // 画面にも要約を出す（書込みは一切していない）
  var ui = SpreadsheetApp.getUi();
  var msg =
    '【dry-run／書込みなし】\n\n' +
    '反映候補（F列を更新する案）：' + report.changes.length + ' 件\n' +
    '  ├ 値上がり↑：' + report.changes.filter(function (c) { return c.dir === 'up'; }).length + ' 件\n' +
    '  ├ 値下がり↓：' + report.changes.filter(function (c) { return c.dir === 'down'; }).length + ' 件\n' +
    '  └ 新規（F空欄）：' + report.changes.filter(function (c) { return c.dir === 'new'; }).length + ' 件\n\n' +
    '⚠️ 要確認・未反映（±50%超／F列に書かない）：' + (report.hold ? report.hold.length : 0) + ' 件\n\n' +
    '手動確認（CS/EA・Sunrise）：' + report.manual.length + ' 件\n\n' +
    '保留：' + report.pending.length + ' 件（内訳↓）\n' +
    vcr_reasonHist_(report.pending).map(function (kv) {
      return '  ・' + kv[0] + '：' + kv[1] + ' 件';
    }).join('\n') + '\n\n' +
    '明細は「💰 仕入コスト反映 → 明細を自分宛メールに送る」で確認できます。\n' +
    '※この操作では Cost list に一切書き込んでいません。';
  ui.alert('💰 仕入コスト反映（dry-run）', msg, ui.ButtonSet.OK);
}

/** メニュー「明細を自分宛メールに送る（dry-run）」から呼ばれる。
 *  変更案・手動確認・保留の全明細を、実行者本人のメールへ送る（自分宛のみ・本番無影響）。 */
function vcr_emailDryRunPreview() {
  var rep = vcr_buildReport_();
  var to = Session.getActiveUser().getEmail() || VCR_CONFIG.ALERT_TEST_TO;
  var L = [];
  L.push('【dry-run プレビュー／Cost list には一切書き込んでいません】');
  L.push('対象スプレッドシート（読取元）: Receiving Log = CFP Operations');
  L.push('対象スプレッドシート（反映先・今回は読取のみ）: Cost list[DEV]');
  L.push('');
  L.push('■ F列 変更案：' + rep.changes.length + ' 件（↑' +
    rep.changes.filter(function (c) { return c.dir === 'up'; }).length + ' / ↓' +
    rep.changes.filter(function (c) { return c.dir === 'down'; }).length + ' / 新規' +
    rep.changes.filter(function (c) { return c.dir === 'new'; }).length + '）');
  rep.changes.forEach(function (c) {
    var arrow = c.dir === 'up' ? '↑' : (c.dir === 'down' ? '↓' : '＊新規');
    var oldS = c.oldF === null ? '(空欄)' : vcr_money_(c.oldF);
    var pctS = c.pct === null ? '' : (' (' + (c.pct >= 0 ? '+' : '') + c.pct.toFixed(1) + '%)');
    L.push('  ' + arrow + ' [' + c.tab + '] ' + c.sku + ' ' + c.name + ' : F ' +
      oldS + ' → ' + vcr_money_(c.newF) + pctS + '  ｜M(QB Price)=' + vcr_str_(c.curM) + '(不変予定)' +
      '  Inv#' + c.invNo + ' ' + c.invDate);
  });
  L.push('');
  var hold = rep.hold || [];
  L.push('■ ⚠️ 要確認・未反映（±50%超／F列に書きません）：' + hold.length + ' 件');
  hold.forEach(function (c) {
    var oldS = c.oldF === null ? '(空欄)' : vcr_money_(c.oldF);
    var pctS = c.pct === null ? '' : (' (' + (c.pct >= 0 ? '+' : '') + c.pct.toFixed(1) + '%)');
    L.push('  ⚠️ [' + c.tab + '] ' + c.sku + ' ' + c.name + ' : ' +
      oldS + ' → ' + vcr_money_(c.newF) + pctS + '  Inv#' + c.invNo + ' ' + c.invDate +
      '  ← 人が確認し、正しければ手動でF更新');
  });
  L.push('');
  L.push('■ 手動確認（CS/EA・Sunrise／自動反映しない）：' + rep.manual.length + ' 件');
  rep.manual.forEach(function (m) {
    L.push('  ' + m.ourSku + ' ' + m.note + ' : Unit ' + vcr_money_(m.unit) + ' ｜' + m.vendor + ' Inv#' + m.invNo);
  });
  L.push('');
  L.push('■ 保留：' + rep.pending.length + ' 件　理由別内訳↓');
  vcr_reasonHist_(rep.pending).forEach(function (kv) { L.push('  ・' + kv[0] + '：' + kv[1] + ' 件'); });
  L.push('');
  L.push('（保留の明細・先頭60件まで）');
  rep.pending.slice(0, 60).forEach(function (p) {
    L.push('  行' + p.rowNum + ' ' + p.vendor + ' / ' + (p.ourSku || '(SKU空)') + ' : ' + p.reason);
  });
  if (rep.pending.length > 60) L.push('  …ほか ' + (rep.pending.length - 60) + ' 件');

  var body = L.join('\n');
  MailApp.sendEmail(to, '[dry-run] 仕入コスト反映プレビュー（書込なし）', body);
  SpreadsheetApp.getUi().alert('送信しました', to + ' 宛に dry-run の明細を送りました。\n（自分宛のみ・本番やお客様には影響しません）', SpreadsheetApp.getUi().ButtonSet.OK);
}

/** 保留理由をカテゴリ別に集計し、[ラベル, 件数] を多い順で返す。 */
function vcr_reasonHist_(pending) {
  var h = {};
  pending.forEach(function (p) {
    var k = vcr_reasonKey_(p.reason || '(理由不明)');
    h[k] = (h[k] || 0) + 1;
  });
  return Object.keys(h).map(function (k) { return [k, h[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
}

/** 可変部を含む理由文を、集計用の固定ラベルに正規化する。 */
function vcr_reasonKey_(r) {
  if (/古い請求書/.test(r))              return '古い請求書(値戻り防止)';
  if (/Match=/.test(r))                 return 'Match未照合など';
  if (/Qty=0|数量不明/.test(r))          return 'Qty=0/数量不明';
  if (/Bill ID 空欄/.test(r))            return 'QBO Bill ID 空欄';
  if (/Bill ID 非数値/.test(r))          return 'QBO Bill ID 非数値';
  if (/Our SKU 空欄/.test(r))            return 'Our SKU 空欄';
  if (/Unit Price/.test(r))             return 'Unit Price 不正';
  if (/ベンダー→タブ未対応/.test(r))     return 'ベンダー→タブ未対応';
  if (/タブが無い/.test(r))              return 'Cost listにタブ無し';
  if (/タブに SKU/.test(r) || /が無い/.test(r)) return 'タブにSKU無し';
  if (/週次/.test(r))                    return '週次対象外(日付不明)';
  return 'その他';
}


/////////////////////////// 本書込み（DRY_RUN=false のときだけ実書込み） ///////////////////////////

/** メニュー「▶ 本書込みを実行（DRY_RUN設定に従う）」から呼ばれる。
 *  DRY_RUN=true なら絶対に書かない。false のときだけ F列・H列・Cost History を書き、アラート送信。
 *  ★書込むのは F列・H列・Cost History タブ・メールのみ。M/N/G/I〜L・Preferred・Item List・QBO は不触。 */
function vcr_runReflect() {
  var cfg = VCR_CONFIG;
  var ui = SpreadsheetApp.getUi();
  var rep = vcr_buildReport_();
  vcr_logReport_(rep);

  // ---- DRY_RUN ガード：true の間は一切書かない ----
  if (cfg.DRY_RUN) {
    ui.alert('DRY_RUN=true のため書き込みません',
      '反映候補：' + rep.changes.length + ' 件（要確認・未反映：' + (rep.hold ? rep.hold.length : 0) + ' 件）。\n' +
      '本書込みするには VCR_CONFIG.DRY_RUN を false にしてください。\n' +
      '（このボタンは設定に従うので、true の今は安全に何も書いていません）',
      ui.ButtonSet.OK);
    return;
  }

  // ---- 書込み前の確認ダイアログ（誤クリック防止）----
  var PROD = '1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k';
  var isProd = (cfg.DEST_COST_LIST_ID === PROD);
  var destLabel = isProd ? '本番（cost list）' : 'DEV（cost list [DEV]）';
  var confirm = ui.alert(
    (isProd ? '⚠️ 本番に書き込みます' : '書き込みの確認'),
    rep.changes.length + ' 件を ' + destLabel + ' の F列・H列に書き込みます。\n' +
    'Cost History に ' + rep.changes.length + ' 行追記し、アラートを1通送信します。\n' +
    '（要確認・未反映 ' + (rep.hold ? rep.hold.length : 0) + ' 件／保留 ' + rep.pending.length + ' 件は書きません）\n\n' +
    'よろしいですか？',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) {
    ui.alert('中止しました', '何も書き込んでいません。', ui.ButtonSet.OK);
    return;
  }

  var dest = SpreadsheetApp.openById(cfg.DEST_COST_LIST_ID);
  var today = vcr_today_();

  // ---- 1) F列・H列を更新（changes のみ。hold/manual/pending は書かない）----
  var tabCache = {};
  rep.changes.forEach(function (c) {
    var sh = tabCache[c.tab] || (tabCache[c.tab] = dest.getSheetByName(c.tab));
    sh.getRange(c.destRow, cfg.COST_LIST_F_COL).setValue(c.newF);  // F = LBS Cost
    sh.getRange(c.destRow, cfg.COST_LIST_H_COL).setValue(today);   // H = Update date
  });

  // ---- 2) Cost History タブに追記（無ければ作成）----
  var hist = vcr_ensureCostHistory_(dest);
  if (rep.changes.length) {
    var rows = rep.changes.map(function (c) {
      return [today, c.tab, c.sku, c.name, c.newF,
        (c.oldF === null ? '' : c.oldF),
        (c.pct === null ? '' : c.pct.toFixed(1) + '%'), c.invNo];
    });
    hist.getRange(hist.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  // ---- 3) アラート送信（1通）。失敗しても書込みは完了済みなので落とさない ----
  var alertTo = '';
  try { alertTo = vcr_sendAlert_(rep) || '(変動ゼロのため未送信)'; }
  catch (e) { alertTo = 'メール送信エラー: ' + e; }

  // ---- 4) 完了ポップアップ（M不変の検証材料も表示）----
  var mLines = rep.changes.map(function (c) {
    return '  [' + c.tab + '] ' + c.sku + '：F ' +
      (c.oldF === null ? '(空欄)' : vcr_money_(c.oldF)) + ' → ' + vcr_money_(c.newF) +
      ' ｜M(QB Price)=' + vcr_str_(c.curM) + '（書込み対象外＝不変）';
  }).join('\n');
  ui.alert('✅ 本書込み完了（' + (isProd ? '本番' : 'DEV') + '）',
    '書込先：' + destLabel + '（' + cfg.DEST_COST_LIST_ID + '）\n\n' +
    'F列・H列を更新：' + rep.changes.length + ' 行\n' +
    'Cost History 追記：' + rep.changes.length + ' 行\n' +
    '要確認・未反映（書かず）：' + (rep.hold ? rep.hold.length : 0) + ' 件\n' +
    'アラート送信先：' + alertTo + '\n\n' +
    '※M(QB Price)・N・G・I〜L・Preferred・Item List・QBO は触っていません。\n\n' +
    mLines, ui.ButtonSet.OK);
}

/** Cost History タブを返す（無ければ見出し付きで作成）。既存タブは触らない。 */
function vcr_ensureCostHistory_(dest) {
  var name = VCR_CONFIG.TAB_COST_HISTORY;
  var sh = dest.getSheetByName(name);
  if (!sh) {
    sh = dest.insertSheet(name);
    sh.getRange(1, 1, 1, 8).setValues([[
      '反映日', 'Vendorタブ', 'SKU', '商品名', '新$/lb', '旧$/lb', '変動%', 'Invoice#'
    ]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** アラートを「1通」送る。ベンダー単位の見出しでまとめ、末尾に手動確認・保留サマリ（仕様§7）。
 *  本番モード(ALERT_TEST_MODE=false)：宛先=ALERT_TO・件名プレフィックス無し。
 *  テストモード：宛先=実行者本人・件名 [DEV TEST]。送信先メールを返す。変動ゼロなら null。 */
function vcr_sendAlert_(rep) {
  var cfg = VCR_CONFIG;
  var changes = rep.changes, hold = rep.hold || [];
  if (!changes.length && !hold.length) return null;  // 変動ゼロなら送らない（仕様§7）

  var testMode = !!cfg.ALERT_TEST_MODE;
  var to = testMode ? (Session.getActiveUser().getEmail() || cfg.ALERT_TEST_TO) : cfg.ALERT_TO;
  var pfx = testMode ? '[DEV TEST] ' : '';

  var byTab = {};
  changes.forEach(function (c) { (byTab[c.tab] = byTab[c.tab] || { ch: [], hold: [] }).ch.push(c); });
  hold.forEach(function (c) { (byTab[c.tab] = byTab[c.tab] || { ch: [], hold: [] }).hold.push(c); });

  var L = [];
  L.push('仕入コスト変動の通知（F=仕入コストの自動反映。売値M列は人が判断）');
  L.push('反映日: ' + vcr_today_() + '　反映: ' + changes.length + ' 件' +
    (hold.length ? '／要確認・未反映: ' + hold.length + ' 件' : ''));
  L.push('');

  // ベンダー（タブ）単位の見出しで1通にまとめる（仕様§7：ベンダー単位・SKU乱発しない）
  Object.keys(byTab).forEach(function (tab) {
    var g = byTab[tab];
    L.push('■ ' + tab + '（反映 ' + g.ch.length + ' 件' + (g.hold.length ? '／要確認 ' + g.hold.length + ' 件' : '') + '）');
    g.ch.forEach(function (c) {
      var arrow = c.dir === 'up' ? '↑値上がり' : (c.dir === 'down' ? '↓値下がり' : '＊新規');
      var pctS = c.pct === null ? '' : ' ' + (c.pct >= 0 ? '+' : '') + c.pct.toFixed(1) + '%';
      L.push('  ' + arrow + ' ' + c.sku + ' ' + c.name + ' : ' +
        (c.oldF === null ? '(空欄)' : vcr_money_(c.oldF)) + ' → ' + vcr_money_(c.newF) + pctS +
        '（25%推奨売価: ' + vcr_str_(c.curK) + '）');
    });
    g.hold.forEach(function (c) {
      var pctS = c.pct === null ? '' : ' ' + (c.pct >= 0 ? '+' : '') + c.pct.toFixed(1) + '%';
      L.push('  ⚠️要確認・未反映 ' + c.sku + ' ' + c.name + ' : ' +
        (c.oldF === null ? '(空欄)' : vcr_money_(c.oldF)) + ' → ' + vcr_money_(c.newF) + pctS +
        '（±50%超・人が確認しF更新）');
    });
    L.push('');
  });

  // 末尾：手動確認＆保留サマリ（仕様§7：末尾に保留リスト）
  L.push('── 手動確認（CS/EA・Sunrise／自動反映しない）: ' + rep.manual.length + ' 件');
  rep.manual.forEach(function (m) {
    L.push('  ' + m.ourSku + ' ' + m.note + ' : Unit ' + vcr_money_(m.unit) + ' ｜' + m.vendor);
  });
  L.push('');
  L.push('── 保留: ' + rep.pending.length + ' 件（理由別）');
  vcr_reasonHist_(rep.pending).forEach(function (kv) { L.push('  ・' + kv[0] + '：' + kv[1] + ' 件'); });

  var subj = pfx + '[仕入コスト] ' + vcr_today_() + ' 反映' + changes.length + '件' +
    (hold.length ? '・要確認' + hold.length + '件' : '');
  MailApp.sendEmail(to, subj, L.join('\n'));
  return to;
}


/////////////////////////// 中核：レポート構築（読取のみ） ///////////////////////////

/**
 * Receiving Log を読み、F列の変更案・手動確認・保留を組み立てて返す。
 * ★この関数は一切書き込まない（読取専用）。
 */
function vcr_buildReport_() {
  var cfg = VCR_CONFIG;

  // ---- 1) Receiving Log を読む ----
  var src = SpreadsheetApp.openById(cfg.SRC_CFP_OPS_ID).getSheetByName(cfg.TAB_RECEIVING_LOG);
  if (!src) throw new Error('Receiving Log タブが見つかりません: ' + cfg.TAB_RECEIVING_LOG);

  var values = src.getDataRange().getValues();
  var hdr = vcr_findHeader_(values, ['Our SKU', 'Unit Price', 'Vendor']);
  var H = hdr.map;        // 列名 → 0始まり index
  var startRow = hdr.row + 1;

  var col = {
    vendor:   vcr_pick_(H, ['Vendor']),
    ourSku:   vcr_pick_(H, ['Our SKU']),
    unit:     vcr_pick_(H, ['Unit Price']),
    match:    vcr_pick_(H, ['Match']),
    invNo:    vcr_pick_(H, ['Invoice#', 'Invoice #', 'Invoice No', 'Invoice']),
    invDate:  vcr_pick_(H, ['Invoice Date']),
    billId:   vcr_pick_(H, ['QBO Bill ID', 'Bill ID']),
    qty:      vcr_pick_(H, ['Qty', 'Quantity']),
    desc:     vcr_pick_(H, ['Description', 'Desc'])
  };

  var matchDist = {};   // Match値の分布（dry-run検証用）
  var usable = [];      // 採用候補（生）
  var pending = [];     // 保留リスト
  var manual = [];      // 手動確認（CS/EA・Sunrise）

  for (var r = startRow; r < values.length; r++) {
    var row = values[r];
    var vendor = vcr_str_(row[col.vendor]);
    if (!vendor) continue;  // 空行スキップ

    var ourSku = vcr_str_(row[col.ourSku]).toUpperCase();
    var unit   = vcr_num_(row[col.unit]);
    var match  = vcr_str_(row[col.match]);
    var qty    = vcr_num_(row[col.qty]);
    var billId = col.billId >= 0 ? vcr_str_(row[col.billId]) : '';
    var invNo  = col.invNo  >= 0 ? vcr_str_(row[col.invNo])  : '';
    var invDt  = col.invDate >= 0 ? row[col.invDate] : '';
    var desc   = col.desc   >= 0 ? vcr_str_(row[col.desc])   : '';

    matchDist[match || '(空)'] = (matchDist[match || '(空)'] || 0) + 1;

    // ---- 採用可否：Our SKU有・Qty>0・Bill ID数値・Matchが失敗値でない ----
    var failMatch = /未照合|未登録|未作成|Qty\s*=\s*0/.test(match);
    var reason = '';
    if (!ourSku)                     reason = 'Our SKU 空欄';
    else if (!(qty > 0))             reason = 'Qty=0 または数量不明';
    else if (!vcr_num_(billId) && billId === '') reason = 'QBO Bill ID 空欄';
    else if (billId !== '' && !vcr_num_(billId)) reason = 'QBO Bill ID 非数値（' + billId + '）';
    else if (failMatch)              reason = 'Match=' + match;
    else if (!(unit > 0))            reason = 'Unit Price 不正（' + vcr_str_(row[col.unit]) + '）';

    var rec = {
      vendor: vendor, ourSku: ourSku, unit: unit, match: match, qty: qty,
      invNo: invNo, invDate: invDt, desc: desc, rowNum: r + 1
    };

    if (reason) { rec.reason = reason; pending.push(rec); continue; }

    // ---- 手動確認（CS/EA・Sunrise）は書かずに列挙 ----
    if (cfg.MANUAL_SKUS[ourSku]) {
      rec.note = cfg.MANUAL_SKUS[ourSku];
      manual.push(rec);
      continue;
    }

    // ---- ベンダー → タブ ----
    var tab = vcr_vendorToTab_(vendor);
    if (!tab) { rec.reason = 'ベンダー→タブ未対応'; pending.push(rec); continue; }
    rec.tab = tab;

    // ---- 週次ルール（L&T は月曜インボイスのみ）----
    if (cfg.WEEKLY_TABS.hasOwnProperty(tab)) {
      var wd = vcr_weekday_(invDt);
      if (wd === null) { rec.reason = '週次ベンダーだが Invoice Date 不明'; pending.push(rec); continue; }
      if (wd !== cfg.WEEKLY_TABS[tab]) { continue; } // 対象曜日でない → 静かにスキップ（保留にしない）
    }

    usable.push(rec);
  }

  // ---- 2) 重複の最新採用：(タブ×Our SKU) ごとに最新 Invoice Date（同日なら後の行）----
  var pickMap = {};  // key=tab|sku → rec
  for (var i = 0; i < usable.length; i++) {
    var u = usable[i];
    var key = u.tab + '|' + u.ourSku;
    var cur = pickMap[key];
    if (!cur) { pickMap[key] = u; continue; }
    var t1 = vcr_time_(u.invDate), t0 = vcr_time_(cur.invDate);
    // 新しい日付を優先。同日(または日付不明同士)は後勝ち（行番号が大きい方）。
    if (t1 > t0 || (t1 === t0 && u.rowNum >= cur.rowNum)) pickMap[key] = u;
  }

  // ---- 3) Cost list の現 F値と突合（読取のみ）----
  var dest = SpreadsheetApp.openById(cfg.DEST_COST_LIST_ID);
  var tabCache = {};   // tab名 → {skuRow:{SKU→rowIndex0}, values, sheet}
  var changes = [];    // 反映する変更（F列に書く対象）
  var hold = [];       // ±50%超＝要確認・未反映（F列に書かない）
  var keys = Object.keys(pickMap);

  for (var k = 0; k < keys.length; k++) {
    var rec2 = pickMap[keys[k]];
    var info = vcr_loadVendorTab_(dest, rec2.tab, tabCache);
    if (!info) { rec2.reason = 'Cost list にタブが無い: ' + rec2.tab; pending.push(rec2); continue; }

    var idx = info.skuRow.hasOwnProperty(rec2.ourSku) ? info.skuRow[rec2.ourSku] : -1;
    if (idx < 0) { rec2.reason = rec2.tab + ' タブに SKU ' + rec2.ourSku + ' が無い'; pending.push(rec2); continue; }

    var oldF = vcr_num_(info.values[idx][cfg.COST_LIST_F_COL - 1]);
    var oldFraw = info.values[idx][cfg.COST_LIST_F_COL - 1];
    var name = vcr_str_(info.values[idx][cfg.COST_LIST_NAME_COL - 1]) || rec2.desc;
    var curK = cfg.COST_LIST_K_COL <= info.values[idx].length
      ? info.values[idx][cfg.COST_LIST_K_COL - 1] : '';
    var curM = cfg.COST_LIST_M_COL <= info.values[idx].length
      ? info.values[idx][cfg.COST_LIST_M_COL - 1] : '';   // M=QB Price（検証用に読むだけ・書かない）

    // ---- 古い請求書は自動保留（値戻り防止）----
    // 採用予定の請求書(Invoice Date)が、現在のF更新日(H列)より「厳密に古い」なら書かない。
    // H空欄／日付不明／同日 は従来どおり反映する。全ベンダー共通の恒久ルール。
    var curH = cfg.COST_LIST_H_COL <= info.values[idx].length
      ? info.values[idx][cfg.COST_LIST_H_COL - 1] : '';
    var invT = vcr_time_(rec2.invDate), hT = vcr_time_(curH);
    if (hT !== null && invT !== null && invT < hT) {
      rec2.reason = '古い請求書（INV ' + vcr_dateStr_(rec2.invDate) +
        ' < 現F更新 ' + vcr_dateStr_(curH) + '）';
      pending.push(rec2);
      continue;
    }

    var newF = rec2.unit;

    var dir, pct = null, flag = false;
    if (oldFraw === '' || oldFraw === null) { dir = 'new'; }
    else if (Math.abs(newF - oldF) < 1e-9)  { continue; } // 差なし → 変更しない
    else {
      dir = newF > oldF ? 'up' : 'down';
      if (oldF > 0) {
        pct = (newF - oldF) / oldF * 100;
        if (Math.abs(pct) > cfg.SWING_FLAG_PCT) flag = true;
      }
    }

    var ch = {
      tab: rec2.tab, sku: rec2.ourSku, name: name,
      oldF: (oldFraw === '' || oldFraw === null) ? null : oldF, newF: newF,
      dir: dir, pct: pct, flag: flag,
      invNo: rec2.invNo, invDate: vcr_dateStr_(rec2.invDate), curK: curK, curM: curM,
      destRow: idx + 1
    };
    // ±50%超は「要確認・未反映」へ（F列に書かない）。それ以外は反映対象へ。
    if (flag) hold.push(ch); else changes.push(ch);
  }

  return { changes: changes, hold: hold, manual: manual, pending: pending, matchDist: matchDist, header: H };
}


/////////////////////////// ログ出力（dry-run の成果物） ///////////////////////////

function vcr_logReport_(rep) {
  Logger.log('============================================================');
  Logger.log('💰 仕入コスト反映 — dry-run レポート（書込みなし）');
  Logger.log('============================================================');

  // 検証用：認識した見出しと Match 分布
  Logger.log('▼ Receiving Log の見出し（列名→列位置）');
  Logger.log(JSON.stringify(rep.header));
  Logger.log('▼ Match 値の分布: ' + JSON.stringify(rep.matchDist));

  // 変更案
  Logger.log('');
  Logger.log('▼ F列 変更案（' + rep.changes.length + ' 件）— ※書き込んでいません');
  Logger.log('  [タブ] SKU 商品名 : 旧$/lb → 新$/lb (変動%) 方向 [要確認] Inv# Date');
  rep.changes.forEach(function (c) {
    var arrow = c.dir === 'up' ? '↑' : (c.dir === 'down' ? '↓' : '＊新規');
    var oldS = c.oldF === null ? '(空欄)' : vcr_money_(c.oldF);
    var pctS = c.pct === null ? '' : (' (' + (c.pct >= 0 ? '+' : '') + c.pct.toFixed(1) + '%)');
    var flagS = c.flag ? ' ⚠️要確認(±50%超)' : '';
    Logger.log('  [' + c.tab + '] ' + c.sku + ' ' + c.name + ' : ' +
      oldS + ' → ' + vcr_money_(c.newF) + pctS + ' ' + arrow + flagS +
      '  Inv#' + c.invNo + ' ' + c.invDate);
  });

  // Cost History 追記予定
  Logger.log('');
  Logger.log('▼ Cost History に追記予定の行（反映日/タブ/SKU/商品名/新$/lb/旧$/lb/変動%/Inv#）');
  rep.changes.forEach(function (c) {
    Logger.log('  ' + [vcr_today_(), c.tab, c.sku, c.name,
      vcr_money_(c.newF), c.oldF === null ? '' : vcr_money_(c.oldF),
      c.pct === null ? '' : c.pct.toFixed(1) + '%', c.invNo].join(' | '));
  });

  // ベンダー別アラート下書き
  Logger.log('');
  Logger.log('▼ ベンダー別アラート下書き（変動が1件以上あるタブのみ・1通ずつ）');
  var byTab = {};
  rep.changes.forEach(function (c) { (byTab[c.tab] = byTab[c.tab] || []).push(c); });
  Object.keys(byTab).forEach(function (tab) {
    Logger.log('  ── 宛先メール: 件名「[仕入コスト] ' + tab + ' ' + byTab[tab].length + '件の変動」');
    byTab[tab].forEach(function (c) {
      var arrow = c.dir === 'up' ? '↑値上がり' : (c.dir === 'down' ? '↓値下がり' : '＊新規');
      var pctS = c.pct === null ? '' : ' ' + (c.pct >= 0 ? '+' : '') + c.pct.toFixed(1) + '%';
      Logger.log('     ' + arrow + ' ' + c.sku + ' ' + c.name + ' : ' +
        (c.oldF === null ? '(空欄)' : vcr_money_(c.oldF)) + ' → ' + vcr_money_(c.newF) + pctS +
        (c.flag ? ' ⚠️要確認' : '') + '（更新前の25%推奨売価: ' + vcr_str_(c.curK) + '）');
    });
  });

  // 要確認・未反映（±50%超）
  Logger.log('');
  var hold = rep.hold || [];
  Logger.log('▼ ⚠️ 要確認・未反映（±50%超／F列に書かない）— ' + hold.length + ' 件');
  hold.forEach(function (c) {
    var pctS = c.pct === null ? '' : ' ' + (c.pct >= 0 ? '+' : '') + c.pct.toFixed(1) + '%';
    Logger.log('  ⚠️ [' + c.tab + '] ' + c.sku + ' ' + c.name + ' : ' +
      (c.oldF === null ? '(空欄)' : vcr_money_(c.oldF)) + ' → ' + vcr_money_(c.newF) + pctS +
      '  Inv#' + c.invNo + ' ' + c.invDate);
  });

  // 手動確認
  Logger.log('');
  Logger.log('▼ 手動確認（CS/EA・Sunrise／自動反映しない）— ' + rep.manual.length + ' 件');
  rep.manual.forEach(function (m) {
    Logger.log('  ' + m.ourSku + ' ' + m.note + ' : Unit ' + vcr_money_(m.unit) +
      ' ｜' + m.vendor + ' Inv#' + m.invNo);
  });

  // 保留リスト
  Logger.log('');
  Logger.log('▼ 保留リスト（書けなかった明細）— ' + rep.pending.length + ' 件');
  rep.pending.forEach(function (p) {
    Logger.log('  行' + p.rowNum + ' ' + p.vendor + ' / ' + (p.ourSku || '(SKU空)') +
      ' : ' + p.reason);
  });

  Logger.log('============================================================');
  Logger.log('dry-run 完了：Cost list へは一切書き込んでいません。');
  Logger.log('============================================================');
}


/////////////////////////// ヘルパー ///////////////////////////

/** 先頭数行から、required を全て含む見出し行を探す。{row, map} を返す。 */
function vcr_findHeader_(values, required) {
  var maxScan = Math.min(values.length, 8);
  for (var r = 0; r < maxScan; r++) {
    var map = {};
    for (var c = 0; c < values[r].length; c++) {
      var h = vcr_str_(values[r][c]);
      if (h) map[h] = c;
    }
    var ok = required.every(function (req) { return map.hasOwnProperty(req); });
    if (ok) return { row: r, map: map };
  }
  throw new Error('Receiving Log の見出し行が見つかりません（必須列: ' + required.join(', ') + '）');
}

/** 候補名のうち最初に見つかった列 index（0始まり）。無ければ -1。 */
function vcr_pick_(map, names) {
  for (var i = 0; i < names.length; i++) if (map.hasOwnProperty(names[i])) return map[names[i]];
  return -1;
}

/** ベンダー名 → Cost list タブ。正規化キーの部分一致。無ければ null。 */
function vcr_vendorToTab_(vendor) {
  var n = vcr_normKey_(vendor);
  var list = VCR_CONFIG.VENDOR_TAB;
  for (var i = 0; i < list.length; i++) {
    if (n.indexOf(list[i].key) >= 0) return list[i].tab;
  }
  return null;
}

/** 小文字化し英数字以外を除去（記号・空白を無視した照合用キー）。 */
function vcr_normKey_(s) {
  return vcr_str_(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Cost list のベンダータブを読み込み（A列SKU→行のindex、全値）。キャッシュ。 */
function vcr_loadVendorTab_(ss, tab, cache) {
  if (cache[tab]) return cache[tab];
  var sh = ss.getSheetByName(tab);
  if (!sh) { cache[tab] = null; return null; }
  var values = sh.getDataRange().getValues();
  var skuRow = {};
  for (var r = 0; r < values.length; r++) {
    var sku = vcr_str_(values[r][VCR_CONFIG.COST_LIST_SKU_COL - 1]).toUpperCase();
    if (sku && !skuRow.hasOwnProperty(sku)) skuRow[sku] = r;
  }
  cache[tab] = { sheet: sh, values: values, skuRow: skuRow };
  return cache[tab];
}

/** Invoice Date → 曜日（日0..土6）。判定不能は null。 */
function vcr_weekday_(v) {
  var t = vcr_time_(v);
  if (t === null) return null;
  return new Date(t).getDay();
}

/** 日付値 → epoch(ms)。不明は null。Date / 文字列 / 数値(シリアル外) 対応。 */
function vcr_time_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
  if (typeof v === 'string' && v.trim() !== '') {
    var d = new Date(v.trim());
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

function vcr_dateStr_(v) {
  var t = vcr_time_(v);
  if (t === null) return vcr_str_(v);
  return Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function vcr_today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function vcr_str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function vcr_num_(v) {
  if (typeof v === 'number') return v;
  var s = vcr_str_(v).replace(/[$,\s]/g, '');
  if (s === '' || isNaN(s)) return NaN;
  return Number(s);
}

function vcr_money_(n) { return (typeof n === 'number' && !isNaN(n)) ? '$' + n.toFixed(4) : vcr_str_(n); }
