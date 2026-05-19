# CFP Operations

## 🚧 現在の作業: Custom Prices System（顧客別個別価格機能）

- **ブランチ**: `feature/custom-prices`
- **作業worktree**: `C:\Users\calif\meat-order-system\.claude\worktrees\wonderful-vaughan-1d8c61`
- **進捗**: フェーズ0〜4 **完了**（コミット済）/ フェーズ5前半（手作業1/2＋Cost listデプロイ）**完了**（2026-05-19）/ **フェーズ5中盤：手順書3（Custom Prices入力）が次** // ← 変更
- **直近の最終コミット**: `ddbb757 feat: expand customer classification to 5 categories (Group B/C)`
- **詳細チェックリスト**: `docs/custom-prices-system/CLAUDE.md`
- **指示書一式**: `docs/custom-prices-system/README.md` ほか8ファイル

### 残作業（Manabuさんの手作業＋テスト）

**📘 手作業手順書：[docs/custom-prices-system/手順書/](docs/custom-prices-system/手順書/README.md)**

1. ✅ 開発用 Client Information で `setup_price_group.js` を**5択版で再実行** → [手順書1](docs/custom-prices-system/手順書/01-setup-price-group.md) （2026-05-19完了） // ← 変更
2. ✅ 開発用 Client list で全顧客を Standard(64) / Group A(12) / Group B(6) / Group C(4) / Individual(9) に分類 → [手順書2](docs/custom-prices-system/手順書/02-classify-clients.md) （2026-05-19完了・合計95社） // ← 変更
3. ✅ Cost list Apps Script の 5分類対応デプロイ（custom_prices_form_main.gs + custom_prices_form.html）（2026-05-19完了・フォーム動作確認済） // ← 変更
4. **次のステップ**：Custom Prices シートに約55件入力 → [手順書3](docs/custom-prices-system/手順書/03-input-custom-prices.md)（Group B 約5 + Group C 約5 + Individual 9社×約5 = 約55件） // ← 変更
5. dry-run でローカル動作確認（`QBO_MODE=dry-run`）
6. フェーズ5後半：本番移植 + 段階的展開

---

## プロジェクト構成（全体）
- P-01: QRコード注文フォーム（完成）
- P-02: 受注管理（完成）
- P-03: QBO連携・自動インボイス（完成）
- P-04: アッセンブリシート（**後回し**。Custom Prices System完了後に着手）
- P-05: CFP Operationsシート（完成）
- P-06: 顧客CRM（計画中）

## フォルダパス
C:\Users\calif\meat-order-system

## コーディングルール
- コードは完全版で提供（省略・差分のみはNG）
- 変更箇所に `// ← 変更` を明記

## /clear する前のチェックリスト（迷子防止）
1. このファイル（ルートCLAUDE.md）の「🚧 現在の作業」セクションを最新進捗に更新
2. `docs/custom-prices-system/CLAUDE.md` のフェーズチェックボックスを更新
3. メモリ `project_custom_prices_system.md` の「フェーズ進捗」を更新
4. 未コミット変更があればコミット
