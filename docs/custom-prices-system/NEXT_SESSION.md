# 次のセッションへの引き継ぎ書

**作成日**：2026-05-15
**前セッションの最終コミット**：`1fb79f0 docs: add Manabu manual work procedures for Custom Prices System Phase 5`
**作業ブランチ**：`feature/custom-prices`
**作業worktree**：`C:\Users\calif\meat-order-system\.claude\worktrees\wonderful-vaughan-1d8c61`

---

## 📌 最初にやること（順番厳守）

### 1. コンテキスト復元（並列で3ファイル読む）
- メモリ `MEMORY.md`
- メモリ `project_custom_prices_system.md`
- `docs/custom-prices-system/CLAUDE.md`

### 2. 現状確認
- `git log --oneline -5` で最新コミットが `1fb79f0` であることを確認
- `git status` で作業ツリーがクリーンであることを確認

### 3. Manabuさんに進捗を聞く

以下のように聞いてください：

> 「Manabuさん、Custom Prices System の手作業の進捗を教えてください。手順書1〜3のどこまで進みましたか？」

---

## 🌳 Manabuさんの回答別アクション

### パターンA：「まだ着手していない」
→ 手順書1（`docs/custom-prices-system/手順書/01-setup-price-group.md`）から開始を案内
→ 「事前チェック」セクションを読み上げて伴走

### パターンB：「手順書1完了 / 手順書2を進行中 or 完了」
→ Manabuさんに **Individual 15社のリスト**（Customer ID + 顧客名）を聞く
→ 手順書3に進む準備：Cost list 側 Apps Script の **デプロイ状況** を確認
→ 未デプロイなら「手順書0：Cost list Apps Script デプロイ手順書」を新規作成して伴走

### パターンC：「手順書1〜3すべて完了」 ← 本命の進行
→ **dry-run動作確認**に進む（フェーズ5前半）
→ 手順：
  1. ローカルで `order-system` を起動：
     ```bash
     cd C:\Users\calif\meat-order-system
     # .env.development の QBO_MODE=dry-run を確認
     node server.js
     ```
  2. ブラウザでフォームを開いて、Individual顧客の注文を送信
  3. ログの `[Pricing]` セクションと `PrivateNote` を確認：
     - 価格ソース内訳が `custom` / `group-a` / `standard` / `fallback` で分解されているか
     - 量り売り/箱売りの単位選択が正しいか
  4. Standard / Group A 顧客でも同様に確認
  5. 結果を Manabuさんに報告

→ 詳細な検証項目は `docs/custom-prices-system/06-testing.md` 参照

### パターンD：「途中で詰まった」
→ 該当する手順書のステップ番号を聞く
→ その手順書の「困ったときは」セクションを参照
→ それでも解決しない場合、エラーメッセージや状況を詳しく聞いてトラブルシュート

---

## ⚠ 絶対に守るルール

| ルール | 理由 |
|---|---|
| **本番スプレッドシートに触らない** | データ破壊リスク。本番ID（`1CG07N6t...` / `14dKo33u...` / `1dC88enQ...` / `1Qi7IuVj...`）は touch 厳禁 |
| **`QBO_MODE=dry-run` を維持** | 本番QBOに誤送信防止 |
| **既存スクリプトのロジック変更禁止** | 動いている機能を壊さない。**追加のみOK** |
| **手順は1ステップずつ** | 動作確認しながら進める。完了確認後に次へ |
| **コードは完全版で提供** | 部分的な差分にしない、変更箇所に `// ← 変更` |
| **不明点は選択肢形式で確認** | 勝手に判断しない |

---

## 📁 重要なファイル位置

```
C:\Users\calif\meat-order-system\.claude\worktrees\wonderful-vaughan-1d8c61\
├── CLAUDE.md                          ← ルート（現在の作業セクション）
├── server.js                          ← Phase 4 で改修済み
├── routes/
│   ├── pricing.js                     ← Phase 4 で新規作成（純粋関数）
│   └── sheets-client.js               ← Phase 4 で新規作成（並列取得）
├── apps-script/
│   ├── client-info-dev/setup_price_group.js   ← Phase 2 で作成
│   └── cost-list-dev/                          ← Phase 1 で作成（フォーム本体）
├── docs/custom-prices-system/
│   ├── CLAUDE.md                      ← フェーズ進捗チェックリストの正本
│   ├── README.md                      ← 設計ドキュメント索引
│   ├── 01-architecture.md ～ 07-rules.md  ← 設計ドキュメント
│   ├── NEXT_SESSION.md                ← この文書
│   └── 手順書/                          ← Manabu向け手順書
│       ├── README.md
│       ├── 01-setup-price-group.md
│       ├── 02-classify-clients.md
│       └── 03-input-custom-prices.md
└── scripts/
    └── inspect-qbo-structure.js       ← Phase 3 調査スクリプト
```

---

## 🎯 前セッションでの設計判断（重要）

### 入力方式は「価格管理」メニュー経由を採用
- **採用**：Cost list の Apps Script フォーム経由（1件ずつ）
- **不採用**：CSV一括インポート
- **理由**：
  - Custom Price Log に自動記録される
  - 重複チェックが効く
  - Customer / SKU プルダウンで誤入力を防げる
  - フォーム動作の事前テストになる

### 手順書3で「Apps Script デプロイ済み」を前提とした
- Cost list の Apps Script は `apps-script/cost-list-dev/` に**コードはコミット済み**だが、**開発用 Cost list へのデプロイは Manabuさんが手動で行う必要がある**
- 手順書3の事前準備セクションで「価格管理メニューが見えるか」をチェックする設計
- 未デプロイの場合は、別途「手順書0：デプロイ手順書」を作成する想定

---

## 📊 進捗マップ

```
[完了] Phase 0: 環境セットアップ
[完了] Phase 1: Cost list Apps Script実装（コード）
[完了] Phase 2: Client list W/X列スクリプト実装（コード）
[完了] Phase 3: QBO構造調査・移行方針(C)決定
[完了] Phase 4: order-system価格決定ロジック実装
[完了] Phase 5前半: Manabu向け手順書作成 ← 前セッションでここまで
[次へ] Phase 5中盤: Manabu手作業実施 → dry-run動作確認
[未着] Phase 5後半: 本番移植 → 段階的展開
[未着] Choco解約（プロジェクト完了条件）
```

---

## 💡 困ったら確認する場所

| 知りたいこと | 参照先 |
|---|---|
| 全体設計 | `docs/custom-prices-system/01-architecture.md` |
| データ構造 | `docs/custom-prices-system/02-data-structures.md` |
| 価格ロジック詳細 | `docs/custom-prices-system/04-server-changes.md` |
| テスト項目 | `docs/custom-prices-system/06-testing.md` |
| 厳守ルール | `docs/custom-prices-system/07-rules.md` |
| 過去の決定事項 | メモリ `project_custom_prices_system.md` + `project_qbo_price_rules.md` |
