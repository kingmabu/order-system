/**
 * routes/pricing.js - 価格決定ロジック（純粋関数）
 *
 * Custom Prices System Phase 3。
 * Customer ID + SKU + 商品データ + Custom Prices + Client list を入力に、
 * インボイス単価を決定する純粋関数群。
 *
 * 価格ルール（QBO本番Pricing Rulesと一致させる）: // ← 変更（5分類対応）
 *   - Standard       → Item List ベース価格そのまま
 *   - Group A (12社) → ベース価格 × 1.020（+2.00%）
 *   - Group B (6社)  → Custom Prices の "GROUP_B" 共有設定を使用 / 未登録ならStandardフォールバック
 *   - Group C (4社)  → Custom Prices の "GROUP_C" 共有設定を使用 / 未登録ならStandardフォールバック
 *   - Group D (5社)  → Custom Prices の "GROUP_D" 共有設定を使用 / 未登録ならStandardフォールバック // ← 変更（Ramen Joint-Aikan）
 *   - Individual (9社) → Custom Prices の Customer ID 検索 / 未登録ならStandardフォールバック
 */

const { normalizeId } = require('./sheets-client');

const GROUP_A_MARKUP = 0.020; // +2.00%（QBO本番 Pricing Rules: Jinya Group = Fixed 2.00%）
const GROUP_A_ROUND_TO = 0.05; // ← 変更: QBO Price Rule(Jinya Group)の Rounding=.05（次の$0.05へ切り上げ）と一致

// Group B / Group C / Group D は Custom Prices シートで疑似Customer IDを使って共有価格を持つ // ← 変更
const GROUP_B_LOOKUP_KEY = 'GROUP_B'; // ← 変更
const GROUP_C_LOOKUP_KEY = 'GROUP_C'; // ← 変更
const GROUP_D_LOOKUP_KEY = 'GROUP_D'; // ← 変更（Ramen Joint-Aikan 5社共通）

/**
 * 価格を小数点以下2桁に丸める
 */
function roundPrice(price) {
  return Math.round(price * 100) / 100;
}

/**
 * price を increment 単位に「切り上げ」る（QBO Price Rule の Rounding と一致）。 // ← 変更
 * 例: roundUpTo(23.205, 0.05) → 23.25（QBO Jinya Group: +2% & Rounding .05 と同じ挙動）。
 * 浮動小数の誤差で過剰に切り上がるのを防ぐため、先に微小桁で丸めてから ceil する。
 */
function roundUpTo(price, increment) {
  const units = Math.round((price / increment) * 1e6) / 1e6;
  return roundPrice(Math.ceil(units) * increment);
}

/**
 * priceGroup から Custom Prices シートの lookup key を決定 // ← 変更（共通化）
 *  - Group B    → 'GROUP_B'
 *  - Group C    → 'GROUP_C'
 *  - Group D    → 'GROUP_D' // ← 変更
 *  - Individual → 顧客自身のCustomer ID
 *  - それ以外    → null（Custom Prices は引かない）
 */
function getCustomLookupKey(priceGroup, normalizedCustomerId) {
  if (priceGroup === 'Group B') return GROUP_B_LOOKUP_KEY;
  if (priceGroup === 'Group C') return GROUP_C_LOOKUP_KEY;
  if (priceGroup === 'Group D') return GROUP_D_LOOKUP_KEY; // ← 変更
  if (priceGroup === 'Individual') return normalizedCustomerId;
  return null;
}

/**
 * 1つのSKUに対する価格決定（純粋関数）
 *
 * @param {Object} params
 * @param {string} params.customerId - Customer ID（正規化前でもOK）
 * @param {string} params.sku - SKU（例: 'B033'）
 * @param {Array} params.clients - Client list 全件（loadAllClients の戻り値）
 * @param {Array} params.items - Item List 全件（loadAllItems の戻り値）
 * @param {Array} params.customPrices - Custom Prices 全件（loadAllCustomPrices の戻り値）
 * @return {Object} {
 *   sku, customerId, priceGroup, basePrice, finalPrice, isUnit,
 *   source: 'custom' | 'group-a' | 'standard' | 'fallback' | 'error',
 *   item, warning, note
 * }
 */
function determinePrice({ customerId, sku, clients, items, customPrices }) {
  const normId = normalizeId(customerId);
  const skuKey = String(sku || '').trim();
  const item = items.find(i => i.sku === skuKey);

  if (!item) {
    return {
      sku: skuKey,
      customerId: normId,
      finalPrice: 0,
      source: 'error',
      warning: `SKU ${skuKey} が Item List に見つかりません`,
    };
  }

  const client = clients.find(c => c.customerId === normId);
  const priceGroup = client ? client.priceGroup : 'Standard';
  const basePrice = item.basePrice;

  // Group B / Group C / Individual → Custom Prices検索（共通ロジック） // ← 変更
  const lookupKey = getCustomLookupKey(priceGroup, normId);
  if (lookupKey) {
    const cp = customPrices.find(p => p.customerId === lookupKey && p.sku === skuKey);
    if (cp && cp.price > 0) {
      return {
        sku: skuKey, customerId: normId, priceGroup,
        basePrice, finalPrice: roundPrice(cp.price),
        isUnit: item.isUnit,
        source: 'custom',
        item,
        note: cp.note || null,
      };
    }
    // 見つからない → Standard扱いでフォールバック
    return {
      sku: skuKey, customerId: normId, priceGroup,
      basePrice, finalPrice: roundPrice(basePrice),
      isUnit: item.isUnit,
      source: 'fallback',
      item,
      warning: `Customer ${normId} は ${priceGroup} ですが、SKU ${skuKey} の Custom Price が未登録のため Standard を使用`, // ← 変更（priceGroup名を含める）
    };
  }

  // Group A → +2.00% → $0.05単位に切り上げ（QBO Price Rule と一致） // ← 変更
  if (priceGroup === 'Group A') {
    const adjusted = roundUpTo(basePrice * (1 + GROUP_A_MARKUP), GROUP_A_ROUND_TO);
    return {
      sku: skuKey, customerId: normId, priceGroup,
      basePrice, finalPrice: adjusted,
      isUnit: item.isUnit,
      source: 'group-a',
      item,
    };
  }

  // Standard
  return {
    sku: skuKey, customerId: normId, priceGroup: 'Standard',
    basePrice, finalPrice: roundPrice(basePrice),
    isUnit: item.isUnit,
    source: 'standard',
    item,
  };
}

/**
 * 注文全体（複数SKU）の価格決定をまとめて実行
 *
 * @param {Object} order - { customerId, items: [{ sku, qty }, ...] }
 * @param {Object} dataSources - { clients, items, customPrices }
 * @return {Array} [{ sku, qty, ...determinedPrice, lineTotal }, ...]
 */
function determinePricesForOrder(order, dataSources) {
  const { customerId, items: orderItems } = order;
  const { clients, items, customPrices } = dataSources;

  return (orderItems || []).map(orderItem => {
    const qty = Number(orderItem.qty || orderItem.quantity || 0);
    const decided = determinePrice({
      customerId,
      sku: orderItem.sku,
      clients, items, customPrices,
    });
    return {
      ...decided,
      qty,
      lineTotal: roundPrice(decided.finalPrice * qty),
    };
  });
}

module.exports = {
  determinePrice,
  determinePricesForOrder,
  roundPrice,
  roundUpTo, // ← 変更（テスト・参照用）
  GROUP_A_MARKUP,
  GROUP_A_ROUND_TO, // ← 変更
  GROUP_B_LOOKUP_KEY, // ← 変更（テストや他モジュールから参照可能に）
  GROUP_C_LOOKUP_KEY, // ← 変更
  GROUP_D_LOOKUP_KEY, // ← 変更
  getCustomLookupKey, // ← 変更
};
