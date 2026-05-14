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

## 📋 現在のフェーズ進捗

実装が進むごとに更新してください：

- [ ] **フェーズ0**: 開発環境セットアップ（スプレッドシートコピー・ブランチ作成）
- [ ] **フェーズ1**: Cost list Apps Script 改修
  - [ ] 既存4ファイルの除外リスト追加
  - [ ] cost_reference.gs 作成
  - [ ] custom_prices_form.gs 作成
  - [ ] custom_prices_form.html 作成
  - [ ] 動作確認（メニュー・フォーム・ログ）
- [ ] **フェーズ2**: Client list X列・Y列追加
- [ ] **フェーズ3**: 初期データ移行（QBO Price Levels → Custom Prices）
- [ ] **フェーズ4**: order-system / server.js 改修
  - [ ] routes/sheets-client.js 作成
  - [ ] routes/pricing.js 作成
  - [ ] server.js の価格決定ロジック改修
  - [ ] dry-run動作確認
- [ ] **フェーズ5**: 本番移植 + テスト + 段階的展開
  - [ ] 本番環境への移植
  - [ ] 自社（MY Inc.）顧客テスト
  - [ ] 先行顧客1〜2社テスト
  - [ ] Individual全15社展開
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
