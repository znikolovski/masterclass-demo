/**
 * Shop promise list (shipping, warranty, …) shared by PDP, cart and checkout.
 * Dependency-free so the PDP can render it before any drop-in code loads.
 */
const PROMISE_ICONS = {
  shipping: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
  warranty: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  tested: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  demo: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 10h18M7 15h4"/>',
};

export const SHOP_PROMISES = {
  shipping: ['Free standard shipping', 'Australia-wide on orders over $150'],
  warranty: ['3-year Trail Promise', 'Repairs or replacement on every WKND product'],
  tested: ['Guide tested', 'Proven by WKND guides on real expeditions'],
  demo: ['Demo payment', 'WKND Demo Pay — nothing is charged or shipped'],
};

/**
 * Promise list (icon, title, caption) used on PDP, cart and checkout.
 * @param {Array<keyof SHOP_PROMISES>} keys
 * @param {string} [className]
 */
export function shopPromises(keys, className = 'shop-promises') {
  const ul = document.createElement('ul');
  ul.className = className;
  keys.forEach((key) => {
    const [title, caption] = SHOP_PROMISES[key];
    const li = document.createElement('li');
    li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PROMISE_ICONS[key]}</svg><span><strong></strong></span>`;
    li.querySelector('strong').textContent = title;
    li.querySelector('span').append(caption);
    ul.append(li);
  });
  return ul;
}
