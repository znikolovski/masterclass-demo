import { createElement } from '@dropins/tools/preact-bundle.js';

export default function groupDiscounts(lineItems) {
  return lineItems.map((item) => {
    if (item.key !== 'discountsContent' || !item.content) return item;
    return {
      ...item,
      content: createElement(
        'section',
        { className: 'cart__discounts', 'aria-label': 'Discounts' },
        createElement('h3', null, 'Discounts'),
        item.content,
      ),
    };
  });
}
