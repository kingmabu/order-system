# 01. システムアーキテクチャと既存システム

このファイルでは、改修対象のシステム全体構成と、**Claude Codeが触ってはいけない既存スクリプト・データ**を明確にします。

**実装に着手する前に、必ずこのファイル全体を読んでください。**

---

## 1. システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│  [顧客] - QRコードをスキャン                                 │
│         ↓                                                   │
│  [QRコード注文フォーム] (public/scan.html)                  │
│         ↓                                                   │
│  [order-system / server.js] - Node.js / Express             │
│   ├ Item List から商品マスター・価格を取得                  │
│   ├ Client list から顧客情報・Price Group を取得            │
│   ├ Custom Prices から個別価格を取得（Individual のみ）    │
│   ├ 価格決定ロジックを実行                                  │
│   └ QBO にインボイス送信                                   │
│         ↓                                                   │
│  [QuickBooks Online] - インボイス自動作成                   │
│         ↓                                                   │
│  [order-system record] - 受注履歴記録                       │
└─────────────────────────────────────────────────────────────┘

参照先データソース：
┌─────────────────────────────────────────────────────────────┐
│  [Cost list] ← このプロジェクトで主に改修                   │
│   - 各ベンダータブ：F列(LBS Cost), G列(Each cost), M列(QB Price)│
│   - Preferred Price: 全SKUの販売価格を集計                 │
│   - 「価格同期」メニューで Item List へ送信                │
│                                                             │
│  [Item List]（商品一覧） ← 触らない                         │
│   - スタンダード価格の正本                                  │
│   - J列：Price ($/lb) - 量り売り商品の単価                 │
│   - K列：Unit Price - 定量売り商品の単価                   │
│   - I列：✅ Unit? - チェックで定量売り、空欄で量り売り       │
│                                                             │
│  [Client Information] ← W列・X列のみ追加                    │
│   - Client list シートに顧客マスター                        │
│   - W列：Price Group（追加）                               │
│   - X列：Markup %（追加）                                  │
│                                                             │
│  [Custom Prices] ← 新規（Cost list 内に作成）              │
│   - Individual顧客×SKUの個別単価                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 価格決定の流れ（核心ロジック）

注文1件を処理する際の価格決定フローです。**04-server-changes.md** で詳細実装する内容の概要を示します。

```
注文受信
  ↓
[Step 1] Customer ID から Price Group を取得
  → Client list の W列を参照
  → Standard / Group A / Individual のいずれか
  ↓
[Step 2] 商品ごとに、その商品の販売単位を判定
  → Item List の I列（✅ Unit?）を確認
  → チェックあり → 定量売り → ベース価格 = K列（Unit Price）
  → チェックなし → 量り売り → ベース価格 = J列（Price $/lb）
  ↓
[Step 3] Price Group ごとに最終価格を決定
  ├ Standard      → ベース価格そのまま
  ├ Group A       → ベース価格 × 1.015（小数点以下2桁で丸め）
  └ Individual    → Custom Prices を Customer ID + SKU で検索
                     ├ 見つかった → そのCustom Price
                     └ 見つからない → ベース価格にフォールバック
  ↓
[Step 4] 確定価格で QBO にインボイス送信
  - 量り売り商品：QTY = 注文数のまま送信（現場で実重量に修正）
  - 定量売り商品：QTY = 注文数のまま送信（修正なし）
```

---

## 3. データソースの優先順位

複数のデータソースを参照する際の優先順位：

| 優先度 | データソース | 内容 |
|---|---|---|
| 1 | **Custom Prices** | Individual顧客の個別単価（あれば最優先）|
| 2 | **Item List J列 or K列** | スタンダード価格（量り売り/定量売りで分岐）|
| 3 | **Group A の +1.5%** | ベース価格に乗算 |

**注意：** QBOの商品マスター（UnitPrice）は **使用しない**。
QBOとItem ListのM列は手動同期で、ズレが発生することがあるため、Item Listを正本とする。

---

## 4. 既存スクリプト一覧（Cost list）

Cost list の Apps Script は以下8ファイルで構成されています。**それぞれの役割と改修方針を明確に把握してください**。

### 4-1. `_main.gs` - 統合エントリポイント

**役割：**
- `onOpen()` で全メニューを登録
- `onEdit()` で全編集イベントを各ハンドラへ振り分け

**改修方針：**
- ✅ `onOpen()` の末尾に「価格管理」メニューを追加（既存メニューには触らない）
- ❌ 既存のメニュー定義・onEdit のハンドラ呼び出しは絶対に変更しない

### 4-2. `price_sync_test.gs` - ベンダー編集監視（旧 vendortools）

**役割：**
- ベンダータブの自動検出
- F/N列の編集監視 → H列に更新日を自動記録
- 5分監視トリガー
- **`EXCLUDE_SHEETS` の定義場所**（他のスクリプトから参照される）

**改修方針：**
- ✅ `EXCLUDE_SHEETS` に新規シート名3つを追加
  - `'Custom Prices'`
  - `'Custom Price Log'`
  - `'Cost Reference'`
- ❌ それ以外のロジック（`onVendorEdit`、`watchVendorPrices`、トリガー処理など）は絶対に変更しない

### 4-3. `vedor_formulas.gs` - 数式適用・品番自動生成

**役割：**
- 商品一覧の E列（カテゴリ選択）→ A列（品番自動生成）
- ベンダータブの G/I/J/K/L/N列に数式一括適用
- 新ベンダー用テンプレートタブ作成
- **`VF_EXCLUDE` の定義場所**

**改修方針：**
- ✅ `VF_EXCLUDE` に新規シート名3つを追加（`EXCLUDE_SHEETS` と同じ内容）
- ❌ それ以外のロジックは絶対に変更しない

### 4-4. `costlist_cleanup.gs` - Sort & Clean

**役割：**
- 各タブのデータをカテゴリ別・SKU番号順にソート
- 空白行削除
- 数式の行参照を自動更新（重要：これがCost listのSort & Cleanの肝）
- `price_sync_test.gs` の `EXCLUDE_SHEETS` を参照

**改修方針：**
- ❌ **このファイルは触らない**
- `EXCLUDE_SHEETS` を参照しているため、4-2の改修で自動的に新規シートが除外される

### 4-5. `rebuild preferred price.gs` - Preferred Price 集計

**役割：**
- 全ベンダータブの N列（Price $/lbs）と H列（日付）を読む
- SKU ごとに最新日付の価格を Preferred Price シートに集計
- **`PP_EXCLUDE_SHEETS` の定義場所**（独立した除外リスト）
- N列に数式を一括適用する関数も含む

**改修方針：**
- ✅ `PP_EXCLUDE_SHEETS` に新規シート名3つを追加（**小文字**で）
  - `'custom prices'`
  - `'custom price log'`
  - `'cost reference'`
- ❌ それ以外のロジックは絶対に変更しない

**注意：** `PP_EXCLUDE_SHEETS` は内部で **小文字に変換して比較** しているため、登録時も小文字にしてください。

### 4-6. `Code.gs` - 画像リンク生成

**役割：**
- 商品一覧の A列（品番）+ W列（画像URL）→ V列に HYPERLINK 数式を入れる

**改修方針：**
- ❌ **このファイルは触らない**

### 4-7. `weekly_mail_costlist.gs.gs` - 週次メール

**役割：**
- 毎週月曜に「フレッシュチキン価格」メール下書きを作成
- 毎週月曜13:00の自動実行トリガー

**改修方針：**
- ❌ **このファイルは触らない**

### 4-8. `recipients_autosort.gs` - 受信者ソート（未確認）

**役割：**
- 推測：Recipients シートの自動ソート

**改修方針：**
- ❌ **このファイルは触らない**

---

## 5. 既存スクリプト一覧（Item List 側）

Item List 側にも Apps Script があり、以下の機能を持っているとされる：

- **価格同期メニュー**：Preferred Price → Item List J列への同期
  - `syncPricesOverwriteAll`（① すべて上書き）
  - `syncPricesOnlyBlank`（② Jが空欄の行だけ埋める）
  - `syncPricesUpdateIfDifferent`（③ 差分がある行だけ更新）

**改修方針：**
- ❌ **Item List 側のApps Scriptは触らない**
- 今回のプロジェクトは Item List を読むだけ。書き込みは行わない

---

## 6. 既存システム（server.js）の構成

GitHubリポジトリ `order-system` の主要ファイル：

```
order-system/
├── server.js                    ← メイン処理（価格決定ロジックがある）
├── routes/
│   └── qboAuth.js               ← QBO認証
├── public/
│   └── scan.html                ← QRコード注文フォーム
├── flyerExport.js               ← フライヤー PDF生成
├── package.json
└── .env                         ← 環境変数（QBOトークン、Sheets認証情報等）
```

**主要エンドポイント：**

| エンドポイント | 機能 | 改修必要性 |
|---|---|---|
| `POST /api/scan-order` | 注文受信 | 中（価格決定ロジック呼び出し）|
| `POST /api/create-invoice` | QBOインボイス作成 | **大**（価格決定ロジック改修）|
| `GET /qbo/callback` | QBO認証コールバック | なし |
| その他 | 既存処理 | なし |

詳細は **04-server-changes.md** 参照。

---

## 7. 開発環境と本番環境の使い分け

**重要：** 本プロジェクトはすべて**開発用コピー環境で実装・テスト**します。本番環境は日常業務で使い続けるため、開発が完了するまで触りません。

### 環境の対応関係

| 環境 | 用途 | 改修可否 |
|---|---|---|
| **本番スプレッドシート3つ** | 日常業務 | ❌ 触らない（フェーズ5まで） |
| **開発用スプレッドシート3つ**（コピー）| 開発・テスト | ✅ 自由に改修 |
| **`main` ブランチ**（GitHub）| 本番稼働中のコード | ❌ 触らない |
| **`feature/custom-prices` ブランチ** | 開発作業 | ✅ ここで実装 |
| **本番QBO** | 実際の請求書発行 | ❌ 開発中は送信しない |
| **dry-runモード** | テスト用ログ出力 | ✅ 開発中はこれを使う |

### 環境変数の管理

`.env.development` と `.env.production` を分けて管理：

```env
# .env.development
COST_LIST_ID=（開発用Cost listのID）
ITEM_LIST_ID=（開発用Item ListのID）
CLIENT_INFO_ID=（開発用Client InformationのID）
ORDER_RECORD_ID=（開発用order-system recordのID）
QBO_MODE=dry-run

# .env.production
COST_LIST_ID=1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k
ITEM_LIST_ID=14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc
CLIENT_INFO_ID=1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8
ORDER_RECORD_ID=1Qi7IuVjksPQa3wv_YIid_UCHaHYmmmyBH3oT8BJKLIk
QBO_MODE=production
```

### dry-runモードの実装

開発中は QBO API への実送信を抑止し、ログ出力のみ：

```javascript
// server.js
async function createInvoiceInQBO(invoiceData) {
  if (process.env.QBO_MODE === 'dry-run') {
    console.log('[DRY-RUN] Would send to QBO:', JSON.stringify(invoiceData, null, 2));
    // 開発用 order-system record にも記録
    await logToDevRecord(invoiceData);
    return {
      dryRun: true,
      mockInvoiceId: 'DRY-RUN-' + Date.now(),
      status: 'simulated'
    };
  }
  // 本番モード
  return await qboCreateInvoice(invoiceData);
}
```

詳細な実装は **04-server-changes.md** 参照。

### 開発用スプレッドシートでの注意点

1. **コピー時にApps Scriptも一緒にコピーされる**
   - スクリプト内に**本番スプレッドシートのIDがハードコードされている箇所**を探して、開発用IDに書き換える必要があります
   - 例：`weekly_mail_costlist.gs.gs` 内の `COST_LIST_URL` は本番IDを指している → 開発用に変更
2. **既存のトリガー（5分監視、毎週月曜など）は自動コピーされない**
   - 開発中にトリガーが必要なら、開発用スプレッドシートで再度設定する
3. **本番スプレッドシートとの混同に注意**
   - 開発用は名前に `[DEV]` を付けるなど、明確に区別する

---

## 8. 触ってはいけない場所まとめ（重要）

### 絶対に変更してはいけないファイル

| ファイル | 理由 |
|---|---|
| `costlist_cleanup.gs` | Sort & Clean の数式保持ロジックは複雑で繊細 |
| `Code.gs` | 商品一覧の画像リンク機能 |
| `weekly_mail_costlist.gs.gs` | 顧客向け週次メール |
| `recipients_autosort.gs` | 受信者リスト管理 |
| **Item List 側のApps Script全般** | 価格同期処理など、本プロジェクトの範囲外 |

### 既存ファイルでも「追加のみ」許可される変更

| ファイル | 許可される変更 |
|---|---|
| `_main.gs` | `onOpen()` 末尾に「価格管理」メニュー追加（既存部分は変更不可）|
| `price_sync_test.gs` | `EXCLUDE_SHEETS` に新規シート名3つを追加（順序や既存項目は変更不可）|
| `vedor_formulas.gs` | `VF_EXCLUDE` に新規シート名3つを追加（順序や既存項目は変更不可）|
| `rebuild preferred price.gs` | `PP_EXCLUDE_SHEETS` に新規シート名3つを追加（順序や既存項目は変更不可）|

### 絶対に削除してはいけないデータ

| データ | 場所 |
|---|---|
| 既存のベンダータブすべて | Cost list |
| Preferred Price シート | Cost list |
| Item List の既存列・データ | Item List |
| Client list の既存列・データ | Client Information |
| 既存のApps Scriptトリガー（onEdit、5分監視、毎週月曜など）| Cost list |

---

## 9. データ参照のパフォーマンス考慮

注文1件に複数SKUが含まれる場合、SKUごとにSheets APIを叩くと遅くなります。

**推奨実装：注文処理の最初に一括取得**

```javascript
// 注文受信時
async function processOrder(orderData) {
  // 1回目のAPI呼び出し: Custom Prices全件
  const customPrices = await loadAllCustomPrices();

  // 2回目のAPI呼び出し: Client list全件
  const clientList = await loadAllClients();

  // 3回目のAPI呼び出し: Item List全件
  const itemList = await loadAllItems();

  // 以降、価格判定処理はすべてメモリ上で完結
  for (const item of orderData.items) {
    const price = determinePrice(item, orderData.customerId, customPrices, clientList, itemList);
    // ...
  }
}
```

**データ量：**
- Custom Prices：約75行
- Client list：約60行
- Item List：約500行

これくらいなら一括取得しても問題なく軽量です。

詳細は **04-server-changes.md** 参照。

---

## 10. エラーハンドリングの基本方針

詳細は **04-server-changes.md** および **07-rules.md** 参照。要点のみ：

1. **業務継続性優先**：些細なエラーで全体を止めない
2. **フォールバック**：データが取れない場合は安全側（Standardなど）に倒す
3. **通知必須**：問題発生時は `ordercfp@gmail.com` にアラートメール
4. **リトライ**：ネットワーク系エラーは3回まで（指数バックオフ：1秒 → 3秒 → 9秒）
5. **記録**：order-system record に処理状況を記録

---

## 11. 全体把握チェックリスト

このファイルを読み終わったら、以下を確認してください：

- [ ] 価格決定の流れ（4ステップ）を理解した
- [ ] 量り売り（J列）と定量売り（K列）の判定方法を理解した
- [ ] Cost list の8ファイルのうち、改修するのは4つだけだと理解した
- [ ] 改修方針が「追加のみ」で「既存部分の変更禁止」だと理解した
- [ ] Item List 側のスクリプトには触らないと理解した
- [ ] 一括取得方式でパフォーマンスを最適化すると理解した
- [ ] **開発はすべて開発用コピー環境で行い、本番は触らないと理解した**
- [ ] **dry-runモードで開発中はQBOへ送信しないと理解した**

OKならば **02-data-structures.md** に進んでください。
