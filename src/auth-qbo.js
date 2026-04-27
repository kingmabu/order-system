/**
 * QuickBooks Online OAuth2 Authorization Script
 *
 * Run once to obtain and save access + refresh tokens to tokens.json.
 * Tokens are then used by the main app to call the QBO API.
 *
 * Usage: node src/auth-qbo.js
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const {
  QBO_CLIENT_ID,
  QBO_CLIENT_SECRET,
  QBO_REDIRECT_URI = 'http://localhost:3000/callback',
  QBO_SANDBOX = 'true',
} = process.env;

if (!QBO_CLIENT_ID || !QBO_CLIENT_SECRET) {
  console.error('Missing QBO_CLIENT_ID or QBO_CLIENT_SECRET in .env');
  process.exit(1);
}

const TOKENS_PATH = path.join(__dirname, '..', 'tokens.json');
const PORT = new URL(QBO_REDIRECT_URI).port || 3000;

const SCOPES = [
  'com.intuit.quickbooks.accounting',
].join(' ');

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

// Build the authorization URL
const authParams = new URLSearchParams({
  client_id: QBO_CLIENT_ID,
  response_type: 'code',
  scope: SCOPES,
  redirect_uri: QBO_REDIRECT_URI,
  state: 'qbo_auth_' + Date.now(),
});

const authorizationUrl = `${AUTH_URL}?${authParams.toString()}`;

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code) {
  const credentials = Buffer.from(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: QBO_REDIRECT_URI,
  }).toString();

  return new Promise((resolve, reject) => {
    const reqUrl = new URL(TOKEN_URL);
    const options = {
      hostname: reqUrl.hostname,
      path: reqUrl.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Token error: ${parsed.error} — ${parsed.error_description}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Failed to parse token response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Start local callback server
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const { code, realmId, error } = parsed.query;

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Authorization failed</h2><p>${error}</p>`);
    console.error('\nAuthorization denied:', error);
    server.close();
    process.exit(1);
  }

  if (!code || !realmId) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>Missing code or realmId</h2>');
    server.close();
    process.exit(1);
  }

  try {
    console.log('\nAuthorization code received. Exchanging for tokens...');
    const tokens = await exchangeCodeForTokens(code);

    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      x_refresh_token_expires_in: tokens.x_refresh_token_expires_in,
      realm_id: realmId,
      sandbox: QBO_SANDBOX === 'true',
      created_at: new Date().toISOString(),
    };

    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokenData, null, 2));
    console.log('Tokens saved to tokens.json');
    console.log(`  Realm ID: ${realmId}`);
    console.log(`  Sandbox:  ${tokenData.sandbox}`);
    console.log(`  Expires in: ${tokens.expires_in}s`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <h2 style="color:green">Authorization successful!</h2>
      <p>Tokens saved to <strong>tokens.json</strong>. You can close this tab.</p>
      <pre>Realm ID: ${realmId}</pre>
    `);
  } catch (err) {
    console.error('\nFailed to exchange tokens:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>Token exchange failed</h2><p>${err.message}</p>`);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('QuickBooks Online OAuth2 Authorization');
  console.log('='.repeat(60));
  console.log(`\nLocal callback server listening on port ${PORT}`);
  console.log('\nOpen the following URL in your browser to authorize:\n');
  console.log(authorizationUrl);
  console.log('\n' + '='.repeat(60));
  console.log('Waiting for authorization...');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Stop any running server and retry.`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
