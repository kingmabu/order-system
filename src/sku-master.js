// Maps SKU codes to human-readable product names
// Add or update entries here as your product catalogue grows
const SKU_MAP = {
  // Beef
  B002: 'Beef Chuck Roll',
  B018: 'Beef Ribeye',
  B019: 'Beef Tenderloin',
  B020: 'Beef Striploin',
  B021: 'Beef Brisket',

  // Chicken
  C004: 'Chicken Thigh Boneless',
  C005: 'Chicken Breast',
  C010: 'Chicken Wing',
  C094: 'Chicken Drumstick',

  // Pork
  P002: 'Pork Belly',
  P005: 'Pork Shoulder',
  P010: 'Pork Loin',
};

/**
 * Look up a product name by SKU.
 * @param {string} sku
 * @returns {string} product name, or "Unknown Product" if not in master
 */
function getProductName(sku) {
  return SKU_MAP[sku?.toUpperCase()] || `Unknown Product (${sku})`;
}

module.exports = { getProductName, SKU_MAP };
