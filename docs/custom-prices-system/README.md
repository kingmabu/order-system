# Custom Prices System - 実装指示書

**作成日：** 2026年5月13日
**プロジェクトオーナー：** Manabu Yokota（California Food Product / MY Inc.）
**実装担当：** Claude Code

---

## このプロジェクトは何か

QRコード注文システムがQBOにインボイスを自動作成する際、**顧客別の特別価格（個別価格 / +2.00%上乗せ）を自動で適用する**ためのシステム改修です。

現状はQBOの「Price Rules」が API経由のインボイスに適用されないため、従業員が**該当顧客のインボイスを開いて価格を1つずつ手動修正**しています。週20件以上、月6〜7時間の作業を撲滅するのが目的です。

---

## ゴール

1. **Cost list スプレッドシート**に「価格管理」メニューと3つの新規シートを追加
2. **Client Information の Client list** に Price Group 列を追加
3. **order-system / server.js** の価格決定ロジックを改修
4. QBOへ送るインボイスに **自動で正しい価格**が反映されるようにする

---

## 価格ルール（重要）

| 顧客タイプ | 対象 | 価格ルール |
|---|---|---|
| **Standard** | その他大多数 | Item List のスタンダード価格そのまま |
| **Group A** | 12社（Jinya Group） | スタンダード価格 × **1.020**（**2.00%上乗せ**）|
| **Individual** | 15社 | Custom Pricesシートから取得（無ければStandardにフォールバック）|

### スタンダード価格の取得先

商品の販売単位によって異なります：

- **量り売り商品**（Item List I列のチェック**なし**）→ Item List **J列**（Price $/lb）
- **定量売り商品**（Item List I列のチェック**あり**）→ Item List **K列**（Unit Price）

---

## 指示書ファイル一覧

このプロジェクトの指示書は以下の8ファイルで構成されています。**実装前に必ず全ファイルに目を通してください**。

| # | ファイル | 内容 | 重要度 |
|---|---|---|---|
| 0 | **README.md** | このファイル。全体目次・作業手順 | 必読 |
| 1 | **01-architecture.md** | システム全体構成・既存スクリプト・**触ってはいけない場所** | 必読 |
| 2 | **02-data-structures.md** | 新規シート定義・列追加の詳細 | 必読 |
| 3 | **03-cost-list-changes.md** | Cost list Apps Script 改修（既存5ファイル＋新規3ファイル）| 実装時 |
| 4 | **04-server-changes.md** | order-system / server.js 改修 | 実装時 |
| 5 | **05-migration-script.md** | 初期データ移行スクリプト（QBO Price Levels取得）| 実装時 |
| 6 | **06-testing.md** | テスト項目・段階的展開手順 | テスト時 |
| 7 | **07-rules.md** | 重要ルール・コーディング規約・禁止事項 | 必読 |

---

## システム構成（概要）

```
[Cost list] ← このプロジェクトで主に改修
  ├ 既存：ベンダー別タブ、Preferred Price、Weekly Mail等
  └ 新規：Custom Prices / Custom Price Log / Cost Reference / 価格管理メニュー
        ↓
[Item List]（商品一覧）  ← 触らない
  - J列・K列がスタンダード価格の正本
        ↓
[Client Information] ← 列追加のみ
  - Client list W列に Price Group を追加
        ↓
[order-system / server.js] ← 価格決定ロジック改修
  - Item List J/K列 + Client list W列 + Custom Pricesを参照
  - 確定価格でQBOへインボイス送信
```

詳細は **01-architecture.md** 参照。

---

## 開発環境セットアップ（重要）

このプロジェクトは数日〜数週間かかる見込みです。本番スプレッドシートは**日常業務で使い続ける**ため、**開発はすべてコピー環境で行います**。

### 開発環境の構成

| 環境 | Cost list | Item List | Client Information | order-system | QBO |
|---|---|---|---|---|---|
| **本番** | 既存ID（業務継続）| 既存ID（業務継続）| 既存ID（業務継続）| `main` ブランチ | 本番QBO |
| **開発** | **コピー作成** | **コピー作成** | **コピー作成** | `feature/custom-prices` ブランチ | dry-runモード（送信しない）|

### セットアップ手順（Manabuさんが事前に実施）

#### Step 1：スプレッドシート3つをコピー作成

Googleドライブで以下を実施：

1. **Cost list** を開く → ファイル → コピーを作成 → 名前を `Cost list [DEV]` などにする
2. **Item List**（商品一覧）も同様にコピー
3. **Client Information** も同様にコピー
4. コピー後、各スプレッドシートの **新しいID** をメモする

**注意：** コピー時に Apps Script も一緒にコピーされます。スプレッドシートIDの参照を含むコードがあれば、開発用IDに書き換える必要があります。

#### Step 2：開発用スプレッドシートのID管理

開発中に使うIDを `.env.development` ファイルに記載：

```env
# 開発用スプレッドシートID
DEV_COST_LIST_ID=xxxxxxxxxxxxx
DEV_ITEM_LIST_ID=xxxxxxxxxxxxx
DEV_CLIENT_INFO_ID=xxxxxxxxxxxxx
DEV_ORDER_RECORD_ID=xxxxxxxxxxxxx

# QBOモード切り替え
QBO_MODE=dry-run  # 開発中はdry-run、本番移行時にproductionに変更
```

#### Step 3：Gitブランチ作成

```bash
cd order-system
git checkout main
git pull
git checkout -b feature/custom-prices
```

### dry-runモードの仕様

開発中は、QBOへの実際の送信を行わず、**ログに出力するだけ**にします。

```javascript
// server.js
async function createInvoiceInQBO(invoiceData) {
  if (process.env.QBO_MODE === 'dry-run') {
    console.log('[DRY-RUN] QBO Invoice would be created:', JSON.stringify(invoiceData, null, 2));
    return { dryRun: true, mockInvoiceId: 'DRY-' + Date.now() };
  }
  // 本番モード: 実際にQBO APIを呼ぶ
  return await qboCreateInvoice(invoiceData);
}
```

これで、開発中のテスト注文がQBOに実際のインボイスを作成することがありません。

### 本番移行手順（完成後）

開発が完了したら、以下の手順で本番に反映します：

1. **本番スプレッドシートに新規シートを作成**（Custom Prices / Custom Price Log / Cost Reference）
2. **本番スプレッドシートのApps Scriptに改修コードをコピー＆ペースト**
   - 既存ファイル：除外リスト追加部分のみ
   - 新規ファイル：3つを丸ごと追加
3. **`feature/custom-prices` ブランチを `main` にマージ**
4. **`.env` を本番IDに切り替え、`QBO_MODE=production` に変更**
5. **Renderにデプロイ**
6. **自社（MY Inc.）顧客で1〜2件テスト**
7. **問題なければ全顧客展開**

詳細は **06-testing.md** 参照。

---

## 作業手順（推奨順序）

### フェーズ0：開発環境セットアップ（Manabuさんが実施）

0. 上記「**開発環境セットアップ**」セクションに従ってコピー作成・ブランチ作成

### フェーズ1：Cost list 改修（先に完了させる）

1. **01〜02を熟読**してアーキテクチャと新規データ構造を把握
2. **03-cost-list-changes.md** に従って既存ファイル5つの除外リストに新規シート名を追加（**開発用Cost listに対して**）
3. **同03** に従って新規ファイル3つ（custom_prices_form.gs / .html / cost_reference.gs）を作成
4. 開発用 Cost list を開いて「価格管理」メニューが追加されているか確認
5. 「個別価格を追加 / 変更 / 削除」フォームが動作するか確認

### フェーズ2：Client Information 改修（開発用）

6. **開発用** Client list の W列（Price Group）、X列（Markup %）を追加（`apps-script/client-info-dev/setup_price_group.js` を実行）
7. 全顧客の Price Group を **Standard / Group A / Individual** に分類

### フェーズ3：初期データ移行（開発用）

8. **05-migration-script.md** に従って使い捨てスクリプトでQBO Price Levelsを取得
9. 取得したCSVを **開発用** Custom Prices シートに投入

### フェーズ4：order-system 改修（開発ブランチ）

10. `feature/custom-prices` ブランチで **04-server-changes.md** に従って server.js の価格決定ロジックを改修
11. **dry-runモード**でローカル動作確認（QBOには送信されない）

### フェーズ5：本番移行 + テスト・段階的展開

12. 「**本番移行手順**」（上記）に従って本番環境に移植
13. **06-testing.md** に従って自社（MY Inc.）顧客でテスト
14. 先行顧客1〜2社で実運用テスト
15. 問題なければ全顧客へ展開

---

## 重要な制約・ルール

詳細は **07-rules.md** 参照。以下は特に重要なポイント：

1. **既存スクリプトの動作は変更しない**
   - 除外リストへの「追加」と新規メニュー追加のみ
   - 既存関数のロジックは絶対に書き換えない

2. **本番環境で破壊的変更を行わない**
   - シート削除、列削除、データ消去は実行前に必ず確認

3. **作業ルール**
   - 機能完成時 or エラー3回ループ時：Manabuさんに「**/clearを打つタイミングです**」と伝える
   - 不明点は選択肢形式で確認
   - コードは完全版で提供、変更箇所に `// ← 変更` コメント

---

## 関連リソース

### スプレッドシートID

| ブック名 | 本番ID | 開発用ID（コピー後に記入）|
|---|---|---|
| **Cost list** | `1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k` | （要記入）|
| **Item List**（商品一覧）| `14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc` | （要記入）|
| **Client Information**（Clients List）| `1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8` | （要記入）|
| **CFP Operations** | `1m2wm3M0xeoCWE3a4U4e-xvBKMR3j2Wllts7OBjBtv6o` | （触らない）|
| **order-system record** | `1Qi7IuVjksPQa3wv_YIid_UCHaHYmmmyBH3oT8BJKLIk` | （要記入）|

### GitHubリポジトリ

- リポジトリ名：`order-system`
- URL：`https://github.com/kingmabu/order-system`
- デプロイ先：`https://order-system-5zq7.onrender.com`

### 連絡先・アラート送信先

- システムアラート送信先：`ordercfp@gmail.com`

---

## このプロジェクトの完了条件

以下がすべて達成されたらプロジェクト完了です：

- [ ] Cost list に「価格管理」メニューが追加されている
- [ ] Custom Prices / Custom Price Log / Cost Reference の3シートが作成されている
- [ ] Client list W列に Price Group が設定されている（全顧客）
- [ ] Individual の15社の個別価格が Custom Prices に登録されている
- [ ] order-system が Custom Prices を参照して価格決定するようになっている
- [ ] 量り売り（J列）/ 定量売り（K列）の判定が正しく動作している
- [ ] エラー発生時に `ordercfp@gmail.com` に通知が届く
- [ ] テスト顧客 + 先行顧客1〜2社で正常稼働を確認した
- [ ] 全顧客への展開が完了している
- [ ] **Chocoの解約が完了している**（本プロジェクトの究極目的）

---

## 改訂履歴

| 日付 | 内容 |
|---|---|
| 2026-05-13 | 初版作成 |
