# 02. データ構造定義

このファイルでは、新規作成するシート3つと、既存シートへの列追加の詳細を定義します。

**実装に着手する前に、必ずこのファイル全体を読んでください。**

---

## 1. 新規シート一覧

このプロジェクトで新規作成するシートは3つです。**すべて Cost list 内**に作成します。

| シート名 | 場所 | 役割 |
|---|---|---|
| **Custom Prices** | Cost list | Individual顧客×SKUの個別単価マスター |
| **Custom Price Log** | Cost list | 追加・変更・削除の履歴ログ |
| **Cost Reference** | Cost list | 各ベンダータブのEach Cost集計（フォーム参照用）|

すべて **Cost list 内に作成する理由**：

- Cost Reference の参照元（ベンダータブのG列）が Cost list 内にある
- 「価格管理」メニューと同じブック内にある方が Apps Script の実装がシンプル
- データの整合性管理がしやすい

---

## 2. Custom Prices シート

### 2-1. 役割

Individual分類の顧客に対して設定された個別単価を管理するマスターシートです。

### 2-2. 列構造

| 列 | ヘッダー | 型 | 必須 | 説明 |
|---|---|---|---|---|
| A | Customer ID | Text | ✅ | 3桁ゼロ埋め（例：011, 035, 088）|
| B | Customer Name | Text | ✅ | 顧客名（参照用・表示用）|
| C | SKU | Text | ✅ | 商品コード（例：B033, P012）|
| D | Item Name | Text | ✅ | 商品名（参照用・表示用）|
| E | Custom Price | Number | ✅ | 個別単価（USD、小数点以下2桁）|
| F | Update Date | Date | ✅ | 最終更新日（自動入力、形式：M/d/yyyy）|
| G | Note | Text | 任意 | メモ（例：「2026年5月見直し」「価格交渉時に合意」）|

### 2-3. 重要なルール

1. **複合キー：Customer ID + SKU の組み合わせはユニーク**
   - 同じ顧客に同じSKUで複数行は作らない
   - 重複追加時はエラーで防ぐ

2. **Customer ID は 3桁ゼロ埋め**
   - 例：`11` ではなく `011`
   - `normalizeId_()` 相当の関数で正規化する

3. **Custom Price は固定の数値**
   - 数式は使わない（Cost listの将来変更に影響されないため）
   - 例：`=14.50` ではなく `14.50`

4. **Custom Price の単位**
   - **量り売り商品**（Item List I列チェックなし）→ **ポンド単価**（Item List J列と同じ単位）
   - **定量売り商品**（Item List I列チェックあり）→ **箱単価**（Item List K列と同じ単位）

5. **Update Date の自動入力**
   - フォームで追加・変更したときに自動で本日の日付を入れる
   - 形式：`M/d/yyyy`（例：5/13/2026）

### 2-4. 例データ

| Customer ID | Customer Name | SKU | Item Name | Custom Price | Update Date | Note |
|---|---|---|---|---|---|---|
| 011 | BENI HOLLYWOOD | B033 | Beef Short Rib | 22.50 | 5/13/2026 | 初期移行 |
| 011 | BENI HOLLYWOOD | C037 | Drumsticks | 18.00 | 5/13/2026 | 初期移行 |
| 035 | KUSHIYAKI BAR | B008 | Beef Ribeye 10oz | 14.20 | 5/13/2026 | 初期移行 |

### 2-5. ヘッダー書式

- 1行目：ヘッダー行（フリーズ）
- 背景色：`#4a86e8`（青）
- 文字色：`#ffffff`（白）
- 太字：あり

---

## 3. Custom Price Log シート

### 3-1. 役割

Custom Prices シートに対する**追加・変更・削除の履歴**をすべて記録します。

「いつ・誰が・何を・どう変更したか」が後から振り返れるようにします。

### 3-2. 列構造

| 列 | ヘッダー | 型 | 必須 | 説明 |
|---|---|---|---|---|
| A | Timestamp | DateTime | ✅ | 自動入力（形式：yyyy/MM/dd HH:mm:ss）|
| B | Action | Text | ✅ | `Add` / `Change` / `Delete` のいずれか |
| C | Customer ID | Text | ✅ | 3桁ゼロ埋め |
| D | Customer Name | Text | ✅ | 顧客名（記録時点）|
| E | SKU | Text | ✅ | 商品コード |
| F | Item Name | Text | ✅ | 商品名（記録時点）|
| G | Price Before | Number | 条件付き | 変更前の価格（Addは空欄）|
| H | Price After | Number | 条件付き | 変更後の価格（Deleteは空欄）|
| I | Note | Text | 任意 | メモ（操作時にフォームで入力された値）|

### 3-3. Action ごとの記録パターン

| Action | G列（Before）| H列（After）| 例 |
|---|---|---|---|
| **Add** | 空欄 | 新規価格 | （空）→ $22.50 |
| **Change** | 変更前の価格 | 変更後の価格 | $22.50 → $21.00 |
| **Delete** | 削除前の価格 | 空欄 | $22.50 →（空）|

### 3-4. 例データ

| Timestamp | Action | Customer ID | Customer Name | SKU | Item Name | Price Before | Price After | Note |
|---|---|---|---|---|---|---|---|---|
| 2026/05/13 10:30:15 | Add | 011 | BENI HOLLYWOOD | B033 | Beef Short Rib | | 22.50 | 初期移行 |
| 2026/05/15 14:22:08 | Change | 011 | BENI HOLLYWOOD | B033 | Beef Short Rib | 22.50 | 21.00 | 値下げ交渉後 |
| 2026/06/01 09:15:42 | Delete | 011 | BENI HOLLYWOOD | C037 | Drumsticks | 18.00 | | 顧客要望でStandardに戻す |

### 3-5. ヘッダー書式

- 1行目：ヘッダー行（フリーズ）
- 背景色：`#666666`（グレー）
- 文字色：`#ffffff`（白）
- 太字：あり

### 3-6. 重要なルール

1. **ログは追記のみ**：既存の行を編集・削除してはいけない
2. **Timestamp は Apps Script で自動入力**：手動入力させない
3. **Customer Name / Item Name は記録時点の値**：将来名前が変わっても、過去ログは当時の名前のまま

---

## 4. Cost Reference シート

### 4-1. 役割

各ベンダータブの **G列（Each cost）** を SKU ごとに集計し、フォームから素早く参照できる単一のシートを提供します。

`Preferred Price` シートの「コスト版」のような位置づけです。

### 4-2. 列構造

| 列 | ヘッダー | 型 | 必須 | 説明 |
|---|---|---|---|---|
| A | SKU | Text | ✅ | 商品コード |
| B | Each Cost | Number | ✅ | 1個あたりコスト（ベンダータブG列）|
| C | LBS Cost | Number | 任意 | ポンドあたりコスト（ベンダータブF列・参考用）|
| D | Vendor | Text | ✅ | コストの取得元ベンダータブ名 |
| E | Update Date | Date | ✅ | ベンダータブH列の最新日付 |

### 4-3. データ生成ルール

`Preferred Price` シートと同じロジックで生成します：

```
全ベンダータブをスキャン
  ↓
各SKUごとに「最新の更新日（H列）」を持つ行を採用
  ↓
G列（Each Cost）、F列（LBS Cost）、H列（日付）を抽出
  ↓
Cost Reference シートにSKU昇順で書き込み
```

**重要：** Each Cost = 0 や空欄の行は **スキップ**（無効データとして扱う）。

### 4-4. 例データ

| SKU | Each Cost | LBS Cost | Vendor | Update Date |
|---|---|---|---|---|
| B008 | 10.38 | 16.60 | West Cattle | 4/28/2026 |
| B016 | 10.29 | 10.29 | West Cattle | 5/1/2026 |
| B017 | 12.86 | 12.86 | West Cattle | 5/6/2026 |
| C001 | 23.60 | 0.59 | T & T Foods | 4/22/2026 |

### 4-5. 更新タイミング

| トリガー | 動作 |
|---|---|
| **手動メニュー：「価格管理 → Cost Reference を更新」** | 即座に全SKU再集計 |
| **フォーム起動時** | フォームを開く前に自動で再集計（最新コストを表示するため）|
| **自動実行（オプション）** | 毎日深夜2時に再集計するトリガー（任意設定）|

### 4-6. ヘッダー書式

- 1行目：ヘッダー行（フリーズ）
- 背景色：`#34a853`（緑）
- 文字色：`#ffffff`（白）
- 太字：あり

### 4-7. 除外シート

Cost Reference を生成する際、以下のシートはスキャン対象から除外します：

```javascript
const COST_REF_EXCLUDE = new Set([
  'ORIGINAL', '商品一覧', 'Script Manual', 'VendorLog',
  'weekly list', 'Recipients', 'Recipients Price',
  'Preferred Price', '仕様書/Manual', 'Summary',
  'Cost list', 'cost list', 'Master', 'Templates',
  'Discontinued', 'VENDOR TEMPLATE',
  // 新規シートも除外
  'Custom Prices', 'Custom Price Log', 'Cost Reference'
]);
```

→ 既存の `EXCLUDE_SHEETS` と同じ内容に、新規シート3つを追加した形。

---

## 5. Client list（既存）への列追加

### 5-1. 改修対象

| 項目 | 値 |
|---|---|
| ブック名 | Client Information |
| シート名 | `Client list` |
| Spreadsheet ID（本番）| `1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8` |

### 5-2. 追加する列

既存の列（A〜V）の右側に2列追加します。

| 列 | ヘッダー | 型 | 必須 | 説明 |
|---|---|---|---|---|
| **W** | Price Group | Text | ✅ | `Standard` / `Group A` / `Individual` のいずれか |
| **X** | Markup % | Number | 条件付き | Group Aの場合：`1.5`、それ以外は空欄 |

> **注：** 仕様書初版では X・Y列とされていたが、実際の Client list は V列まで使用しているため、空き列を作らないよう **W・X列** に変更（2026-05-14）。

### 5-3. Price Group の値

| 値 | 意味 | 該当顧客数 |
|---|---|---|
| **Standard** | 標準価格をそのまま適用 | 約35社 |
| **Group A** | スタンダード価格 + 1.5% | 10社 |
| **Individual** | Custom Prices を優先 | 15社 |

### 5-4. データ検証ルール

W列（Price Group）には、**データの入力規則（プルダウン）**を設定：

```
入力候補: Standard, Group A, Individual
他の値は拒否
```

### 5-5. X列（Markup %）の補足

- Group A の場合：`1.5` を入力（実際の計算では `1 + 1.5/100 = 1.015` を掛ける）
- それ以外：空欄
- **このX列は将来の拡張用**で、現状のロジックでは使わない（Group A = +1.5%固定）
- 将来「Group B = +3%」などを追加する際に活用

### 5-6. 既存データへの影響

- 既存の列（A〜V）には**一切手を加えない**
- 既存の関数（onEdit等）には影響を与えない
- 列追加のみなので、データ消失リスクなし

### 5-7. 初期データ投入方針

W列に値を入れる方法（推奨順）：

1. **Group A の10社を特定** → 該当行のW列に `Group A` を入力
2. **Individual の15社を特定** → 該当行のW列に `Individual` を入力
3. **残りすべて** → W列に `Standard` を一括入力

具体的な顧客リストは Manabu さんの判断で投入します。

---

## 6. Item List（既存）の参照仕様

Item List は**読み取り専用**で、新規列追加もありません。ただし、価格決定ロジックが正しく動作するために、以下の列を参照することを明示します。

### 6-1. 参照する列

| 列 | ヘッダー | 用途 |
|---|---|---|
| **A** | SKU | 商品コードマッチング |
| **D** | Item Name | 表示用 |
| **F** | Category | カテゴリ判定 |
| **I** | ✅ Unit? | 量り売り/定量売り判定（チェックボックス）|
| **J** | Price ($/lb) | 量り売り商品の単価 |
| **K** | Unit Price ($) | 定量売り商品の単価 |
| **S** | Stock | 在庫状況確認（任意）|

### 6-2. 価格決定における列の使い分け

```javascript
function getBasePrice(itemRow) {
  const isUnitSale = itemRow[8]; // I列: ✅ Unit? (true/false)
  if (isUnitSale === true) {
    return parseFloat(itemRow[10]); // K列: Unit Price ($)
  } else {
    return parseFloat(itemRow[9]);  // J列: Price ($/lb)
  }
}
```

詳細は **04-server-changes.md** 参照。

---

## 7. データ間の関係図

```
┌─────────────────────────────────────────────────────────────┐
│ [Client Information]                                        │
│   Client list                                               │
│   ├ A列: Customer ID                                       │
│   ├ ...                                                     │
│   └ W列: Price Group ★追加                                 │
│         (Standard / Group A / Individual)                  │
└─────────────────────────────────────────────────────────────┘
              ↓ Customer ID で結合
┌─────────────────────────────────────────────────────────────┐
│ [Cost list]                                                 │
│                                                             │
│   Custom Prices ★新規                                       │
│   ├ Customer ID, SKU で複合キー                            │
│   └ Individual顧客のみ・Custom Price を保持                │
│                                                             │
│   Custom Price Log ★新規                                    │
│   └ Custom Prices への全操作履歴                           │
│                                                             │
│   Cost Reference ★新規                                      │
│   └ 各SKUの最新コスト（フォーム参照用）                    │
│                                                             │
│   既存ベンダータブ群（触らない）                            │
│   └ G列: Each Cost（Cost Reference の元データ）            │
└─────────────────────────────────────────────────────────────┘
              ↓ SKU で結合
┌─────────────────────────────────────────────────────────────┐
│ [Item List]（商品一覧）                                     │
│   ├ A列: SKU                                               │
│   ├ I列: ✅ Unit? (量り売り/定量売り)                       │
│   ├ J列: Price ($/lb) - 量り売りの単価                    │
│   └ K列: Unit Price - 定量売りの単価                       │
└─────────────────────────────────────────────────────────────┘
              ↓ server.js が3つを参照して価格決定
┌─────────────────────────────────────────────────────────────┐
│ [QBO]                                                       │
│   └ インボイス自動作成（確定価格で）                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. シート作成時の優先順位

実装時に作成する順序：

1. **Cost Reference** を最初に作成
   - フォームから参照するため、フォーム作成前に必要
2. **Custom Prices** を次に作成
   - 本体のマスターシート
3. **Custom Price Log** を最後に作成
   - ログ用なので空のままでOK
4. **Client list の W列・X列追加**（フェーズ2で実施）
   - データ移行と並行して投入

詳細な作成手順は **03-cost-list-changes.md** 参照。

---

## 9. データ構造把握チェックリスト

このファイルを読み終わったら、以下を確認してください：

- [ ] 新規シートが3つ（Custom Prices / Custom Price Log / Cost Reference）あることを理解した
- [ ] Custom Prices の複合キーは Customer ID + SKU だと理解した
- [ ] Custom Price の単位は商品タイプによって異なる（J列 or K列の単位）と理解した
- [ ] Custom Price Log は追記のみで編集禁止だと理解した
- [ ] Cost Reference の元データはベンダータブの G列（Each cost）だと理解した
- [ ] Client list には W列（Price Group）・X列（Markup %）を追加することを理解した
- [ ] Item List は読み取り専用で、I列で量り売り/定量売りを判定すると理解した
- [ ] X列（Markup %）は将来拡張用で、現状は使わないと理解した

OKならば **03-cost-list-changes.md** に進んでください。
