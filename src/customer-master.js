// Maps Tally/webhook shop_id values to display names and QBO Customer IDs
const CUSTOMER_MAP = {
  takasei: { display_name: 'Takasei HB', qbo_id: '1333' },
  tot:     { display_name: 'TOT',        qbo_id: '012'  },
};

/**
 * Look up a customer by shop_id.
 * @param {string} shopId
 * @returns {{ shop_id: string, display_name: string }}
 */
function getCustomer(shopId) {
  const id = shopId?.toLowerCase().trim();
  const customer = CUSTOMER_MAP[id];
  if (!customer) {
    throw new Error(`Unknown shop_id: "${shopId}". Add it to src/customer-master.js`);
  }
  return { shop_id: id, ...customer };
}

module.exports = { getCustomer, CUSTOMER_MAP };
