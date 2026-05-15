# Manabu さん向け手作業手順書

Custom Prices System のフェーズ5（テスト前準備）として、Manabuさんが実施する**3つの手作業**の手順書です。

---

## 作業の全体像

| # | 手順書 | 内容 | 所要時間 |
|---|---|---|---|
| 1 | [01-setup-price-group.md](01-setup-price-group.md) | Client list に W/X列を追加（スクリプト実行） | 10〜15分 |
| 2 | [02-classify-clients.md](02-classify-clients.md) | 全顧客を Standard / Group A(12) / Individual(15) に分類 | 30〜60分 |
| 3 | [03-input-custom-prices.md](03-input-custom-prices.md) | Custom Prices シートに 75レコード入力 | 2〜3時間 |

**合計所要時間：約3〜4時間**（リスト整理を含めると半日程度）

---

## ⚠ 必ず順番通りに実施してください

```
手順書1 → 手順書2 → 手順書3
```

- 手順書2 は手順書1の W列が必要
- 手順書3 のフォームは手順書2 で `Individual` に分類された顧客しか表示しない

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
2. PrivateNote の価格ソース内訳ログを検証
3. 本番展開計画の作成（自社 → 先行1〜2社 → Individual全15社 → 全社）
