# 仕入れコスト自動反映システム — 仕様書（Claude Code用）

> この文書は Claude Code が実装に着手するための仕様書です。
> 列位置やシート構造を**推測せず**、§9「最初に確認すること」に従って実シートを読んで確定してから実装してください。
> 実装は **Google Apps Script**（既存のベンダー請求書自動解析フローに相乗り）で行います。

---

## 1. 目的（ゴール）

請求書解析で得たSKU別の仕入コストを、**履歴に残しつつ Cost list の F列（LBS Cost）を自動更新**し、**上下どちらの価格変動も見逃さず**、**ベンダー単位で1通にまとめて通知**する。手入力を排し、仕入れの値動き（値上がりも値下がりも）を取りこぼさない。

売値の見直しは人が判断する。**システムは売値（M列）には一切触れない。**

---

## 2. 確定した前提・業務ルール

### 2-1. 価格の決まり方（参考・既存仕様）
- **標準販売価格** ＝ Item List「商品一覧」タブ。参照元は Cost list「Preferred price」タブ（SKU基準）。
- 売値の流れ：**M列（QB Price・手入力）→ N列（＝M÷Weight・自動）→ Preferred price → Item List**。
- **F列（仕入コスト）は売値の計算に入っていない。** よって F列を自動更新しても顧客インボイスの価格には影響しない（＝安全）。

### 2-2. 価格変更の手順（手作業・参考）
1. 仕入れ変動 → ベンダータブの **F列** 変更
2. メニュー **Preferred price（再構築）**
3. 特別価格対象があれば **価格管理 → 価格同期**
4. **QBO** を手動更新
5. Item List の **価格同期 → 差分行のみ更新**

→ 本システムが自動で行うのは **手順1（F列）の更新と、変動の検知・通知のみ**。手順2以降は従来どおり人が行う。

---

## 3. データソース（2ブックをまたぐ・クロスブック）

| 役割 | ブック | タブ / 列 |
|---|---|---|
| 仕入コスト（反映先） | Cost list（別ブック `1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k`） | 各ベンダータブ。**F=LBS Cost** に書く |
| コストの取得元 | CFP Operations（`1m2wm3M0xeoCWE3a4U4e-xvBKMR3j2Wllts7OBjBtv6o`） | **Receiving Log** タブ |
| 照合・請求単位の定義 | 同上（CFP Operations） | **Vendor Map** タブ（gid 432517660） |
| 通知宛先 | — | `ordercfp@gmail.com` |

### 3-1. Cost list ベンダータブの列（B026タブで確認。全タブ共通か要確認）

| 列 | 内容 | 種別 |
|---|---|---|
| A | SKU | — |
| B | Items | — |
| C | Weight（1単位のlbs） | 手入力 |
| D | /LBS | チェック |
| E | /Each | チェック |
| **F** | **LBS Cost（$/lb）** | **手入力 ← 自動反映先** |
| G | Each cost ＝ F × C | 自動式 |
| H | Update date | 反映日を自動更新 |
| I〜L | 15/20/25/30%（G基準の推奨売価） | 自動式 |
| M | QB Price（売値） | 手入力 **← 触らない** |
| N | Price ($/lbs) ＝ M ÷ C | 自動式 → Preferred price → Item List |

**F列を更新すると G・I〜L が自動再計算**される。アラートには I〜L の推奨売価を載せる。

### 3-2. Receiving Log（CFP Operations）— コストの取得元

解析済みの入庫明細が1行ずつ記録されている。主な列：
- **Vendor**（インボイス上のベンダー名）/ **SKU**（ベンダーSKU）/ **Description**
- **Qty** / **Unit Price**（← この単価が仕入コスト。**多くは $/lb**）
- **Our SKU**（CFP SKUへの照合結果）/ **Match**（`Vendor SKU` / `Keyword` / `未照合` / `Master未登録` / `Qty=0`）
- QBO Bill ID, Stock Before, Stock After, Notes

→ コスト反映は **このタブの Unit Price と Our SKU を読む**。請求書の再解析は不要。

### 3-3. Vendor Map（CFP Operations）— 照合と請求単位の定義

既存列：A:Invoice Vendor Name / B:QBO Vendor Name / C:Due Date(days) / D:Vendor SKU / E:Vendor Item Keyword / **F:弊社SKU** / G:Conversion Factor / **Pack Size (lbs)**

- 照合は **D(Vendor SKU)優先 → E(Keyword)** の順。
- **G:Conversion Factor は在庫の入数倍率**（例 C011/C012＝4）であって、$/lb変換とは別物。混同しないこと。
- **Pack Size (lbs)** は既存列。CS/EA単価を $/lb に割る除数に使う。
- **「請求単位（LB / CS / EA）」列をここに新規追加**する（足すのはこれ1列）。

---

## 4. 中核の処理フロー

請求書解析（既存フロー）で Receiving Log に行が追加されたら、各明細について以下を実行する。

```
1. Receiving Log から Vendor / Our SKU / Unit Price / Match を取得
   - Match が 未照合 / Master未登録 / Qty=0 → 保留リストへ（書き込まない）
   - 重複行（同一 Vendor×Our SKU×Invoice）は最新1件だけ採用（QBO再作成で重複行が出るため）

2. ベンダー更新ルールを確認（§6）
   - 「週次・月曜」指定（= L&T）で、当該請求書が月曜分でない → このベンダーはスキップ

3. Unit Price を $/lb に変換（§5。Vendor Map の請求単位＋Pack Size を使用）
   - 変換できない → 保留リストへ

4. 履歴シートに1行記録（SKU・ベンダー・日付・$/lbコスト）

5. Cost list の「該当ベンダーのタブ」で Our SKU の行を探し、現 F列 値と比較
   - 差があれば（±どんな小さい額でも・上下両方）変動として拾う

6. F列を新コスト($/lb)で更新し、H列(Update date)を反映日で更新
   - G・I〜L は式で自動再計算される

7. ベンダー単位で変動分を集約 → 変動が1件以上あれば 1通だけ通知（§7）
```

> **ベンダー名 → Cost list タブの対応（確定）**：Receiving Log の Vendor 名を下表で Cost list のタブ名に正規化する。同一SKUを複数ベンダーから仕入れる場合（例 C001＝T&T／Zant、C026＝L&T／Glen Rose）は、**請求元ベンダーのタブにだけ**書く。
>
> | Receiving Log Vendor | Cost list タブ |
> |---|---|
> | L & T MEAT CO. | L&T |
> | THE 29ERS' PROVISIONS | 29ers |
> | R. W. ZANT, LLC | Zant |
> | Tokai Denpun USA, Inc. | Tokai Denpun |
> | UNIBRIGHT FOODS, INC. | Unibright |
> | GLEN ROSE MEAT COMPANY | Glen Rose |
> | T & T Foods (Colonel Lee's) | T&T |
> | Sunrise Food Co | Sun Rise |
> | COMMERCIAL MEAT CO. | Commercial Meat |
> | YAMASA ENTERPRISES | Yamasa |
> | Pacific Fresh Fish Co. | Pacific |
> | COMMODITY SALES, LLC | Commodity |
> | AL's Wholesale Meats | Al's Meat |
> | Koi Koi Trading | Koi Koi Trading |
> | Riverson Foods | Riverson |
>
> 正規化は大文字小文字・記号・空白を無視した部分一致でよい（例：`ZANT`→Zant、`29`→29ers、`COLONEL LEE`→T&T、`SUNRISE`/`SUN RISE`→Sun Rise）。Blue Pacific / GTK / Mirai / Ocean Depo / Canton / Central Processing / Shabu way のタブは自動請求が無い（または稀）ため、当面は手動運用とする。

---

## 5. 単位変換ルール

F列は必ず **$/lb**。Vendor Map の「請求単位」で分岐する。

| 請求単位 | 変換 |
|---|---|
| **LB**（大半。catch weight含む） | そのまま F列へ（変換不要） |
| **CS / EA** | **v1は自動反映しない（手動）**。v2で F ＝ Unit Price ÷ Pack Size(lbs) を実装 |
| **判定不能** | 保留リストへ（推測で書かない） |

- 実データ上、**大半のベンダーは $/lb**（L&T・29ers・Zant・Glen Rose・T&T・Commercial・UNIBRIGHT）。catch weight（実重量が変わる品）も請求書が /lb なので **LB扱いで十分**。専用フラグや実重量計算は不要。
- **v1は LB のみ**を自動反映する。下表の CS/EA 品目と Sunrise 労務費は **自動では F列に書かず、アラートに「手動確認」として並べるだけ**にする。理由：これらは少数（主に海産・特殊品）で、現状シートの保存形式が $/lb と「ケース丸ごと」で不統一なため、自動で割ると誤りやすい。Pack Size の整備は不要。CS/EA の自動変換は **v2** で扱う。

**v1で自動反映しない品目（アラートに手動確認として表示）**

| ベンダー | SKU | 請求例 | 単位 | 備考 |
|---|---|---|---|---|
| Koi Koi | S045〜S049 うなぎ | $165／ケース等 | CS | 売価=ケース単位。現状 F に $/lb 手入力 |
| Yamasa | S008 SURIMI | $178.8／24lbケース | CS | F=$7.45/lb 手入力 |
| Tokai | S010 うなぎ11oz | $8／枚 | EA | 個売り。$/lb 概念が合わない |
| Tokai | S030/S031 Nobashi | $135/$145／ケース | CS | F=ケース価格で保存・ケース売り |
| Pacific | S007 明太子等 | 変動 | 要確認 | |
| Sunrise | P034/P042/P052/P053/P054/P059 | LABOR CHARGE | — | 肉代でなくスライス労務費。F上書き不可 |

> 上記は **§6 の更新対象から除外**。アラート末尾に「手動確認（CS/EA・Sunrise）」として該当行を列挙する。

---

## 6. ベンダー更新ルール

| ベンダー | ルール | アンカー曜日 |
|---|---|---|
| **L & T MEAT CO.**（毎日購入の鶏肉） | **週次** | **月曜** |
| その他すべて | **毎回**（Receiving Log に行が来る都度） | — |

- L&T は月曜のインボイスだけで F列更新＆通知。火〜日の請求書はスキップ（売値を週固定で運用しているため）。
- 設定は小さな対応表で持ち、将来「週固定」ベンダーが増えたら行を足すだけにする。

---

## 7. アラートの仕様

- **ベンダー単位で1通**（SKU単位で乱発しない）。変動ゼロのベンダーはメールを送らない。
- 1行＝1SKUで：**↑値上がり / ↓値下がり**、SKU・商品名、**旧→新($/lb)・変動率(%)**、**推奨売価**（I〜Lのうち目標margin%の値）。
- **±50%超は「要確認」マーク**（OCR誤読の可能性。消さずに必ず表示）。
- 末尾に **保留リスト**（未照合・Master未登録・Pack Size未設定・Qty=0でF列に書けなかった明細）。
- 送信先：`ordercfp@gmail.com`

---

## 8. 履歴シート＆実行タイミング（確定）

**履歴シート**
- Cost list 内に新タブ **「Cost History」** を作る（既存タブは触らない）。
- 列：**反映日 / Vendorタブ / SKU / 商品名 / 新$/lb / 旧$/lb / 変動% / Invoice#**。
- 反映のたびに追記（追記専用・上書きしない）。これがSKUごとのコスト推移になる。

**実行タイミング**
- **Cost list メニューに新規ボタン「💰 仕入コスト反映」を追加し、手動実行**とする（Receiving Confirm への自動相乗りはしない＝別ブックへの書込みを受領処理と分離して安全に）。
- 動作が安定したら、将来 **毎朝の時刻トリガー**に載せ替え可能な作りにする。
- L&T は月曜実行時のみ反映（§6）。

---

## 9. 確認できたこと / 残りの確認

### 確認済み（実シートから確定）
- Vendor Map は **CFP Operations** 内（gid 432517660）。列は A:Invoice Vendor Name / B:QBO Vendor Name / C:Due Date / D:Vendor SKU / E:Vendor Item Keyword / F:弊社SKU / G:Conversion Factor、＋ **Pack Size (lbs)** 列。照合は Vendor SKU→Keyword。
- コストは **Receiving Log** に取り込み済み。列：Date / Vendor / Invoice# / Invoice Date / SKU / Description / Qty / **Unit Price** / QBO Bill ID / **Our SKU** / **Match** / Stock Before / Stock After / Notes。
- **読むべき行＝Match が「OK」かつ Our SKU・QBO Bill ID(数値)が入っている行**。`⚠️ 未作成`・`未照合`・`Master未登録`・`Qty=0`・Our SKU空欄の行は対象外。
- **Cost list の全ベンダータブは列構成が共通**：A:SKU / B:Items / C:Weight / D:/LBS / E:/Each / **F:LBS Cost** / G:Each cost / H:Update date / I〜L:15〜30% / M:QB Price / N:Price($/lbs)。一部タブに Prev Price / Change / Manpuku 等の追加列があるが F/C/H/M/N の位置は不変。
- **ベンダー名→タブの正規化対応は §4 の表で確定**。
- 単価の大半は **$/lb**。CS/EA は §5 の少数SKUのみ。
- 月曜固定の週次ベンダーは **L&T MEAT CO.**。L&T は請求 Unit Price をそのまま F列へ（10lb袋でも /lb 請求のため割り算不要）。

### 残課題：なし（v1の設計は確定）
v1 実装に必要な判断はすべて確定済み。重複行の扱いだけ実装メモを残す。

- **重複行の最新判定**：同一 **Invoice# × Our SKU** が QBO 再作成で複数 Bill ID に出る。各（Cost listタブ × SKU）について **最新 Invoice Date の Match=OK 行**の Unit Price を採用（同日複数なら最後の行）。`未作成`・`未照合`・`未登録`・`Qty=0`・Our SKU空欄の行は数えない。
- **CS/EA・Sunrise**：自動反映せず、アラートに手動確認として列挙（§5）。
- **履歴シート＝Cost History／実行＝Cost list メニュー手動ボタン**（§8）。

→ この仕様書のまま Claude Code に着手させてよい。初回は §10-7 の dry-run（ログのみ）で検証する。

---

## 10. 守るルール（厳守）

1. **本番スプレッドシートを開発中に触らない。** 開発用コピーで実装・テストする。
2. **自動で書き込んでよいのは F列・H列・履歴シート・アラート送信のみ。** M列・N列・G列・I〜L列・Preferred price・Item List・QBO には触れない。
3. **判定不能・未照合・未登録・Qty=0 は書かない＝保留リストへ。** 推測でF列を埋めない。
4. **±50%超の変動は「要確認」マークを付けるだけ。** 抑制（非表示）はしない。
5. **既存スクリプト（解析・受領・Vendor Map照合）のロジックは追加のみ。** 既存挙動を変えない。
6. **手順は1ステップずつ。** 不明点は選択肢形式で確認。
7. 初期テストは、F列に書き込まず**「変更案だけログ出力する dry-run」**で確認してから本書き込みに移る。

---

## 11. フェーズ分け

- **v1（今回）**：**LB請求のみ** F列更新＋H列＋Cost History 追記＋ベンダー別アラート（変動率＋推奨売価）。CS/EA・Sunrise は手動確認に列挙。売値（M列）は人が手動。手動メニューボタンで実行。
- **v2（後日）**：CS/EA の自動変換（Vendor Map に請求単位＋Pack Size 整備）、アラートに **margin** 表示、毎朝トリガー化。

---

## 12. 完成形のイメージ

> L&Tの月曜インボイスが Receiving Log に入る
> → C012 の Unit Price 1.75（$/lb・請求単位=LB）を取得
> → 前回 1.71 → 新 1.75（+2.3%）と検知
> → 履歴に1行、Cost list の L&Tタブ C012 の F列を 1.75 に更新、H列に反映日
> → G・I〜L が自動再計算（25%なら推奨 $X.XX）
> → 「C012 +2.3%。25%なら推奨 $X.XX」とアラート1通（L&T分まとめて）
> → Manabu が見て M列を手動更新 → Preferred price 再構築 → 価格同期
