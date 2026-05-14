/*******************************************************
 * _main.gs - 統合エントリポイント
 *
 * 役割：
 * - スプレッドシートを開いた時のメニュー登録（onOpen）
 * - 編集イベントの一元管理（onEdit）
 *
 * 注意：
 * - 各機能の本体は別ファイルにあります
 * - このファイルは「呼び出し役」だけを担当します
 *******************************************************/

/* ================= onEdit（編集イベント統合） =================
 * すべての編集イベントをここで受け取り、各機能に振り分けます
 * - VendorTools: ベンダータブ F/N列 → H列に日付（price_sync_test.gs）
 * - 商品一覧: E列でカテゴリ選択 → A列に品番自動生成（vedor_formulas.gs）
 ============================================================ */
function onEdit(e) {
  // VendorTools: ベンダータブのF/N列監視
  try {
    if (typeof onVendorEdit === 'function') onVendorEdit(e);
  } catch (err) {
    if (typeof vendorLog_ === 'function') {
      vendorLog_('onEdit (vendor) error', { err: String(err) });
    }
  }

  // 商品一覧: 品番自動生成
  try {
    if (typeof _codeGsOnEdit_ === 'function') _codeGsOnEdit_(e);
  } catch (err) {
    if (typeof vendorLog_ === 'function') {
      vendorLog_('onEdit (商品一覧) error', { err: String(err) });
    }
  }
}

/* ================= onOpen（メニュー登録統合） =================
 * すべてのメニューをここで一括登録します
 ============================================================ */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  // ===== VendorTools =====
  ui.createMenu('VendorTools')
    .addItem('セットアップ(トリガー作成)', 'setupInstall')
    .addItem('対象タブを表示',           'showVendorTargets')
    .addItem('トリガー全削除',           'removeAllVendorTriggers')
    .addItem('前回値メモリ消去',         'clearVendorMemory')
    .addToUi();

  // ===== Cost List =====
  ui.createMenu('Cost List')
    .addItem('Sort & Clean - このタブのみ', 'sortAndCleanCurrentSheet')
    .addItem('Sort & Clean - 全タブ',       'sortAndCleanAllSheets')
    .addSeparator()
    .addItem('Discontinued タブを作成',     'setupDiscontinuedSheet')
    .addToUi();

  // ===== 🧮 Vendor Formulas =====
  if (typeof applyFormulasAllVendors === 'function' ||
      typeof createVendorTemplate    === 'function') {
    const vf = ui.createMenu('🧮 Vendor Formulas');
    if (typeof applyFormulasAllVendors === 'function') {
      vf.addItem('全タブに数式を適用（G/I/J/K/L/N列）', 'applyFormulasAllVendors');
    }
    if (typeof createVendorTemplate === 'function') {
      vf.addSeparator()
        .addItem('テンプレートタブを作成', 'createVendorTemplate');
    }
    vf.addToUi();
  }

  // ===== 💲 Preferred Price =====
  try {
    if (typeof addRebuildPreferredPriceMenuSafe === 'function') {
      addRebuildPreferredPriceMenuSafe();
    }
  } catch (e) {}

  // ===== 価格同期 =====
  if (typeof syncPricesOverwriteAll      === 'function' ||
      typeof syncPricesOnlyBlank         === 'function' ||
      typeof syncPricesUpdateIfDifferent === 'function') {
    const m = ui.createMenu('価格同期');
    if (typeof syncPricesOverwriteAll      === 'function') m.addItem('① すべて上書き（安全）',        'syncPricesOverwriteAll');
    if (typeof syncPricesOnlyBlank         === 'function') m.addItem('② Jが空欄の行だけ埋める',        'syncPricesOnlyBlank');
    if (typeof syncPricesUpdateIfDifferent === 'function') m.addItem('③ 差分がある行だけ更新',          'syncPricesUpdateIfDifferent');
    if (typeof installDiffTrigger          === 'function') m.addItem('［トリガー作成］毎日2時に③を実行', 'installDiffTrigger');
    if (typeof removeDiffTrigger           === 'function') m.addItem('［トリガー削除］③の自動実行を停止', 'removeDiffTrigger');
    m.addToUi();
  }

  // ===== Weekly Mail =====
  if (typeof createWeeklyDraftFromCostList === 'function') {
    const w = ui.createMenu('Weekly Mail');
    w.addItem('下書きを作成（cost list）', 'createWeeklyDraftFromCostList');
    if (typeof sendWeeklyMailFromCostListNow      === 'function') w.addItem('（上級）即送信',                  'sendWeeklyMailFromCostListNow');
    if (typeof installWeeklyTriggerFromCostList   === 'function') w.addItem('［トリガー作成］毎週月曜13:00', 'installWeeklyTriggerFromCostList');
    if (typeof uninstallWeeklyTriggerFromCostList === 'function') w.addItem('［トリガー削除］自動作成を停止', 'uninstallWeeklyTriggerFromCostList');
    w.addToUi();
  }

  // ===== 価格管理（Custom Prices）===== // ← 追加
  if (typeof showCustomPriceFormAdd === 'function') {            // ← 追加
    const cp = ui.createMenu('価格管理');                          // ← 追加
    cp.addItem('個別価格を追加', 'showCustomPriceFormAdd');         // ← 追加
    cp.addItem('個別価格を変更', 'showCustomPriceFormEdit');        // ← 追加
    cp.addItem('個別価格を削除', 'showCustomPriceFormDelete');      // ← 追加
    cp.addSeparator();                                             // ← 追加
    cp.addItem('一覧を確認', 'jumpToCustomPricesSheet');            // ← 追加
    cp.addSeparator();                                             // ← 追加
    cp.addItem('Cost Reference を更新', 'rebuildCostReference');    // ← 追加
    cp.addToUi();                                                  // ← 追加
  }                                                                // ← 追加
}