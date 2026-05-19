# 次のセッションへの引き継ぎ書（5分類版）

**作成日**：2026-05-19（手順書1/2完了＋Cost listデプロイ完了で改訂） // ← 変更
**前セッションの最終コミット**：手順書修正＋進捗反映を本セッション末でコミット予定 // ← 変更
**作業ブランチ**：`feature/custom-prices`
**作業worktree**：`C:\Users\calif\meat-order-system\.claude\worktrees\wonderful-vaughan-1d8c61`

---

## 🚀 2026-05-19 時点：次は手順書3（Custom Prices 入力）から // ← 変更

すでに完了済み：
- ✅ 手順書1（5択版で再実行・W列プルダウン5択化済み）
- ✅ 手順書2（95社分類入力済：Group A=12 / B=6 / C=4 / Individual=9 / Standard=64）
- ✅ Cost list Apps Script デプロイ（5分類対応・フォーム動作確認済：Group B/C + Individual 9社=11項目表示）

**次セッションでは「パターンE：手順書3から開始」で進める**（下記参照）。

---

## 🆕 2026-05-15 重要な設計変更：顧客分類を 5分類に拡張

| 分類 | 該当社数 | 価格決定 | Custom Prices |
|---|---|---|---|
| Standard | 約30社 | Item List 価格そのまま | 使わない |
| Group A | **12社** | Item List × 1.020（+2.00%） | 使わない |
| Group B | **6社** | Daikoku 6社共通カスタム価格 | 疑似ID `GROUP_B` で検索 |
| Group C | **4社** | Manpuku 4社共通カスタム価格 | 疑似ID `GROUP_C` で検索 |
| Individual | **9社** | 各社個別カスタム価格 | Customer ID で検索 |

**いずれも Custom Price が見つからない場合は Standard 価格にフォールバック**

---

## 📌 最初にやること（順番厳守）

### 1. コンテキスト復元（並列で3ファイル読む）
- メモリ `MEMORY.md`
- メモリ `project_custom_prices_system.md`
- `docs/custom-prices-system/CLAUDE.md`

### 2. 現状確認
- `git log --oneline -5` で最新コミットを確認（5分類対応がコミット済みか）
- `git status` で未コミット変更を確認
- 5分類対応の主要変更ファイル：
  - `apps-script/client-info-dev/setup_price_group.js` （`PG_VALID_GROUPS` を5択に拡張）
  - `apps-script/cost-list-dev/custom_prices_form_main.js` （`getCustomPriceTargets` 追加・`addCustomPrice` Group B/C 対応）
  - `apps-script/cost-list-dev/custom_prices_form.html` （Add モードで `getCustomPriceTargets` 呼び出し）
  - `routes/pricing.js` （`getCustomLookupKey` 共通化・5分岐対応）
  - `docs/custom-prices-system/` 配下のドキュメント類

### 3. Manabuさんに進捗を聞く

以下のように聞いてください：

> 「Manabuさん、Custom Prices System の手作業の進捗を教えてください。
>   手順書1〜3（5分類版）のどこまで進みましたか？
>   - 手順書1（5択プルダウン版の setup_price_group.js を**再実行**）
>   - 手順書2（5分類で顧客分類入力）
>   - 手順書3（Custom Prices 約55レコード入力）」

---

## 🌳 Manabuさんの回答別アクション

### パターンA：「まだ着手していない」
→ 手順書1（`docs/custom-prices-system/手順書/01-setup-price-group.md`）から開始を案内
→ 「事前チェック」セクションを読み上げて伴走

### パターンB：「手順書1完了（3択版のみ）」← 2026-05-15時点で多くがここ
→ **再実行が必要**：最新の `setup_price_group.js`（5択版）をデプロイ・再実行してプルダウンを拡張
→ その後、手順書2へ

### パターンC：「手順書1完了（5択版）」
→ Manabuさんに **5分類リスト**（Customer ID + 顧客名）を聞く
  - Group A 12社（Jinya Group）
  - Group B 6社（Daikoku Group）
  - Group C 4社（Manpuku）
  - Individual 9社
→ 手順書2へ

### パターンD：「手順書2まで完了」
→ Manabuさんに 5分類の社数チェック結果を確認（Group A=12 / Group B=6 / Group C=4 / Individual=9）
→ Cost list 側 Apps Script の **5分類対応版デプロイ状況** を確認
  - フォームの顧客プルダウンに `🔷 Group B (Daikoku - 6社共通)` と `🔶 Group C (Manpuku - 4社共通)` が表示されるか
  - 未対応なら「手順書0：Cost list Apps Script デプロイ手順書」を新規作成して伴走
→ 手順書3へ

### パターンE：「手順書1〜3すべて完了」 ← 本命の進行
→ **dry-run動作確認**に進む（フェーズ5前半）
→ 手順：
  1. ローカルで `order-system` を起動：
     ```bash
     cd C:\Users\calif\meat-order-system
     # .env.development の QBO_MODE=dry-run を確認
     node server.js
     ```
  2. ブラウザでフォームを開いて、各分類の顧客から注文を送信
  3. ログの `[Pricing]` セクションと `PrivateNote` を確認：
     - 価格ソース内訳が `custom` / `group-a` / `standard` / `fallback` で分解されているか
     - **Group B 顧客 → ソース `custom` で `GROUP_B` から取得しているか**
     - **Group C 顧客 → ソース `custom` で `GROUP_C` から取得しているか**
     - 量り売り/箱売りの単位選択が正しいか
  4. Standard / Group A 顧客でも同様に確認
  5. 結果を Manabuさんに報告

→ 詳細な検証項目は `docs/custom-prices-system/06-testing.md` と `04-server-changes.md` の「10. テスト項目」参照

### パターンF：「途中で詰まった」
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

## 📁 重要なファイル位置（5分類対応版）

```
C:\Users\calif\meat-order-system\.claude\worktrees\wonderful-vaughan-1d8c61\
├── CLAUDE.md                          ← ルート（現在の作業セクション）
├── server.js                          ← Phase 4 で改修済み
├── routes/
│   ├── pricing.js                     ← 5分類対応：getCustomLookupKey、Group B/C 分岐
│   └── sheets-client.js               ← Phase 4 で作成（変更なし、normalizeId が GROUP_B/C もパス）
├── apps-script/
│   ├── client-info-dev/setup_price_group.js   ← 5分類対応：PG_VALID_GROUPS が5択
│   └── cost-list-dev/                          ← 5分類対応：
│       ├── custom_prices_form_main.js          ←   getCustomPriceTargets 新規追加
│       │                                       ←   addCustomPrice が GROUP_B/C 疑似ID対応
│       └── custom_prices_form.html             ←   Add モードで getCustomPriceTargets 呼び出し
├── docs/custom-prices-system/
│   ├── CLAUDE.md                      ← フェーズ進捗チェックリストの正本（5分類対応）
│   ├── README.md                      ← 設計ドキュメント索引
│   ├── 01-architecture.md             ← 5分類対応の注記あり
│   ├── 02-data-structures.md          ← 5分類対応の注記あり（W列5択・Custom Prices 疑似ID）
│   ├── 04-server-changes.md           ← 5分類対応の注記あり
│   ├── 07-rules.md                    ← 5分類対応の注記あり
│   ├── NEXT_SESSION.md                ← この文書
│   └── 手順書/                          ← Manabu向け手順書（すべて5分類版）
│       ├── README.md
│       ├── 01-setup-price-group.md
│       ├── 02-classify-clients.md     ← 5ステップ（Group A/B/C/Individual/Standard）
│       └── 03-input-custom-prices.md  ← 約55レコード（GROUP_B + GROUP_C + Individual 9社）
└── scripts/
    └── inspect-qbo-structure.js       ← Phase 3 調査スクリプト
```

---

## 🎯 設計判断（重要）

### Group B/C の共有価格は「疑似Customer ID」方式で実装
- **採用**：Custom Prices シートの Customer ID 列に `GROUP_B` / `GROUP_C` を入れる
- **不採用**：Key Type 列を新規追加する案
- **理由**：シート構造を変更せず、`routes/pricing.js` 側で `getCustomLookupKey` ヘルパーを追加するだけで実装可能。`normalizeId` は数字のないIDをそのまま返す仕様なので疑似IDも保持される

### Group B = Daikoku 6社 / Group C = Manpuku 4社 / Individual = 9社
- 2026-05-15、Manabuさんから報告された分類
- 旧計画では「Individual 15社」だったが、実際には Daikoku 6社・Manpuku 4社が**共通価格**を使うため Group B/C に分離
- **前提**：Daikoku 6社で同じ価格 / Manpuku 4社で同じ価格。崩れたら設計再検討が必要

---

## 📊 進捗マップ（5分類版）

```
[完了] Phase 0: 環境セットアップ
[完了] Phase 1: Cost list Apps Script実装 + 5分類対応改修
[完了] Phase 2: Client list W/X列スクリプト実装 + 5択プルダウン拡張
[完了] Phase 3: QBO構造調査・移行方針(C)決定
[完了] Phase 4: order-system価格決定ロジック実装 + 5分類対応改修
[完了] Phase 5前半: Manabu向け手順書作成（5分類版に書き換え完了）
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
| 価格ロジック詳細 | `docs/custom-prices-system/04-server-changes.md` + `routes/pricing.js`（実装が正本） |
| テスト項目 | `docs/custom-prices-system/06-testing.md` + `04-server-changes.md` 「10. テスト項目」 |
| 厳守ルール | `docs/custom-prices-system/07-rules.md` |
| 過去の決定事項 | メモリ `project_custom_prices_system.md` + `project_qbo_price_rules.md` |
