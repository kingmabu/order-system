# 08 本番移植計画書（Custom Prices System / 6分類）

作成日：2026-05-22
対象ブランチ：`feature/custom-prices`（main へマージ予定）
前提：開発環境で全6分類の dry-run 検証が完了済み（`scripts/dry-run-pricing.js`）。

> 🛑 **このフェーズは実際の請求に影響します。** 各ステップは「1つずつ・確認しながら」進め、`QBO_MODE` は最後まで慎重に扱います。本番スプレッドシートには**必ずバックアップを取ってから**着手してください。

---

## 0. 本番リソース一覧

| リソース | 本番ID |
|---|---|
| Cost list（Custom Prices を置く） | `1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k` |
| Item List（商品一覧） | `14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc` |
| Client Information（Client list） | `1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8` |
| order-system record（_tokens等） | `1Qi7IuVjksPQa3wv_YIid_UCHaHYmmmyBH3oT8BJKLIk` |
| サービスアカウント | `order-system@order-system-492319.iam.gserviceaccount.com` |
| order-system 本番ホスト | Render.com |

開発用ID（参考・本番では使わない）：Cost list `1NPCw-...` / Item List `1dIiwCvK...` / Client Info `1Jqmqs-...`

---

## 1. 事前準備（着手前に必ず）

- [ ] **本番3シートのバックアップ**：各シートを「ファイル → コピーを作成」で `[BACKUP 2026-05-22]` を作る
- [ ] **サービスアカウント共有確認**：本番 Cost list / Item List / Client Information が
      `order-system@order-system-492319.iam.gserviceaccount.com` に**閲覧者以上で共有**されているか確認
      （Custom Prices を置く本番 Cost list は新規共有が必要な可能性大）
- [ ] **実施時間帯**：注文が少ない時間に実施（誤請求リスク低減）
- [ ] **ロールバック手順（本書 §7）を読んでおく**

---

## 2. ステップA：本番 Client Information の分類（手順書1・2の本番版）

> 開発用と同じ作業を本番 Client Information で行う。

- [ ] A-1. 本番 Client Information を開く（`1CG07N6t...`）
- [ ] A-2. 拡張機能 → Apps Script。**`Code.gs` は触らず**、新規ファイル `setup_price_group` を追加し
      最新の `apps-script/client-info-dev/setup_price_group.js`（6択版）を貼り付け
      （手順書1の「別ファイル追加方式」に従う。同名の古いファイルがあれば削除）
- [ ] A-3. `checkClientListStatus` で現状確認（最終列・ヘッダー）
- [ ] A-4. `setupPriceGroupColumns` 実行 → W列(Price Group)/X列(Markup %) 追加、6択プルダウン
- [ ] A-5. 全顧客を6分類に入力（手順書2）：
        Group A=12 / Group B=6 / Group C=4 / Group D=5 / Individual=9 / 残りStandard
        ※開発用と同じCustomer IDで分類（下記リスト参照）
- [ ] A-6. X列：Group A の12社に `2.00`
- [ ] A-7. COUNTIF で件数確認（A=12 / B=6 / C=4 / D=5 / Individual=9）

### 分類リスト（開発用と同一・本番でも同じCustomer ID）
- Group A(12)：060/008/021/024/084/093/051/062/022/068/094/061
- Group B(6)：064/025/013/014/002/003
- Group C(4)：001/019/016/028
- Group D(5)：035/045/070/088/033 （088はIndividualではなくGroup D）
- Individual(9)：011/080/018/054/053/050/083/006/048 （※088を除外。054 KAI RAMENを追加＝当初の計画から漏れていた。開発環境では当初からIndividualで5件の個別価格あり）

---

## 3. ステップB：本番 Cost list へ Apps Script デプロイ

> ⚠ **最重要：スクリプト内のシートIDを本番用に差し替える**

- [ ] B-1. 本番 Cost list を開く（`1dC88enQ...`）→ 拡張機能 → Apps Script
- [ ] B-2. `custom_prices_form_main.gs` を配置する前に、**以下2定数を本番IDに変更**：
        ```js
        const CLIENT_INFO_ID = '1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8'; // 本番
        const ITEM_LIST_ID   = '14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc'; // 本番
        ```
        （24行目・28行目。開発用 `1Jqmqs-` / `1dIiwCvK` から差し替え）
- [ ] B-3. `custom_prices_form_main.gs` / `custom_prices_form.html` / `cost_reference.gs`(`_main.gs` のメニュー登録) を配置
        ※既存業務スクリプトは上書きしない。「価格管理」メニューが onOpen で追加される構成を確認
- [ ] B-4. リロード → メニュー「価格管理」表示、フォームの顧客プルダウンに
        🔷 Group B / 🔶 Group C / 🟢 Group D / Individual 9社 が出るか確認
- [ ] B-5. Custom Prices シートのA列をテキスト書式、E列を通貨書式に（または初回 addCustomPrice 時に自動）

> 💡 **将来の保守性**：CLIENT_INFO_ID / ITEM_LIST_ID を Script Properties 化すれば、
> 開発/本番でコードを分けずに済む（今は手動差し替えで対応・要望あれば後日改修）。

---

## 4. ステップC：本番 Custom Prices に価格登録

- [x] C-0. **（前提）本番 Client list で 054 KAI RAMEN を Standard → Individual に変更**（W列）。✅ 2026-05-22完了。Individual=9社/Standard=59社に検証OK。
- [x] C-1. 開発用 Custom Prices の33件（GROUP_B/C/D + Individual 9社分）を本番に登録 ✅ 2026-05-22完了（方法2：範囲コピー A2:G34）
        - 方法1：フォーム「価格管理 → 個別価格を追加」で1件ずつ（ログ・検証付き）
        - 方法2：開発用 Custom Prices シートの内容を本番にコピー（A列テキスト/E列通貨書式に注意）
- [x] C-2. 件数・実値を確認（開発用と一致するか）✅ 2026-05-22 全33件一致（customerId・SKU・価格すべてOK、先頭ゼロ保持、価格ズレなし）

---

## 5. ステップD：order-system（Render.com）本番反映

> 🛑 **順序が重要（当初の D-2→D-3 から変更）**：`QBO_MODE` は新規変数で、
> `server.js` は `process.env.QBO_MODE === 'dry-run'` のときだけQBO送信をスキップする。
> 未設定だと新コードは**本番モードで即実インボイス送信**になる。
> よって **環境変数（旧D-3）をマージ（旧D-2）より先**に設定する。
> 現行(main)コードは `QBO_MODE`/`COST_LIST_ID`/`ITEM_LIST_ID`/`CLIENT_INFO_ID` を参照しないので、
> マージ前にこれらを入れても現行本番運用には無影響（env変更で現行コードが再デプロイされても挙動不変）。

- [x] D-1. `feature/custom-prices` のテスト（dry-run）が緑であることを確認 ✅ 2026-05-22。main は feature の祖先（feature が22コミット先行）＝マージはfast-forwardでコンフリクトなし。
- [ ] D-2.（**先に実施**）Render.com の環境変数を設定・確認：
        【新規追加（必須）】
        - **`QBO_MODE=dry-run`（最初は必ず dry-run で開始）**
        - `COST_LIST_ID`   = `1dC88enQnxjK8-GgxQhA6z4xiICUZ-ShFGnzcYySY73k`（本番・Custom Pricesを含む）
        - `ITEM_LIST_ID`   = `14dKo33uLpVlHKF5RM6aM7oj-Y4lv1CnQbGQcpatrbfc`（本番）
        - `CLIENT_INFO_ID` = `1CG07N6tYpIoPD_vp0cQ8lu_uMAVO4NRwuvL_J6-fTe8`（本番）
        【既存・確認のみ（変更しない）】
        - `GOOGLE_SERVICE_ACCOUNT`（本番SAのJSON）/ `QBO_ENV` / `CLIENTS_SHEET_ID` / `GOOGLE_SHEET_ID`
        【任意・デフォルトで本番一致を確認済（設定不要）】
        - `CUSTOM_PRICES_SHEET`='Custom Prices' / `CLIENT_LIST_SHEET`='Client list' / `ITEM_LIST_SHEET`='商品一覧'
- [ ] D-3.（**env設定後**）`feature/custom-prices` → `main` へマージし push（fast-forward）。Render が自動デプロイ。
- [ ] D-4. デプロイ。起動ログにエラーがないこと。`QBO_MODE=dry-run` で起動していることを確認

---

## 6. ステップE：段階的展開（QBO_MODE 切替は慎重に）

- [ ] E-1. **本番 dry-run 検証**：`QBO_MODE=dry-run` のまま各分類の顧客で注文を流し、
        `[Pricing]` ログ・PrivateNote の価格ソース内訳（custom/group-a/standard/fallback）を確認
- [ ] E-2. **自社（MY Inc.）顧客でテスト**：実際にインボイス作成（dry-run）→ 価格が正しいか
- [ ] E-3. **先行1〜2社**：ここで初めて `QBO_MODE=production` に切替を検討。
        対象を絞って実インボイスを作成し、QBO上の金額を目視確認
- [ ] E-4. 問題なければ **Group A → Group B/C/D → Individual → 全顧客** と順次拡大
- [ ] E-5. 1〜2請求サイクル安定稼働を確認

---

## 7. ロールバック手順

| 事象 | 対応 |
|---|---|
| 価格が想定と違う | 即 `QBO_MODE=dry-run` に戻す。Render.com 環境変数を変更し再デプロイ |
| Apps Script フォール不調 | バックアップシートから復元。スクリプトは旧版に戻す |
| order-system エラー | `main` を直前コミットに revert して再デプロイ。または環境変数で旧挙動に |
| Client list 破損 | §1 のバックアップシートから W/X列を復元 |

> 重要：**誤請求を検知したら最優先で `QBO_MODE=dry-run` に戻す**。送信済みインボイスはQBO側で手動修正。

---

## 8. 完了条件（Choco解約）

- [ ] 全顧客で1〜2請求サイクル、価格が正しく自動適用されている
- [ ] 従業員の手動価格修正が不要になった
- [ ] **Choco を解約**（プロジェクトゴール達成）

---

## 9. 未解決・要検討メモ

- シートID手動差し替え（B-2）はミスの温床。Script Properties 化を将来検討。
- `.env.development` に `GOOGLE_SERVICE_ACCOUNT` が無い（`PROD_` のみ）。本番は Render.com 環境変数で `GOOGLE_SERVICE_ACCOUNT` 設定済みのはずだが、ローカルで本番接続テストする場合は注意。
- 新グループ追加の自己サービス化は保留中（メモリ参照）。
