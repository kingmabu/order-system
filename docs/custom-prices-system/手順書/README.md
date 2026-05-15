# Manabu さん向け手作業手順書（5分類版）

Custom Prices System のフェーズ5（テスト前準備）として、Manabuさんが実施する**3つの手作業**の手順書です。

> ⚠ **2026-05-15 設計変更**：顧客分類を**5分類**（Standard / Group A / Group B / Group C / Individual）に拡張しました。各手順書は**5分類版**に更新済みです。

---

## 作業の全体像

| # | 手順書 | 内容 | 所要時間 |
|---|---|---|---|
| 1 | [01-setup-price-group.md](01-setup-price-group.md) | Client list に W/X列を追加（**5択プルダウン**版スクリプト実行） | 10〜15分 |
| 2 | [02-classify-clients.md](02-classify-clients.md) | 全顧客を **5分類**（Standard / Group A=12 / Group B=6 / Group C=4 / Individual=9）に分類 | 30〜60分 |
| 3 | [03-input-custom-prices.md](03-input-custom-prices.md) | Custom Prices シートに **約55レコード**入力（Group B + Group C + Individual 9社×5）| 1.5〜2時間 |

**合計所要時間：約3〜4時間**（リスト整理を含めると半日程度）

---

## ⚠ 必ず順番通りに実施してください

```
手順書1 → 手順書2 → 手順書3
```

- 手順書2 は手順書1の W列が必要
- 手順書3 のフォームは、手順書2 で `Group B` / `Group C` / `Individual` に分類された顧客（および Group B/C 仮想エントリ）しか表示しない

---

## ⚠ 既に旧版（3分類）で手順書1を実行済みの場合

W列に既にプルダウン（3択）が入っているはずです。**手順書1の最新版で `setupPriceGroupColumns` を再実行**してください（プルダウンが5択に拡張されます）。既存のW列の値（Standard / Group A / Individual）はそのまま残ります。

---

## ⚠ 本番スプレッドシートには絶対に触らない

すべての作業は **[DEV] 開発用コピー** に対してのみ実施してください。

| ブック | 開発用ID |
|---|---|
| Client Information | `1Jqmqs-FVmhXrG7GqPbh6bkvaRWHZXtAEHUsWkZV4f8o` |
| Cost list | `1NPCw-Bz0kokXEe2Tv2PcF9XkQsa1c5IqiGh3IIkWpV8` |
| Item List | `1dIiwCvK8DRXiRX9jGcaKmlc_x6QxsVmS_0dGpukjXAY` |

---

## 困ったら

- 各手順書の末尾「困ったときは」セクションを確認
- 解決しない場合は Claude に「手順書〇のステップ〇でこうなりました」と報告

---

## 完了後のフェーズ5

3つの手順書がすべて完了したら、Claude が以下を実施します：

1. ローカルで `QBO_MODE=dry-run` を起動して動作確認
2. PrivateNote の価格ソース内訳ログ（`custom` / `group-a` / `standard` / `fallback`）を検証
3. 本番展開計画の作成（自社 → 先行1〜2社 → Group B / Group C / Individual 全展開 → 全社）
