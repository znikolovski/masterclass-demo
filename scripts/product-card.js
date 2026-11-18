/**
 * Product card details shared by the search/category grid (product-list-page) and the
 * Commerce cards block. Leaf module with no drop-in imports, so any page can use it.
 * Input is a Catalog Service ProductView (price/priceRange, inStock, attributes).
 */

export const productAttr = (product, name) => product.attributes
  ?.find((a) => a.name === name)?.value;

/** Final and regular price amounts; configurable products use the cheapest variant. */
export function priceOf(product) {
  const p = product.price || product.priceRange?.minimum;
  return { final: p?.final?.amount, regular: p?.regular?.amount };
}

/** Whole-number percentage off when an active discount applies, otherwise 0. */
export function discountPercent(product) {
  const { final, regular } = priceOf(product);
  if (!(final?.value > 0) || !(regular?.value > final.value)) return 0;
  return Math.round((1 - final.value / regular.value) * 100);
}

/** Up to two short spec fragments for the image spec bar, e.g. "410 g / 20,000 mm". */
export function cardSpecs(product) {
  const specs = [];
  const weight = productAttr(product, 'weight_g');
  if (weight) specs.push(`${new Intl.NumberFormat('en-AU').format(Number(weight))} g`);
  const capacity = productAttr(product, 'capacity_l');
  if (capacity) specs.push(`${capacity} L`);
  const waterproof = productAttr(product, 'waterproof_rating');
  if (waterproof) specs.push(String(waterproof));
  if (specs.length < 2) {
    const material = String(productAttr(product, 'material') || '').split(',')[0].trim();
    if (material) specs.push(material);
  }
  return specs.slice(0, 2);
}

/** Up to two [variant, text] badges: sale percentage, sold out, then the main material. */
export function cardBadges(product) {
  const badges = [];
  const percent = discountPercent(product);
  if (percent) badges.push(['sale', `Sale −${percent}%`]);
  if (product.inStock === false) badges.push(['muted', 'Sold out']);
  const material = String(productAttr(product, 'material') || '').split(',')[0].trim();
  if (material && material.length <= 28) badges.push(['', material]);
  return badges.slice(0, 2);
}
