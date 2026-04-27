const OAuthClient = require('intuit-oauth');
require('dotenv').config();

const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: 'sandbox',
  redirectUri: 'http://localhost:3000/callback'
});

oauthClient.setToken({
  access_token: process.env.QBO_ACCESS_TOKEN,
  refresh_token: process.env.QBO_REFRESH_TOKEN,
  realmId: process.env.QBO_REALM_ID
});

const url = 'https://intuit.com' + process.env.QBO_REALM_ID + '/query?query=select * from Item&minorversion=65';

oauthClient.makeApiCall({ url }).then(r => {
  console.log('--- ITEM LIST ---');
  if(r.json.QueryResponse.Item) {
    r.json.QueryResponse.Item.forEach(item => {
      console.log('Name:', item.Name, '| SKU:', item.Sku);
    });
  } else {
    console.log('No items found');
  }
}).catch(e => console.error(e.response ? e.response.text : e.message));
