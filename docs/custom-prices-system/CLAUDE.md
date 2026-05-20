# CLAUDE.md - Custom Prices System Project

このプロジェクトは、**California Food Product / MY Inc.** の食肉卸業向け QRコード注文システム（`order-system`）に、**顧客別の個別価格機能**を追加する開発プロジェクトです。

---

## 🎯 プロジェクトの目的

QBOの「Price Rules」が API経由のインボイスに適用されないため、現在は従業員が**インボイスを開いて手動で価格修正**しています（週20件以上、月6〜7時間）。これを自動化するのが本プロジェクトのゴールです。

---

## 📚 最初に読むべきファイル

**実装に着手する前に、必ず以下を順番に読んでください：**

1. `docs/custom-prices-system/README.md` ← まずこれ
2. `docs/custom-prices-system/01-architecture.md`
3. `docs/custom-prices-system/02-data-structures.md`
4. `docs/custom-prices-system/07-rules.md` ← **特に重要**

その後、実装するフェーズに応じて以下を参照：

- フェーズ1（Cost list改修）→ `03-cost-list-changes.md`
- フェーズ2（Client list改修）→ `02-data-structures.md` 5章
- フェーズ3（初期データ移行）→ `05-migration-script.md`
- フェーズ4（server.js改修）→ `04-server-changes.md`
- フェーズ5（テスト・展開）→ `06-testing.md`

---

## ⚠ 重要ルール（絶対に守る）

詳細は `docs/custom-prices-system/07-rules.md` 参照。要点：

1. **本番スプレッドシートを開発中に触らない** - 開発用コピーを使う
2. **既存スクリプトのロジック変更禁止** - 追加のみOK
3. **`QBO_MODE=dry-run` を開発中は維持** - 本番QBOに送信しない
4. **不明点は選択肢形式で確認** - 勝手に判断しない
5. **手順は1ステップずつ** - 動作確認しながら進める
6. **コードは完全版で提供** - 部分的な差分にしない、変更箇所に `// ← 変更` コメント

---

## 🔄 /clear を打つべきタイミング

以下の場合、Manabu さんに「**/clearを打つタイミングです**」と伝えてください：

- ✅ 1つの機能が完成して動作確認OKになったとき
- ⚠ 同じエラーで3回直しても解決しないとき
- 📦 会話が長くなりすぎて、コンテキストが肥大化したとき

---

## 📋 現在のフェーズ進捗（2026-05-15 更新）

> **重要な設計変更（2026-05-15）**：顧客分類を**5分類**に拡張しました。 // ← 変更
> - 旧：Standard / Group A / Individual（3分類）
> - 新：Standard / Group A / Group B / Group C / Individual（**5分類**）
>   - Group B（Daikoku Group **6社**）：**6社で共通カスタム価格**（疑似ID `GROUP_B`）
>   - Group C（Manpuku **4社**）：**4社で共通カスタム価格**（疑似ID `GROUP_C`）

実装が進むごとに更新してください：

- [x] **フェーズ0**: 開発環境セットアップ（スプレッドシートコピー・ブランチ作成）← commit 9015231
- [x] **フェーズ1**: Cost list Apps Script 改修 ← commit a36b876
  - [x] 既存4ファイルの除外リスト追加
  - [x] cost_reference.gs 作成
  - [x] custom_prices_form.gs 作成
  - [x] custom_prices_form.html 作成
  - [x] 動作確認（メニュー・フォーム・ログ）
  - [x] **5分類対応改修**（`getCustomPriceTargets` 追加・`addCustomPrice` Group B/C対応・HTML側プルダウン対応） // ← 変更
  - [x] **5分類対応版を開発用Cost listにデプロイ**（2026-05-19完了・フォーム動作確認済：Group B/C + Individual 9社=計11項目表示） // ← 変更
- [x] **フェーズ2**: Client list W列・X列追加 ← commit 87398d0（スクリプト作成、列順W/X修正済）
  - [x] `setup_price_group.js` の `PG_VALID_GROUPS` を5択に拡張 // ← 変更
  - [x] **手順書1完了**（3択版での実行は完了済み）
  - [x] **5択版で `setupPriceGroupColumns` を再実行**（2026-05-19完了・W列プルダウン5択化済み・95社対象） // ← 変更
  - [x] **全顧客の Price Group分類**（2026-05-19完了・Group A=12 / Group B=6 / Group C=4 / Individual=9 / Standard=64・合計95社・X列はGroup Aに2.00入力済） // ← 変更
- [x] **フェーズ3**: 初期データ移行 ← commit 6e6ca2c（調査完了・移行方針(C)手動Excel化に決定）
  - [x] QBO構造調査スクリプト（`scripts/inspect-qbo-structure.js`）作成・実行済
  - [x] PriceLevel/PriceRule API は非公開と判明
  - [ ] **残作業**: Custom Prices シートに**手動入力**（**≈55レコード**：Individual 9社 ×5 + Group B + Group C） // ← 変更
- [x] **フェーズ4**: order-system / server.js 改修 ← commit ed9fe34
  - [x] routes/sheets-client.js 作成
  - [x] routes/pricing.js 作成（純粋関数で Standard / Group A×1.020 / Individual を分岐）
  - [x] server.js の価格決定ロジック改修（dry-run対応・PrivateNote・SKUバッチ取得）
  - [x] **5分類対応改修**（`getCustomLookupKey` 追加・Group B/C は `GROUP_B`/`GROUP_C` 疑似IDで Custom Prices検索） // ← 変更
  - [x] **箱単価/Custom Price/IDパース修正**（2026-05-19・commit 3f5f971/9936d6e/a0a2ee3）：K列・E列の通貨表示文字列を parsePrice で数値化、Customer IDをテキスト保存 // ← 変更
  - [x] **dry-run動作確認**（2026-05-19完了・`scripts/dry-run-pricing.js`・全分類正常・箱売り$0バグ解消を実データで検証） // ← 変更
- [ ] **フェーズ5**: 本番移植 + テスト + 段階的展開
  - [ ] 本番環境への移植
  - [ ] 自社（MY Inc.）顧客テスト
  - [ ] 先行顧客1〜2社テスト
  - [ ] Group B / Group C / Individual 全展開 // ← 変更
  - [ ] 全顧客展開
- [ ] **Choco解約**（プロジェクト完了条件）

---

## 🔑 重要な情報

### スプレッドシートID

| ブック | 本番ID | 開発用ID |
|---|---|---|
| Cost list | `1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k` | （要記入）|
| Item List | `14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc` | （要記入）|
| Client Information | `1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8` | （要記入）|
| order-system record | `1Qi7IuVjksPQa3wv_YIid_UCHaHYmmmyBH3oT8BJKLIk` | （要記入）|

### Git ブランチ

- 本番：`main`
- 開発：`feature/custom-prices`

### アラート送信先

- `ordercfp@gmail.com`

---

## 💬 コミュニケーションスタイル

- 言語：日本語
- 文体：です・ます調
- 見出し＋箇条書きで整理
- 数値・期限・条件は **太字** で強調
- 選択肢形式での確認を多用
- 既存コードを変更する前は必ず Manabu さんに確認

---

## 🚦 困ったときは

- 不明点 → 選択肢形式で質問
- エラー3回ループ → /clear 推奨
- 設計上の判断が必要 → 必ず確認してから進む
- 既存コード変更が必要 → 必ず Manabu さんに連絡
