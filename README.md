# 発注書スキャン & QBOインボイス自動作成システム

## 必要な環境変数（Renderで設定）

| 変数名 | 説明 |
|--------|------|
| `QBO_CLIENT_ID` | QBO開発者ポータルのClient ID（Sandbox） |
| `QBO_CLIENT_SECRET` | QBO開発者ポータルのClient Secret（Sandbox） |
| `QBO_REDIRECT_URI` | `https://あなたのアプリ名.onrender.com/callback` |
| `QBO_ENV` | `sandbox`（テスト時）または `production` |
| `ANTHROPIC_API_KEY` | Claude APIキー |
| `GOOGLE_SERVICE_ACCOUNT` | Google サービスアカウントのJSON（1行に圧縮） |
| `GOOGLE_SHEET_ID` | Google SheetsのスプレッドシートID |

## システム構成

```
顧客（スマホ）
  → QRコード読み取り
  → /scan ページで発注書を撮影
  → /api/analyze でClaude Visionが解析
  → 内容確認・修正
  → /api/save-to-sheets でGoogle Sheetsに保存
  → /api/create-invoice でQBOにインボイス作成
```

## Renderへのデプロイ手順

1. GitHubにこのリポジトリをpush
2. render.com でNew → Web Service
3. GitHubリポジトリを選択
4. Build Command: `npm install`
5. Start Command: `npm start`
6. 環境変数を上記テーブルの通り設定
7. デプロイ後のURL（例: https://order-system-xxxx.onrender.com）をQBOのRedirect URIに設定
