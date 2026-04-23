const express = require('express');
const router = express.Router();
const axios = require('axios');
const { google } = require('googleapis');

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function saveTokens(tokens) {
  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: '_tokens!A1:E1',
      valueInputOption: 'RAW',
      resource: {
        values: [[
          tokens.accessToken,
          tokens.refreshToken,
          tokens.realmId,
          tokens.expiresAt.toString()
        ]]
      }
    });
    console.log('Tokens saved to Sheets');
  } catch (err) {
    console.error('Token save error:', err.message);
  }
}

async function loadTokens() {
  try {
    const sheets = await getSheets();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: '_tokens!A1:D1'
    });
    const row = result.data.values?.[0];
    if (!row || !row[0]) return null;
    return {
      accessToken: row[0],
      refreshToken: row[1],
      realmId: row[2],
      expiresAt: parseInt(row[3])
    };
  } catch (err) {
    console.error('Token load error:', err.message);
    return null;
  }
}

let tokenStore = {};

async function initTokens() {
  const saved = await loadTokens();
  if (saved) {
    tokenStore = saved;
    console.log('Tokens loaded from Sheets, realmId:', saved.realmId);
    if (Date.now() > saved.expiresAt - 5 * 60 * 1000) {
      console.log('Token expired, refreshing...');
      await refreshAccessToken();
    }
  }
}

async function refreshAccessToken() {
  if (!tokenStore.refreshToken) return null;
  try {
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
    await saveTokens(tokenStore);
    console.log('Token refreshed successfully');
    return tokenStore.accessToken;
  } catch (err) {
    console.error('Token refresh error:', err.message);
    return null;
  }
}

// 起動時にトークンを読み込む
initTokens();

// 30分ごとに自動更新
setInterval(async () => {
  if (tokenStore.refreshToken) {
    console.log('Auto-refreshing token...');
    await refreshAccessToken();
  }
}, 30 * 60 * 1000);

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
    return res.send(`<h2>Auth error: ${error}</h2><a href="/auth/connect">Retry</a>`);
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
    await saveTokens(tokenStore);
    console.log('QBO connected, realmId:', realmId);
    res.redirect('/dashboard.html');
  } catch (err) {
    console.error('Token error:', err.response?.data || err.message);
    res.send(`<h2>Token error</h2><pre>${JSON.stringify(err.response?.data, null, 2)}</pre><a href="/auth/connect">Retry</a>`);
  }
});

router.get('/token', async (req, res) => {
  try {
    if (!tokenStore.accessToken) {
      return res.status(401).json({ error: 'QBO not connected', connectUrl: '/auth/connect' });
    }
    if (Date.now() > tokenStore.expiresAt - 5 * 60 * 1000) {
      await refreshAccessToken();
    }
    res.json({ accessToken: tokenStore.accessToken, realmId: tokenStore.realmId });
  } catch (err) {
    res.status(500).json({ error: 'Token error: ' + err.message });
  }
});

router.get('/status', (req, res) => {
  res.json({
    connected: !!tokenStore.accessToken,
    realmId: tokenStore.realmId || null,
    expiresAt: tokenStore.expiresAt || null
  });
});

async function getValidToken() {
  if (!tokenStore.accessToken) return null;
  if (Date.now() > tokenStore.expiresAt - 5 * 60 * 1000) {
    await refreshAccessToken();
  }
  return { accessToken: tokenStore.accessToken, realmId: tokenStore.realmId };
}

module.exports = router;
module.exports.getValidToken = getValidToken;
