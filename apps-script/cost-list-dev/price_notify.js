/**
 * price_notify.gs （価格通知システム v1 / Phase 1 MVP） 追加日:2026-05-30
 * ★独自 onOpen なし。メニュー「📧 価格通知」は _main.gs の onOpen に統合。
 * ★全関数 pn_ 接頭辞、定数 PN_CONFIG（既存ファイルと衝突回避）。
 * ★参照IDは PN_CONFIG.SS（本番）。TEST_MODE=true の間は送信先固定で安全。
 */


/////////////////// 設定 ///////////////////
var PN_CONFIG = {
  TEST_MODE: true,                          // ★本番にするときだけ false にする
  TEST_EMAIL: 'califoodpro@gmail.com',      // テスト送信先
  RECENT_DAYS: 90,
  SIGNATURE: 'California Food Products / Tel: 213-923-0030 / califoodpro@gmail.com',

  SS: {
    COST:   '1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k',
    CLIENT: '1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8',
    ORDER:  '1Qi7IuVjksPQa3wv_YIid_UCHaHYmmmyBH3oT8BJKLIk',
    ITEM:   '14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc'
  },
  TAB: {
    PREFERRED: 'Preferred Price',
    CUSTOM:    'Custom Prices',
    CLIENT:    'Client list',
    ORDER:     'Sheet1',
    ITEM:      '商品一覧',
    SNAPSHOT:  '_PriceSnapshot',
    SENDLOG:   '_SendLog',
    PREVIEW:   '_Preview'
  },
  ITEM_HEADER_ROW: 4   // 商品一覧の見出しは4行目
};

/* onOpen は _main.gs に統合（このファイルでは定義しない）*/

/////////////////// 共通ヘルパー ///////////////////
function pn_openTab(ssId, name) {
  var sh = SpreadsheetApp.openById(ssId).getSheetByName(name);
  if (!sh) throw new Error('タブが見つかりません: ' + name);
  return sh;
}

// 見出し行から「列名 → 列番号(1始まり)」の対応を作る
function pn_headerMap(sh, headerRow) {
  headerRow = headerRow || 1;
  var last = sh.getLastColumn();
  var vals = sh.getRange(headerRow, 1, 1, last).getValues()[0];
  var m = {};
  for (var i = 0; i < vals.length; i++) {
    var h = vals[i];
    if (h !== '' && h != null) m[String(h).trim()] = i + 1;
  }
  return m;
}

function pn_getDataRows(sh, startRow) {
  var last = sh.getLastRow();
  if (last < startRow) return [];
  return sh.getRange(startRow, 1, last - startRow + 1, sh.getLastColumn()).getValues();
}

// 顧客IDを正規化（数字は3桁ゼロ埋め、GROUP_ は大文字）
function pn_normId(v) {
  if (v == null) return '';
  var s = String(v).trim();
  if (s === '') return '';
  if (/^\d+$/.test(s)) { while (s.length < 3) s = '0' + s; return s; }
  return s.toUpperCase();
}

// Client List の Price Group（例「Group C」）→ Custom Prices のID（例「GROUP_C」）
function pn_groupIdFromPriceGroup(pg) {
  if (pg == null) return '';
  var m = String(pg).trim().match(/^Group\s+([A-Za-z0-9]+)$/i);
  return m ? ('GROUP_' + m[1].toUpperCase()) : '';   // Individual / Standard はグループ特別価格なし
}

function pn_parsePrice(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  var n = Number(String(v).replace(/[$,\s]/g, ''));
  return (!isNaN(n) && n > 0) ? n : null;
}

function pn_fmtMoney(n) { return '$' + Number(n).toFixed(2); }

function pn_getOrCreateTab(ssId, name, headers) {
  var ss = SpreadsheetApp.openById(ssId);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.hideSheet();
  }
  return sh;
}

/////////////////// 価格マップ構築 ///////////////////
function pn_buildStandardMap() {
  var sh = pn_openTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.PREFERRED);
  var h = pn_headerMap(sh, 1);
  var cSku = h['SKU'], cPrice = h['QB Price'];
  var map = {};
  pn_getDataRows(sh, 2).forEach(function (r) {
    var sku = String(r[cSku - 1] || '').trim();
    if (!sku) return;
    var p = pn_parsePrice(r[cPrice - 1]);
    if (p != null) map[sku] = p;
  });
  return map;
}

function pn_buildCustomMaps() {
  var sh = pn_openTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.CUSTOM);
  var h = pn_headerMap(sh, 1);
  var cId = h['Customer ID'], cSku = h['SKU'], cPrice = h['Custom Price'];
  var store = {}, group = {};
  pn_getDataRows(sh, 2).forEach(function (r) {
    var id = String(r[cId - 1] || '').trim();
    var sku = String(r[cSku - 1] || '').trim();
    if (!id || !sku) return;
    var p = pn_parsePrice(r[cPrice - 1]);
    if (p == null) return;
    if (/^GROUP/i.test(id)) group[id.toUpperCase() + '|' + sku] = p;
    else store[pn_normId(id) + '|' + sku] = p;
  });
  return { store: store, group: group };
}

// 「その顧客のそのSKUの価格」を決定（店指定 → グループ指定 → 標準）
function pn_customerPrice(custId, priceGroup, sku, std, custom) {
  var sKey = custId + '|' + sku;
  if (custom.store[sKey] != null) return custom.store[sKey];
  var gid = pn_groupIdFromPriceGroup(priceGroup);
  if (gid) {
    var gKey = gid + '|' + sku;
    if (custom.group[gKey] != null) return custom.group[gKey];
  }
  if (std[sku] != null) return std[sku];
  return null;
}

// pn_customerPrice と同じ順序で「解決した価格」と「スナップショット用キー」を返す
// （送信分のみ基準更新するために、どのキーを更新すべきかを特定する）
function pn_resolveKeyed(custId, priceGroup, sku, std, custom) {
  var sKey = custId + '|' + sku;
  if (custom.store[sKey] != null) return { key: 'STORE:' + sKey, price: custom.store[sKey] };
  var gid = pn_groupIdFromPriceGroup(priceGroup);
  if (gid) {
    var gKey = gid + '|' + sku;
    if (custom.group[gKey] != null) return { key: 'GRP:' + gKey, price: custom.group[gKey] };
  }
  if (std[sku] != null) return { key: 'STD:' + sku, price: std[sku] };
  return null;
}

function pn_buildItemMap() {
  var sh = pn_openTab(PN_CONFIG.SS.ITEM, PN_CONFIG.TAB.ITEM);
  var hr = PN_CONFIG.ITEM_HEADER_ROW;
  var h = pn_headerMap(sh, hr);
  var cSku = h['SKU'], cJp = h['商品名'], cEn = h['Item Name'], cUnit = h['Packaging'] || h['規格']; // 単位は英語(Packaging)優先
  var cStock = h['Stock'] || h['在庫状況']; // 在庫状態（販売終了・近日入荷などの判定用）
  // 「Unit?」列（量り売り=False / 定量売り=True）と 重量(LBS) 列を、見出しに絵文字等があっても拾えるよう柔軟に探す
  var cFlag = null, cWeight = null;
  for (var key in h) {
    if (key.indexOf('Unit?') >= 0) cFlag = h[key];
    if (key.indexOf('Weight') >= 0 && /lb/i.test(key)) cWeight = h[key]; // ← N列 Weight (LBS) のみ。O列 Weight (Kg) は拾わない
  }
  var map = {};
  pn_getDataRows(sh, hr + 1).forEach(function (r) {
    var sku = String(r[cSku - 1] || '').trim();
    if (!sku) return;
    var flagVal = cFlag ? r[cFlag - 1] : false;
    var isUnit = (flagVal === true || String(flagVal).trim().toLowerCase() === 'true'); // 定量売り
    var wt = cWeight ? Number(r[cWeight - 1]) : 0;
    map[sku] = {
      jp: String(r[cJp - 1] || '').trim(),
      en: String(r[cEn - 1] || '').trim(),
      unit: String(r[cUnit - 1] || '').trim(),
      isUnit: isUnit,
      weight: (!isNaN(wt) && wt > 0) ? wt : 0,
      stock: cStock ? String(r[cStock - 1] || '').trim() : ''
    };
  });
  return map;
}

function pn_nameOf(sku, items) {
  var it = items[sku];
  if (!it) return sku;
  return it.en || it.jp || sku;   // 英語名のみ（無ければ日本語、それも無ければSKU）
}

// 通知から除外する商品：販売終了/近日入荷/在庫なし（在庫あり・在庫わずか は対象）
function pn_isExcludedItem(sku, items) {
  var it = items[sku];
  if (!it) return false;
  var st = String(it.stock || '').trim().toLowerCase();
  var ng = { 'discontinued': 1, 'coming soon': 1, 'out of stock': 1, '販売終了': 1, '近日入荷': 1, '在庫なし': 1 };
  if (ng[st]) return true;
  var nm = (it.jp + ' ' + it.en).toLowerCase();   // 念のため商品名でも判定
  return nm.indexOf('discontinued') >= 0 || nm.indexOf('coming soon') >= 0;
}

/////////////////// 購入履歴（直近90日） ///////////////////
function pn_buildRecentPurchases() {
  var sh = pn_openTab(PN_CONFIG.SS.ORDER, PN_CONFIG.TAB.ORDER);
  var h = pn_headerMap(sh, 1);
  var cDate = h['Order Date'], cId = h['Customer ID'], cName = h['Customer Name'], cSku = h['SKU'];
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PN_CONFIG.RECENT_DAYS);
  var byId = {}, byName = {};
  pn_getDataRows(sh, 2).forEach(function (r) {
    var d = r[cDate - 1];
    if (!(d instanceof Date)) d = new Date(d);
    if (isNaN(d.getTime()) || d < cutoff) return;
    var sku = String(r[cSku - 1] || '').trim();
    if (!sku) return;
    var id = pn_normId(r[cId - 1]);
    var nm = String(r[cName - 1] || '').trim();
    if (id) { (byId[id] = byId[id] || {})[sku] = true; }
    if (nm) { (byName[nm] = byName[nm] || {})[sku] = true; }
  });
  return { byId: byId, byName: byName };
}

function pn_recentSkusFor(custId, custName, recent) {
  var set = {};
  if (custId && recent.byId[custId]) for (var k in recent.byId[custId]) set[k] = true;
  if (custName && recent.byName[custName]) for (var k2 in recent.byName[custName]) set[k2] = true;
  return Object.keys(set);
}

/////////////////// 顧客リスト ///////////////////
function pn_readClients() {
  var sh = pn_openTab(PN_CONFIG.SS.CLIENT, PN_CONFIG.TAB.CLIENT);
  var h = pn_headerMap(sh, 1);
  return pn_getDataRows(sh, 2).map(function (r) {
    function g(name) { return h[name] ? r[h[name] - 1] : ''; }
    return {
      id: pn_normId(g('Customer ID')),
      name: String(g('Customer Name') || '').trim(),
      ownerEmail: String(g('Owner Email') || '').trim(),
      mgrEmail: String(g('Manager Email') || '').trim(),
      priceGroup: String(g('Price Group') || '').trim(),
      notify: String(g('通知希望') || '').trim(),
      freq: String(g('通知頻度') || '').trim(),
      notifyEmail: String(g('通知メール') || '').trim(),
      weekday: String(g('通知曜日') || '').trim()
    };
  }).filter(function (c) { return c.id || c.name; });
}

function pn_isOn(v) {
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'はい' || s === '✓' || s === '1' || s === 'yes' || s === 'on';
}

// 送信先を決める：通知メール列があればそれ（複数可）、無ければ Manager → Owner
function pn_resolveRecipients(c) {
  if (c.notifyEmail) {
    return c.notifyEmail.split(/[,;\s]+/).filter(function (x) { return x.indexOf('@') > 0; });
  }
  if (c.mgrEmail) return [c.mgrEmail];
  if (c.ownerEmail) return [c.ownerEmail];
  return [];
}

/////////////////// スナップショット ///////////////////
function pn_buildAllPriceKeys(std, custom) {
  var all = {};
  Object.keys(std).forEach(function (sku) { all['STD:' + sku] = std[sku]; });
  Object.keys(custom.group).forEach(function (k) { all['GRP:' + k] = custom.group[k]; });
  Object.keys(custom.store).forEach(function (k) { all['STORE:' + k] = custom.store[k]; });
  return all;
}

function pn_readSnapshot() {
  var sh = pn_getOrCreateTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.SNAPSHOT, ['key', 'price', 'updated_at']);
  var map = {};
  pn_getDataRows(sh, 2).forEach(function (r) {
    if (r[0] !== '' && r[0] != null) map[String(r[0])] = pn_parsePrice(r[1]);
  });
  return map;
}

function pn_writeSnapshot(allPrices) {
  var sh = pn_getOrCreateTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.SNAPSHOT, ['key', 'price', 'updated_at']);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).clearContent();
  var now = new Date();
  var rows = Object.keys(allPrices).map(function (k) { return [k, allPrices[k], now]; });
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
}

// 指定したキーだけを更新（既存は上書き、無ければ追記）。他のキーは触らない。
function pn_updateSnapshotKeys(touched) {
  var keys = Object.keys(touched);
  if (!keys.length) return;
  var sh = pn_getOrCreateTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.SNAPSHOT, ['key', 'price', 'updated_at']);
  var last = sh.getLastRow();
  var pos = {};
  if (last >= 2) {
    var existing = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) pos[String(existing[i][0])] = i + 2;
  }
  var now = new Date();
  var appends = [];
  keys.forEach(function (k) {
    if (pos[k]) {
      sh.getRange(pos[k], 2).setValue(touched[k]);
      sh.getRange(pos[k], 3).setValue(now);
    } else {
      appends.push([k, touched[k], now]);
    }
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, 3).setValues(appends);
}

// スナップショットのキーから、当時の標準/特別マップを復元
function pn_reconstructFromSnapshot(snap) {
  var std = {}, store = {}, group = {};
  Object.keys(snap).forEach(function (k) {
    var p = snap[k];
    if (k.indexOf('STD:') === 0) std[k.substring(4)] = p;
    else if (k.indexOf('GRP:') === 0) group[k.substring(4)] = p;
    else if (k.indexOf('STORE:') === 0) store[k.substring(6)] = p;
  });
  return { std: std, custom: { store: store, group: group } };
}

/////////////////// メニュー処理 ///////////////////
function pn_menu_setup() {
  pn_ensureClientColumns();
  pn_getOrCreateTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.SNAPSHOT, ['key', 'price', 'updated_at']);
  pn_getOrCreateTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.SENDLOG,
    ['Timestamp', 'Mode', '店名', '実際の送信先', '本来の宛先', '件名', 'SKU数', '結果']);
  SpreadsheetApp.getUi().alert('初期設定が完了しました。\n\n' +
    '・Client List に「通知希望／通知頻度／通知メール／通知曜日」列を追加\n' +
    '・Cost List に _PriceSnapshot / _SendLog タブを作成');
}

function pn_ensureClientColumns() {
  var sh = pn_openTab(PN_CONFIG.SS.CLIENT, PN_CONFIG.TAB.CLIENT);
  var h = pn_headerMap(sh, 1);
  ['通知希望', '通知頻度', '通知メール', '通知曜日'].forEach(function (name) {
    if (!h[name]) {
      var col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(name);
      h[name] = col;
    }
  });
}

function pn_menu_enableManpuku() {
  var sh = pn_openTab(PN_CONFIG.SS.CLIENT, PN_CONFIG.TAB.CLIENT);
  pn_ensureClientColumns();
  var h = pn_headerMap(sh, 1);
  var cName = h['Customer Name'], cNotify = h['通知希望'], cFreq = h['通知頻度'];
  var rows = pn_getDataRows(sh, 2);
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var name = String(rows[i][cName - 1] || '');
    if (name.indexOf('Manpuku') >= 0) {
      var rowNum = i + 2;
      sh.getRange(rowNum, cNotify).setValue('TRUE');
      if (cFreq && !String(rows[i][cFreq - 1] || '').trim()) sh.getRange(rowNum, cFreq).setValue('both');
      n++;
    }
  }
  SpreadsheetApp.getUi().alert('Manpuku ' + n + ' 店舗を通知対象（通知希望=TRUE）に設定しました。');
}

function pn_menu_initSnapshot() {
  var std = pn_buildStandardMap();
  var custom = pn_buildCustomMaps();
  pn_writeSnapshot(pn_buildAllPriceKeys(std, custom));
  SpreadsheetApp.getUi().alert('現在の価格を「基準」として保存しました。\nこれ以降の変更が検知対象になります。');
}

// ④ ベースライン（現在価格のご案内）
function pn_menu_baselinePreview() { pn_buildPreview('baseline'); }
// ⑤ 変更チェック
function pn_menu_changePreview() { pn_buildPreview('change'); }

function pn_buildPreview(mode) {
  var std = pn_buildStandardMap();
  var custom = pn_buildCustomMaps();
  var items = pn_buildItemMap();
  var recent = pn_buildRecentPurchases();
  var clients = pn_readClients();
  var snap = pn_readSnapshot();
  var snapM = pn_reconstructFromSnapshot(snap);
  var snapEmpty = Object.keys(snap).length === 0;

  if (mode === 'change' && snapEmpty) {
    SpreadsheetApp.getUi().alert('まだ基準価格がありません。先に「③ 基準価格をセット」を実行してください。');
    return;
  }

  var out = []; // [送信する, 店名, 本来の宛先, 実際の送信先, 件名, 本文, mode]
  var noAddr = [];

  clients.forEach(function (c) {
    if (!pn_isOn(c.notify)) return;
    var skus = pn_recentSkusFor(c.id, c.name, recent);
    skus.sort(function (a, b) {          // カテゴリ順（牛→豚→鶏→ラム→魚介→その他）、同カテゴリ内はSKU順
      var ca = pn_catOrder(a), cb = pn_catOrder(b);
      if (ca !== cb) return ca - cb;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    var lines = [];
    var keys = {};   // このお客様のメールに載せた商品の (基準キー → 価格)。送信分のみ更新に使う

    skus.forEach(function (sku) {
      if (pn_isExcludedItem(sku, items)) return;
      var cur = pn_resolveKeyed(c.id, c.priceGroup, sku, std, custom);
      if (!cur || cur.price == null || cur.price <= 0) return;
      var newP = cur.price;
      if (mode === 'baseline') {
        lines.push(pn_lineCurrent(sku, items, newP));
        keys[cur.key] = newP;
      } else {
        var oldP = pn_customerPrice(c.id, c.priceGroup, sku, snapM.std, snapM.custom);
        if (oldP == null || oldP === newP) return;
        lines.push(pn_lineChange(sku, items, oldP, newP));
        keys[cur.key] = newP;
      }
    });

    if (!lines.length) return;

    var recips = pn_resolveRecipients(c);
    var actual = PN_CONFIG.TEST_MODE ? PN_CONFIG.TEST_EMAIL : recips.join(',');
    if (!PN_CONFIG.TEST_MODE && recips.length === 0) { noAddr.push(c.name); return; }

    var subject = (mode === 'baseline')
      ? '[CFP] Current Price List - ' + c.name
      : '[CFP] Price Update - ' + c.name;
    var body = pn_buildBody(mode, c.name, lines);

    out.push(['TRUE', c.name, recips.join(',') || '(未登録)', actual, subject, body, mode, JSON.stringify(keys)]);
  });

  pn_writePreview(out);
  var msg = 'プレビューを作成しました（' + out.length + ' 件）。\n' +
    '_Preview タブで内容を確認し、よければ「⑥ プレビュー内容を送信実行」を押してください。';
  if (PN_CONFIG.TEST_MODE) msg += '\n\n※テストモードのため、実際の送信先はすべて ' + PN_CONFIG.TEST_EMAIL + ' です。';
  if (noAddr.length) msg += '\n\n宛先未登録のためスキップ: ' + noAddr.join('、');
  SpreadsheetApp.getUi().alert(msg);
}

// カテゴリ並び順（SKU先頭文字）：牛B→豚P→鶏C→ラム/鴨L→魚介S→その他X
function pn_catOrder(sku) {
  var order = { B: 1, P: 2, C: 3, L: 4, S: 5, X: 6 };
  var c = String(sku).charAt(0).toUpperCase();
  return order[c] || 9;
}

// 価格の見せ方：量り売り(False)=/lbs、定量売り(True)=$/lb×重量で「箱/袋/ピース」単位
// price は常に「$/lb」基準（標準・特別ともに）。定量品はパッケージ価格に換算して表示する。
function pn_priceAmount(sku, items, price) {
  var it = items[sku] || {};
  if (it.isUnit && it.weight) return pn_fmtMoney(price * it.weight);
  return pn_fmtMoney(price);
}
function pn_priceUnitLabel(sku, items) {
  var it = items[sku] || {};
  if (it.isUnit && it.weight) {
    var w = Math.round(it.weight * 100) / 100;   // 1単位の重さ（lbs）を併記
    return '/ ' + (it.unit || 'unit') + ' (' + w + ' lbs)';
  }
  return '/lbs';
}

function pn_lineCurrent(sku, items, price) {
  return '- ' + pn_nameOf(sku, items) + ': ' + pn_priceAmount(sku, items, price) + ' ' + pn_priceUnitLabel(sku, items);
}
function pn_lineChange(sku, items, oldP, newP) {
  return '- ' + pn_nameOf(sku, items) + ': '
    + pn_priceAmount(sku, items, oldP) + ' → ' + pn_priceAmount(sku, items, newP)
    + ' ' + pn_priceUnitLabel(sku, items) + ' (effective your next order)';
}

// プレーン本文をHTMLに変換。商品行（先頭が「- 」）だけ太字＋色で強調する。
function pn_textToHtml(body) {
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var rows = String(body).split('\n').map(function (line) {
    var e = esc(line) || '&nbsp;';
    if (/^- /.test(line)) {
      var color = '#222222';
      var m = line.match(/\$([0-9.,]+)\s*→\s*\$([0-9.,]+)/);
      if (m) {
        var o = parseFloat(m[1].replace(/,/g, '')), n = parseFloat(m[2].replace(/,/g, ''));
        color = (n > o) ? '#c0392b' : '#0b5394';   // 値上げ=赤 / 値下げ=青
      }
      return '<div style="font-weight:bold; color:' + color + ';">' + e + '</div>';
    }
    return '<div>' + e + '</div>';
  });
  return '<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#222222; line-height:1.5;">'
    + rows.join('') + '</div>';
}

function pn_buildBody(mode, storeName, lines) {
  var intro;
  if (mode === 'baseline') {
    intro = 'Please find below the current prices for the items you regularly order from us.';
  } else {
    intro = 'We would like to inform you of a price change on the following item(s) you regularly order from us.';
  }
  return 'Dear ' + storeName + ',\n\n'
    + 'Thank you for your continued business with California Food Products.\n'
    + intro + '\n\n'
    + lines.join('\n') + '\n\n'
    + 'If you have any questions, please feel free to contact us.\n'
    + PN_CONFIG.SIGNATURE;
}

function pn_writePreview(rows) {
  var ss = SpreadsheetApp.openById(PN_CONFIG.SS.COST);
  var sh = ss.getSheetByName(PN_CONFIG.TAB.PREVIEW);
  if (!sh) sh = ss.insertSheet(PN_CONFIG.TAB.PREVIEW);
  sh.clear();
  var header = ['送信する', '店名', '本来の宛先', '実際の送信先', '件名', '本文', 'mode', 'keys'];
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  sh.setColumnWidth(6, 480);
  sh.getRange(2, 6, Math.max(rows.length, 1), 1).setWrap(true);
  sh.hideColumns(8); // keys（内部用）は非表示
  sh.activate();
}

// ⑥ 送信実行
function pn_menu_send() {
  var ss = SpreadsheetApp.openById(PN_CONFIG.SS.COST);
  var sh = ss.getSheetByName(PN_CONFIG.TAB.PREVIEW);
  if (!sh || sh.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('プレビューがありません。先に④か⑤を実行してください。');
    return;
  }
  var ui = SpreadsheetApp.getUi();
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  var toSend = data.filter(function (r) { return pn_isOn(r[0]); });
  if (!toSend.length) { ui.alert('「送信する」がTRUEの行がありません。'); return; }

  var dest = PN_CONFIG.TEST_MODE ? ('テスト送信先 ' + PN_CONFIG.TEST_EMAIL) : '本来の宛先';
  var resp = ui.alert('確認',
    toSend.length + ' 通を ' + dest + ' に送信します。よろしいですか？',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var logSh = pn_getOrCreateTab(PN_CONFIG.SS.COST, PN_CONFIG.TAB.SENDLOG,
    ['Timestamp', 'Mode', '店名', '実際の送信先', '本来の宛先', '件名', 'SKU数', '結果']);
  var now = new Date();
  var sent = 0;
  var touched = {};      // 送信成功した変更通知のキーだけを集める（送信分のみ基準更新）
  var fullInit = false;  // ベースライン送信が成功したら全体初期化（§8）
  toSend.forEach(function (r) {
    var actual = String(r[3] || '').trim();
    var subject = r[4], body = r[5], mode = r[6], store = r[1], keysJson = r[7];
    var skuCount = (String(body).match(/^- /gm) || []).length;
    var result = 'OK';
    try {
      if (!actual) throw new Error('宛先なし');
      GmailApp.sendEmail(actual, subject, body, { htmlBody: pn_textToHtml(body) });
      sent++;
    } catch (e) {
      result = 'NG: ' + e.message;
    }
    logSh.appendRow([now, mode, store, actual, r[2], subject, skuCount, result]);

    // 送信に成功した分だけ基準を更新する
    if (result === 'OK') {
      if (mode === 'baseline') {
        fullInit = true;
      } else {
        try {
          var kk = JSON.parse(keysJson || '{}');
          for (var key in kk) touched[key] = kk[key];
        } catch (e2) { /* keys が壊れていても送信は成功扱い */ }
      }
    }
  });

  // 基準価格(_PriceSnapshot)の更新：ベースラインは全体初期化、変更通知は送信分のみ
  var updMsg;
  if (fullInit) {
    var std = pn_buildStandardMap();
    var custom = pn_buildCustomMaps();
    pn_writeSnapshot(pn_buildAllPriceKeys(std, custom));
    updMsg = '基準価格を全体初期化しました。';
  } else {
    pn_updateSnapshotKeys(touched);
    updMsg = Object.keys(touched).length + ' 件の価格を基準更新しました（送信分のみ）。';
  }

  ui.alert(sent + ' 通を送信しました。' + updMsg + '\n結果は _SendLog タブに記録しています。');
}
