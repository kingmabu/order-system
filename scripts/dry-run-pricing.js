/**
 * scripts/dry-run-pricing.js - Custom Prices System dry-run 価格検証
 *
 * 開発用スプレッドシート（Custom Prices / Client list / Item List）を読み込み、
 * 各分類（Standard / Group A / Group B / Group C / Individual）の代表顧客で
 * determinePrice の結果を表示する。QBOには一切送信しない（読み取りのみ）。
 *
 * 実行:
 *   node -r dotenv/config scripts/dry-run-pricing.js dotenv_config_path=.env.development
 *
 * 注意:
 *   - .env.development には GOOGLE_SERVICE_ACCOUNT が無く PROD_GOOGLE_SERVICE_ACCOUNT のみ
 *     のため、本スクリプト内で橋渡しする（読み取り専用スコープ）。
 *   - 開発用シートがサービスアカウントに共有されている必要がある。
 */

// PROD_ サービスアカウントを GOOGLE_SERVICE_ACCOUNT に橋渡し（プレーンが無い場合のみ）
if (!process.env.GOOGLE_SERVICE_ACCOUNT && process.env.PROD_GOOGLE_SERVICE_ACCOUNT) {
  process.env.GOOGLE_SERVICE_ACCOUNT = process.env.PROD_GOOGLE_SERVICE_ACCOUNT;
}

const { loadAllDataSources } = require('../routes/sheets-client');
const { determinePrice } = require('../routes/pricing');

function fmt(n) {
  return (typeof n === 'number' && isFinite(n)) ? '$' + n.toFixed(2) : String(n);
}

async function main() {
  console.log('=== Custom Prices System dry-run 価格検証 ===');
  console.log('COST_LIST_ID  :', process.env.COST_LIST_ID);
  console.log('ITEM_LIST_ID  :', process.env.ITEM_LIST_ID);
  console.log('CLIENT_INFO_ID:', process.env.CLIENT_INFO_ID);
  console.log('QBO_MODE      :', process.env.QBO_MODE);
  console.log('');

  const { customPrices, clients, items } = await loadAllDataSources();
  console.log(`読み込み: Custom Prices ${customPrices.length}件 / Client list ${clients.length}件 / Item List ${items.length}件`);
  console.log('');

  // 分類ごとに代表顧客を1社ずつ自動抽出
  const byGroup = {};
  for (const c of clients) {
    if (!byGroup[c.priceGroup]) byGroup[c.priceGroup] = c;
  }

  // テスト対象SKU：量り売り1つ・箱売り1つを自動抽出
  const weightItem = items.find(i => !i.isUnit && i.basePrice > 0);
  const boxItem = items.find(i => i.isUnit && i.basePrice > 0);

  // Custom Price が登録されている (customerId, sku) のサンプルも拾う
  const cpSamples = customPrices.slice(0, 5);

  console.log('--- 代表SKU ---');
  if (weightItem) console.log(`量り売り: ${weightItem.sku} ${weightItem.itemName} 標準=${fmt(weightItem.basePrice)}`);
  if (boxItem)    console.log(`箱売り  : ${boxItem.sku} ${boxItem.itemName} 標準=${fmt(boxItem.basePrice)}`);
  console.log('');

  const testSkus = [weightItem, boxItem].filter(Boolean).map(i => i.sku);

  console.log('--- 分類別 価格決定 ---');
  for (const group of ['Standard', 'Group A', 'Group B', 'Group C', 'Individual']) {
    const client = byGroup[group];
    if (!client) {
      console.log(`[${group}] 代表顧客なし（このグループの顧客が見つからない）`);
      continue;
    }
    console.log(`[${group}] 代表: ${client.customerName} (${client.customerId})`);
    for (const sku of testSkus) {
      const r = determinePrice({ customerId: client.customerId, sku, clients, items, customPrices });
      const flag = (r.finalPrice === 0 && r.source !== 'error') ? '  ⚠ $0!' : '';
      console.log(`   ${sku}: ${fmt(r.finalPrice)}  [${r.source}] 標準=${fmt(r.basePrice)}${flag}` + (r.warning ? `  (${r.warning})` : ''));
    }
  }
  console.log('');

  console.log('--- Custom Price 登録分の実値検証（先頭5件）---');
  for (const cp of cpSamples) {
    // この customerId が Individual / GROUP_C などどれでもそのまま検証
    // 検索元の顧客を特定（GROUP_B/C は擬似ID）
    let testCustomerId = cp.customerId;
    if (cp.customerId === 'GROUP_B') {
      const m = clients.find(c => c.priceGroup === 'Group B'); testCustomerId = m ? m.customerId : null;
    } else if (cp.customerId === 'GROUP_C') {
      const m = clients.find(c => c.priceGroup === 'Group C'); testCustomerId = m ? m.customerId : null;
    }
    if (!testCustomerId) { console.log(`   ${cp.customerId} ${cp.sku}: 対応顧客なし（スキップ）`); continue; }
    const r = determinePrice({ customerId: testCustomerId, sku: cp.sku, clients, items, customPrices });
    const ok = Math.abs(r.finalPrice - cp.price) < 0.005 ? 'OK' : 'DIFF';
    console.log(`   ${cp.customerId}→${testCustomerId} ${cp.sku}: 期待=${fmt(cp.price)} 結果=${fmt(r.finalPrice)} [${r.source}] ${ok}`);
  }

  console.log('');
  console.log('=== 検証完了（QBO送信なし・読み取りのみ）===');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (/permission|PERMISSION|403|does not have access/.test(err.message)) {
    console.error('');
    console.error('→ 開発用シートがサービスアカウントに共有されていない可能性があります。');
    console.error('  以下のメールアドレスを各開発用シートの「共有」に閲覧者として追加してください:');
    console.error('  order-system@order-system-492319.iam.gserviceaccount.com');
  }
  process.exit(1);
});
