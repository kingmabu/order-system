# 手順書2：Client list に Price Group を入力する（5分類版）

このドキュメントは、開発用 `Client list` シートの **W列（Price Group）** と **X列（Markup %）** に、全顧客の分類を入力するための作業手順書です。

- **想定所要時間**：**30〜60分**（顧客リストの突き合わせに時間がかかる）
- **前提**：手順書1（setup_price_group.js 実行・**5分類版**）が完了していること
- **対象スプレッドシート**：開発用 Client Information（ID: `1Jqmqs-FVmhXrG7GqPbh6bkvaRWHZXtAEHUsWkZV4f8o`）

> ⚠ **重要**：この手順書は**5分類版**です。`setup_price_group.js` が5択（Standard / Group A / Group B / Group C / Individual）の最新版になっている必要があります。古い版（3択）でセットアップ済みの場合は、まず Apps Script の最新版に置き換えて `setupPriceGroupColumns` を**再実行**してください（W列のプルダウン選択肢が拡張されます）。

---

## 0. 全体像

最終的にW列が以下のように埋まればOKです。

| 分類 | 該当社数 | W列の値 | X列の値 | 例 / 内訳 |
|---|---|---|---|---|
| **Group A** | **12社** | `Group A` | **`2.00`** | Jinya Group の各店舗（一律 +2.00%） |
| **Group B** | **6社** | `Group B` | （空欄） | Daikoku Group の各店舗（共通カスタム価格） |
| **Group C** | **4社** | `Group C` | （空欄） | Manpuku の各店舗（共通カスタム価格） |
| **Group D** | **5社** | `Group D` | （空欄） | Ramen Joint-Aikan の各店舗（共通カスタム価格） ← 2026-05-22追加 |
| **Individual** | **9社** | `Individual` | （空欄） | 各社個別カスタム価格 |
| **Standard** | 残り | `Standard` | （空欄） | 上記以外すべて |

**合計：12 + 6 + 4 + 5 + 9 + Standard = 全顧客数**

> 💡 **Group D（Ramen Joint-Aikan 5社）** は Group B/C と同じ「共通カスタム価格」方式です。W列に `Group D` を入力し、Custom Prices シートには疑似ID `GROUP_D` で1セットだけ価格を登録します（手順書3）。X列は空欄。

---

## ステップ1：QBO で 4分類の顧客リストを作る（15〜30分）

W列を埋める前に、**「どの顧客がどの分類か」を紙またはメモで確定**させます。

### 1-1. Group A（Jinya Group **12社**）の特定

Jinya Group の店舗は、QBO で **Fixed +2% の Pricing Rule** が設定されている顧客です。

**やること：**
1. メモ帳（または別のスプレッドシート）に「Group A」と書く
2. Jinya Group の店舗名を **12社**書き出す
3. それぞれの **Customer ID**（3桁ゼロ埋め、Client list の A列）を併記

**例：**
```
Group A (12社, Markup +2.00%)
  011 BENI HOLLYWOOD
  023 JINYA SANTA MONICA
  ...
  （計12社）
```

### 1-2. Group B（Daikoku Group **6社**）の特定

Daikoku Group の店舗を**6社**書き出します。

```
Group B (6社, 共通カスタム価格)
  ??? Daikoku XXX
  ???
  ...
  （計6社）
```

> 💡 Group B は、6社すべてに**同じカスタム価格**が適用されます。Custom Prices シートには「GROUP_B」という疑似Customer IDで**1セットだけ**価格を入れます（手順書3で実施）。

### 1-3. Group C（Manpuku **4社**）の特定

Manpuku の店舗を**4社**書き出します。

```
Group C (4社, 共通カスタム価格)
  ??? Manpuku XXX
  ???
  ...
  （計4社）
```

### 1-4. Individual（**9社**）の特定

QBO で **Per Item 価格（商品ごとの個別単価）** が設定されている顧客のうち、**Group B / Group C に属さない**ものが対象です。

```
Individual (9社, 各社個別カスタム価格)
  035 KUSHIYAKI BAR
  088 SUSHI X
  ...
  （計9社）
```

> ⚠ **Group B / Group C の店舗は Individual に入れない**でください。共通価格を持つグループはそれぞれの分類に入れます。

### チェックポイント

- [ ] Group A リスト：ちょうど **12社**
- [ ] Group B リスト：ちょうど **6社**
- [ ] Group C リスト：ちょうど **4社**
- [ ] Individual リスト：ちょうど **9社**
- [ ] 全リストに、各顧客の **Customer ID（3桁ゼロ埋め）** が書かれている
- [ ] **重複なし**（同じ顧客が複数の分類に入っていない）
- [ ] 合計 = **31社**（12 + 6 + 4 + 9）

---

## ステップ2：W列に Individual を入力（5分）

リストが固まったら、**Individual 9社を先に入力**します（社数が少なく、誤入力リスクが低いため）。

1. 開発用 Client list を開く
2. **A列（Customer ID）** で、リストの 9社のCustomer IDを順番に検索：
   - `Ctrl + F` で検索ダイアログを開く
   - Customer ID を入力（例：`035`）
   - **完全一致** にチェックを入れる（誤マッチ防止）
3. 該当行の **W列セル** をクリック → プルダウンから **`Individual`** を選択
4. 9社すべて完了するまで繰り返す

**チェックポイント：**
- [ ] W列に `Individual` が **ちょうど9個**ある
  - 確認方法：列のフィルター機能で `Individual` だけ絞り込み → 行数を数える

---

## ステップ3：W列に Group A を入力（5分）

1. Group A リストの Customer ID を1つずつ検索
2. 該当行の W列で **`Group A`** を選択
3. **同時に X列に `2.00` を入力**（Group A 専用の Markup 値）
4. 12社すべて完了するまで繰り返す

**チェックポイント：**
- [ ] W列に `Group A` が **ちょうど12個**ある
- [ ] その12行のX列がすべて **`2.00`** になっている

---

## ステップ4：W列に Group B を入力（3分）

1. Group B リストの Customer ID を1つずつ検索
2. 該当行の W列で **`Group B`** を選択
3. **X列は空欄のまま**（Group B は一律％なし）
4. 6社すべて完了するまで繰り返す

**チェックポイント：**
- [ ] W列に `Group B` が **ちょうど6個**ある
- [ ] その6行のX列はすべて**空欄**

---

## ステップ5：W列に Group C を入力（3分）

1. Group C リストの Customer ID を1つずつ検索
2. 該当行の W列で **`Group C`** を選択
3. **X列は空欄のまま**（Group C は一律％なし）
4. 4社すべて完了するまで繰り返す

**チェックポイント：**
- [ ] W列に `Group C` が **ちょうど4個**ある
- [ ] その4行のX列はすべて**空欄**

---

## ステップ6：残りの行に Standard を一括入力（2分）

ここまでで、**W列が空欄のままの行 = Standard 顧客**です。

### 方法A：フィルターで空欄を抽出して一括入力（推奨）

1. 1行目（ヘッダー）を選択 → **データ → フィルターを作成**
2. W列のフィルター▼ → **空白** だけにチェック → **OK**
3. 表示された全行のW列を範囲選択：
   - 一番上の空欄W列セルをクリック
   - `Ctrl + Shift + ↓` で末尾まで選択
4. `Standard` と入力 → `Ctrl + Enter`（**Enter ではなく Ctrl+Enter**）で**選択範囲一括入力**
5. フィルターを解除：**データ → フィルターを削除**

### 方法B：1セルずつ手動

1. 空欄のW列セルをひとつずつクリックして `Standard` を選択

> 💡 方法Aの **Ctrl + Enter** が便利です。一括入力できるショートカット。

**チェックポイント：**
- [ ] W列に空欄が**ひとつもない**
- [ ] W列の値は `Standard` / `Group A` / `Group B` / `Group C` / `Individual` の **5種類のみ**

---

## ステップ7：最終確認（5分）

### 7-1. 件数チェック

W列の各値の件数を確認します。

シート末尾の使っていないセル（例：Z1〜Z6）に以下の式を貼り付け：

| セル | 式 | 期待値 |
|---|---|---|
| Z1 | `=COUNTIF(W:W,"Standard")` | 約30（顧客数 - 31） |
| Z2 | `=COUNTIF(W:W,"Group A")` | **12** |
| Z3 | `=COUNTIF(W:W,"Group B")` | **6** |
| Z4 | `=COUNTIF(W:W,"Group C")` | **4** |
| Z5 | `=COUNTIF(W:W,"Individual")` | **9** |
| Z6 | `=COUNTA(W2:W1000)` | Z1+Z2+Z3+Z4+Z5（= 全顧客数） |

### 7-2. データ検証チェック

W列をクリックして、以下を確認：

- [ ] プルダウン▼が出る
- [ ] プルダウンの選択肢は `Standard` / `Group A` / `Group B` / `Group C` / `Individual` の**5つ**だけ
- [ ] 範囲外の値を入力するとエラーで弾かれる

### 7-3. X列チェック

- [ ] Group A の12行に `2.00` が入っている
- [ ] それ以外の行（Group B / Group C / Individual / Standard）は X列が**空欄**

### 7-4. 確認式を削除

Z1〜Z6 のチェック用式を削除します。

---

## ステップ8：完了報告（30秒）

すべてOKなら、Claude に以下を伝えてください：

> 「手順書2の顧客分類入力、完了しました。
>   Group A 12社 / Group B 6社 / Group C 4社 / Individual 9社 / Standard 〇社 です」

次は **手順書3（Custom Prices 入力）** に進みます。

> 💡 このとき以下を共有してもらえると、手順書3で参照しやすくなります：
> - **Individual 9社のリスト**（Customer ID + 顧客名）
> - **Group B 6社のリスト**（参考用 / Custom Prices シートには「GROUP_B」を使用）
> - **Group C 4社のリスト**（参考用 / Custom Prices シートには「GROUP_C」を使用）

---

## 困ったときは

### 各分類の社数が想定と異なる
- **Group A が12社にならない** → Jinya Group の店舗リスト再確認、QBO Fixed +2% 設定数と突合
- **Group B が6社にならない** → Daikoku Group 店舗リスト再確認
- **Group C が4社にならない** → Manpuku 店舗リスト再確認
- **Individual が9社にならない** → QBO Per Item Price Rule 数を再確認、Group B/C と重複していないか確認
- ズレた場合は Claude に報告して進めてください

### 同じ顧客が複数の分類に該当しそう
- **優先順位**：Individual > Group C > Group B > Group A > Standard（特殊なほど優先）
- ただしルールが曖昧な場合は Claude に確認してください

### W列のプルダウンが3択しか表示されない
- `setup_price_group.js` が**古い版（3択）**でセットアップ済みです。
- 最新版（5択：`PG_VALID_GROUPS = ['Standard', 'Group A', 'Group B', 'Group C', 'Individual']`）に置き換えて `setupPriceGroupColumns` を再実行してください。
- 既存のW列の値（Standard / Group A / Individual）はそのまま残ります。

### Customer ID を間違えて違う行に入れてしまった
- そのセルだけ Delete キーで空欄に戻して、正しい行に入れ直してください。
