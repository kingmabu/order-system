# 手順書3：Custom Prices 約55レコードを入力する（5分類版）

このドキュメントは、開発用 Cost list の **Custom Prices シート**に、Individual 9社 + Group B（Daikoku共通）+ Group C（Manpuku共通）の個別単価を**「価格管理」メニュー経由**で入力するための作業手順書です。

- **想定所要時間**：**1.5〜2時間**（1件あたり 1〜2分 × 約55件）
- **入力件数**：**約 55レコード**
  - **Individual 9社**：各社 約5アイテム = **約45レコード**
  - **Group B**（Daikoku共通）：約**5レコード**（疑似ID `GROUP_B` で1セット、6社で共有）
  - **Group C**（Manpuku共通）：約**5レコード**（疑似ID `GROUP_C` で1セット、4社で共有）
- **対象スプレッドシート**：開発用 Cost list（ID: `1NPCw-Bz0kokXEe2Tv2PcF9XkQsa1c5IqiGh3IIkWpV8`）

---

## 0. 事前準備チェック（5分）

以下が**すべてOK**になるまで、本作業は開始しないでください。

- [ ] **手順書1完了**：Client list の W/X列が追加されている（**5択プルダウン**）
- [ ] **手順書2完了**：Client list の W列に Group A 12社 / Group B 6社 / Group C 4社 / Individual 9社 が入力されている
- [ ] **Cost list 側 Apps Script デプロイ済み（5分類対応版）**：
  - 開発用 Cost list を開くと、メニューに **「価格管理」** が表示される
  - フォームの顧客プルダウンに `🔷 Group B (Daikoku - 6社共通)` と `🔶 Group C (Manpuku - 4社共通)` が表示される
  - もし表示されない場合 → 最新版（`getCustomPriceTargets` を持つ）に置き換えが必要。Claude に「Cost list の Apps Script デプロイ手順がほしい」と依頼してください
- [ ] **QBO Pricing Rules のスクリーンショット / 一覧**：Individual 9社、Daikoku 6社（共通価格）、Manpuku 4社（共通価格）の Per Item 価格情報が手元にある

---

## ステップ1：入力用の一覧表を準備する（30〜45分）

フォームに入力する前に、**QBO から3カテゴリの per-item 価格をすべて書き出した一覧表**を準備します。

### 1-1. 推奨フォーマット（Excelまたはメモ帳）

3カテゴリを1つの表に入れ、A列に「Customer ID または GROUP_B / GROUP_C」を入れます。

| Customer ID | Customer Name | SKU | Item Name | Custom Price | Note |
|---|---|---|---|---|---|
| GROUP_B | Group B (Daikoku 共通) | B033 | Beef Short Rib | 21.80 | 初期移行・Daikoku 6社共通 |
| GROUP_B | Group B (Daikoku 共通) | C037 | Drumsticks | 17.50 | 初期移行・Daikoku 6社共通 |
| GROUP_C | Group C (Manpuku 共通) | B008 | Beef Ribeye 10oz | 14.50 | 初期移行・Manpuku 4社共通 |
| 011 | XXX RESTAURANT | B033 | Beef Short Rib | 22.50 | 初期移行 |
| 035 | KUSHIYAKI BAR | B008 | Beef Ribeye 10oz | 14.20 | 初期移行 |
| ... | ... | ... | ... | ... | ... |

**作り方：**
1. QBO の Pricing Rules 一覧を開く
2. **Daikoku 6社**を確認 → 6社で**同じ価格**であることを確認 → **1セットだけ**書き出す（A列に `GROUP_B`）
3. **Manpuku 4社**を確認 → 4社で**同じ価格**であることを確認 → **1セットだけ**書き出す（A列に `GROUP_C`）
4. **Individual 9社**を確認 → 各社の Per Item 価格を書き出す（A列に 3桁ゼロ埋め）
5. Customer ID は **3桁ゼロ埋め**（例：`11` ではなく `011`）

> ⚠ **Group B / Group C の前提が崩れていたら報告**：QBOで Daikoku 6社の価格が一致しなかった、または Manpuku 4社の価格が一致しなかった場合、設計が変わります。**入力を始める前に Claude に報告してください**。

### 1-2. 単位の確認

各 SKU の **量り売り/定量売り** を Item List（開発用ID: `1dIiwCvK8DRXiRX9jGcaKmlc_x6QxsVmS_0dGpukjXAY`）で確認します。

| Item List I列 | 価格の単位 |
|---|---|
| ☐（チェックなし） | **ポンド単価**（$/lb） |
| ☑（チェック済み） | **箱単価**（$/unit） |

> ⚠ QBOで設定されている価格が「ポンド単価」か「箱単価」か、必ず確認してください。**間違えると価格が桁違いになります。**

### チェックポイント

- [ ] 一覧表に**約55行**ある
- [ ] Group B 行は `GROUP_B`、Group C 行は `GROUP_C`、Individual 行は **3桁ゼロ埋めCustomer ID**
- [ ] SKU がすべて記入されている
- [ ] Custom Price がすべて**正の数値**（0や空欄なし）
- [ ] 単位を確認済み（ポンド単価 / 箱単価）

---

## ステップ2：開発用 Cost list を開いて「価格管理」メニューを起動（1分）

1. ブラウザで開発用 Cost list を開く：
   ```
   https://docs.google.com/spreadsheets/d/1NPCw-Bz0kokXEe2Tv2PcF9XkQsa1c5IqiGh3IIkWpV8/edit
   ```
2. メニューに **「価格管理」** があることを確認
3. **価格管理 → 個別価格を追加** をクリック

> 💡 初回起動時は「Custom Prices シート」「Custom Price Log シート」「Cost Reference シート」が**自動作成**されます。

**チェックポイント：**
- [ ] フォーム（モーダルダイアログ）が開いた
- [ ] タイトル：`価格管理 - Add`
- [ ] Customer のプルダウンの**先頭付近**に：
  - **🔷 Group B (Daikoku - 6社共通)** が表示される
  - **🔶 Group C (Manpuku - 4社共通)** が表示される
- [ ] その下に **Individual 9社が表示される**（Standard / Group A の顧客は出ない）

> ⚠ Customer プルダウンに Group B/C が出ない場合：
> - Apps Script が古い版（`getCustomPriceTargets` を持たない）の可能性
> - 最新版をデプロイし直してから、ブラウザを**完全リロード**（`Ctrl + Shift + R`）して再起動

---

## ステップ3：Group B を入力する（10〜15分）

Daikoku 共通価格を、**疑似Customer ID `GROUP_B`** で**1セットだけ**入力します。

### 3-1. 1件目を試しに入力

1. **Customer**：プルダウンから **`🔷 Group B (Daikoku - 6社共通)`** を選択
2. **SKU**：プルダウンから商品を選択（例：`B033 - Beef Short Rib`）
3. **Custom Price**：数値を入力（例：`21.80`）
4. **Note**：`初期移行・Daikoku 6社共通` と入力
5. **追加** ボタンをクリック

### 3-2. 結果を確認

フォームに **「追加完了」** メッセージが出たら、Custom Prices シートを開いて確認：

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| GROUP_B | Group B (Daikoku - 6社共通) | B033 | Beef Short Rib | 21.8 | 5/15/2026 | 初期移行・Daikoku 6社共通 |

- [ ] A列：**`GROUP_B`**（3桁ゼロ埋めではなく**そのまま**）
- [ ] B列：**`Group B (Daikoku - 6社共通)`** が自動入力されている
- [ ] D列：商品名が自動入力されている
- [ ] F列：本日の日付が自動入力されている

### 3-3. 残りの Group B 行を入力

Group B のすべての SKU を同じ手順で入力します（約5レコード）。

**チェックポイント：**
- [ ] Custom Prices シートの A列に `GROUP_B` の行が**約5行**ある

---

## ステップ4：Group C を入力する（10〜15分）

Manpuku 共通価格を、**疑似Customer ID `GROUP_C`** で**1セットだけ**入力します。

手順は Group B と同じです：

1. **Customer**：プルダウンから **`🔶 Group C (Manpuku - 4社共通)`** を選択
2. SKU / Custom Price / Note を入力
3. **追加** で保存
4. すべての Group C 行を入力（約5レコード）

**チェックポイント：**
- [ ] Custom Prices シートの A列に `GROUP_C` の行が**約5行**ある

---

## ステップ5：Individual 9社を入力する（60〜90分）

Individual 各社の個別価格を入力します（約45レコード）。

### 5-1. 効率化のコツ

- **同じ顧客の複数SKUは続けて入力**：Customer ID は同じなので、SKUと価格だけ変えればよい
- **顧客順に並べて入力**：顧客切り替えが少なく済む
- **15件ごとに小休止**：集中力維持
- **5件ごとに Custom Prices シートで件数確認**：入力漏れ早期発見

### 5-2. 重複エラーが出た場合

「既に登録があります」エラーが出たら、**同じCustomer ID + SKU が既に入っている**ということです。

- **本当に重複している場合**：その行はスキップ
- **値を変えたい場合**：いったんフォームを閉じて **価格管理 → 個別価格を変更** で変更
- **入力ミスの場合**：Customer ID / SKU を確認して入れ直す

### 5-3. 入力途中で中断する場合

- フォームを閉じてOK（途中までの入力は Custom Prices シートに残っている）
- 再開時は「個別価格を追加」を再度起動

**チェックポイント：**
- [ ] Custom Prices シートの A列に **`GROUP_B` 以外・`GROUP_C` 以外・3桁ゼロ埋めのCustomer ID** の行が約45行ある
- [ ] Individual の Customer ID は**9種類**（ユニーク数）

---

## ステップ6：最終確認（10分）

### 6-1. 件数チェック

Custom Prices シートの末尾の空きセル（例：I1〜I4）に貼り付け：

| セル | 式 | 期待値 |
|---|---|---|
| I1 | `=COUNTA(A2:A1000)` | 約 **55**（合計件数） |
| I2 | `=COUNTIF(A:A,"GROUP_B")` | 約 **5**（Daikoku 共通） |
| I3 | `=COUNTIF(A:A,"GROUP_C")` | 約 **5**（Manpuku 共通） |
| I4 | `=COUNTA(UNIQUE(FILTER(A2:A1000,A2:A1000<>"GROUP_B",A2:A1000<>"GROUP_C")))` | **9**（Individual ユニーク社数） |

### 6-2. データ品質チェック

- [ ] **GROUP_B 行のA列**：すべて `GROUP_B`（大文字、アンダースコア）
- [ ] **GROUP_C 行のA列**：すべて `GROUP_C`
- [ ] **Individual 行のA列**：すべて **3桁ゼロ埋め**
- [ ] 全行で Custom Price が **正の数値**（0や空欄なし）
- [ ] 全行で Update Date が**日付として認識**されている（左寄せの文字列になっていない）
- [ ] 重複なし：A列 + C列の組み合わせがすべてユニーク

### 6-3. Custom Price Log の整合性

- [ ] Custom Price Log シートの行数 ≧ Custom Prices シートの行数（変更や削除があれば多くなる）
- [ ] すべての `Add` アクションが Custom Prices シートと一致

### 6-4. 確認式を削除

I1〜I4 のチェック式を削除します。

---

## ステップ7：完了報告（1分）

すべてOKなら、Claude に以下を伝えてください：

> 「手順書3の Custom Prices 入力完了しました。
>   GROUP_B 〇件 / GROUP_C 〇件 / Individual 9社 〇件 = 計〇件 を投入しました」

これで **手作業（手順書1〜3）はすべて完了**です。次は Claude が **dry-run でローカル動作確認**します。

---

## 困ったときは

### Customerプルダウンに Group B/C が出ない
- Apps Script が**古い版**（3分類版・`getCustomPriceTargets` なし）の可能性。
- 最新版（`custom_prices_form_main.js` の `getCustomPriceTargets` 関数あり）に置き換えてデプロイし直す必要があります。Claude に依頼してください。
- 置き換え後、ブラウザを**完全リロード**（`Ctrl + Shift + R`）。

### Customerプルダウンに Individual 顧客が出ない / 9社未満
- 手順書2の入力が反映されていない可能性。
- フォームを閉じて、ブラウザを完全リロード（`Ctrl + Shift + R`）してから再起動。
- それでも出ない場合は Client list の W列を再確認。

### 「既に登録があります」エラーが頻発する
- 一覧表に重複がある可能性。Excel上で Customer ID + SKU の重複チェックをしてください。
- `GROUP_B` 同士 / `GROUP_C` 同士の重複もチェック対象。

### Daikoku 6社の価格が一致しない / Manpuku 4社の価格が一致しない
- **設計の前提（共通価格）が崩れます**。入力を**いったん止めて**、Claude に報告してください。
- 共通価格にできない店舗は **Individual に再分類**する必要があるかもしれません。

### フォームが固まる / 反応しない
- ブラウザのモーダルダイアログを閉じて再起動。
- それでもダメなら **ブラウザを完全リロード**（`Ctrl + Shift + R`）。

### 入力した価格を間違えた
- **価格管理 → 個別価格を変更** から修正可能。
- 変更履歴は Custom Price Log に自動記録されます。

### 間違って違う顧客に入れてしまった
- **価格管理 → 個別価格を削除** で削除 → 再度追加。
- ログには削除と追加の両方が残ります（履歴として正常）。

### Customer Name の自動入力がおかしい
- フォームは Client list のB列を顧客名として参照しています。
- Group B/C 行は固定文字列（`Group B (Daikoku - 6社共通)` 等）が入ります（Client list は参照しない）。
- B列以外に顧客名がある場合は、Claude に「Cost list の `CL_COL_CUSTOMER_NAME` を調整してほしい」と依頼してください。
