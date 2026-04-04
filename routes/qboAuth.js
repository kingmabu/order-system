const express = require('express');
const router = express.Router();
const axios = require('axios');

let tokenStore = {};

router.get('/connect', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID,
    scope: 'com.intuit.quickbooks.accounting openid',
    redirect_uri: process.env.QBO_REDIRECT_URI,
    response_type: 'code',
    state: 'order-system'
  });
  res.redirect(`https://appcenter.intuit.com/connect/oauth2?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code, realmId, error } = req.query;
  if (error) {
    return res.send(`<h2>認証エラー: ${error}</h2><a href="/auth/connect">再試行</a>`);
  }
  try {
    const credentials = Buffer.from(
      `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
    ).toString('base64');
    const tokenResponse = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.QBO_REDIRECT_URI
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    tokenStore = {
      accessToken: access_token,
      refreshToken: refresh_token,
      realmId,
      expiresAt: Date.now() + expires_in * 1000
    };
    res.redirect('/dashboard.html');
  } catch (err) {
    res.send(`<h2>トークン取得失敗</h2><pre>${JSON.stringify(err.response?.data, null, 2)}</pre><a href="/auth/connect">再試行</a>`);
  }
});

async function refreshAccessToken() {
  if (!tokenStore.refreshToken) return null;
  const credentials = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64');
  const response = await axios.post(
    'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenStore.refreshToken
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  tokenStore.accessToken = response.data.access_token;
  tokenStore.refreshToken = response.data.refresh_token;
  tokenStore.expiresAt = Date.now() + response.data.expires_in * 1000;
  return tokenStore.accessToken;
}

router.get('/token', async (req, res) => {
  try {
    if (!tokenStore.accessToken) {
      return res.status(401).json({ error: 'QBOに未接続です', connectUrl: '/auth/connect' });
    }
    if (Date.now() > tokenStore.expiresAt - 5 * 60 * 1000) {
      await refreshAccessToken();
    }
    res.json({ accessToken: tokenStore.accessToken, realmId: tokenStore.realmId });
  } catch (err) {
    res.status(500).json({ error: 'トークン更新失敗: ' + err.message });
  }
});

router.get('/status', (req, res) => {
  res.json({
    connected: !!tokenStore.accessToken,
    realmId: tokenStore.realmId || null,
    expiresAt: tokenStore.expiresAt || null
  });
});

module.exports = router;
