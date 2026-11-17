/*
 * Product recommendations — Adobe Commerce recommendations drop-in.
 * Authoring (key/value rows):
 *   unit-id  (required) wknd-pdp-more-like-this | wknd-pdp-complete-kit | wknd-cart-addons |
 *            wknd-trending | wknd-recently-viewed | wknd-of1-gear | wknd-category-top
 *   heading  (optional) overrides the unit's storefront label
 *   sku      (optional) anchor product; defaults to the PDP's `sku` metadata
 *   context  (optional) free text (e.g. an adventure) resolved to an anchor product via
 *            product search — used by OF1 generated pages
 *   adventure (optional) comma-separated adventure slugs (product `adventure` tags, e.g.
 *            patagonia-trek) that constrain the anchor product — used by OF1 generated pages
 */
import { events } from '@dropins/tools/event-bus.js';
import { Button, Icon, provider as UI } from '@dropins/tools/components.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import { readBlockConfig } from '../../scripts/aem.js';
import {
  initializeCommerce, getProductLink, getProductSku, CS_FETCH_GRAPHQL,
} from '../../scripts/commerce.js';
import { getProductViewHistory } from '../../scripts/shop-analytics.js';

const CONTEXT_SEARCH = `query productSearch($phrase: String!, $filter: [SearchClauseInput!]) {
  productSearch(phrase: $phrase, page_size: 1, filter: $filter) { items { productView { sku } } }
}`;

async function searchAnchor(phrase, adventures) {
  const { data } = await CS_FETCH_GRAPHQL.fetchGraphQl(CONTEXT_SEARCH, {
    method: 'GET',
    variables: {
      phrase: phrase.slice(0, 120),
      ...(adventures.length ? { filter: [{ attribute: 'adventure', in: adventures }] } : {}),
    },
  });
  return data?.productSearch?.items?.[0]?.productView?.sku;
}

/** Anchor product for free-text/adventure context: adventure + phrase, adventure, phrase. */
async function skuForContext(context = '', adventure = '') {
  const adventures = adventure.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
  const attempts = [
    adventures.length && context ? [context, adventures] : null,
    adventures.length ? ['', adventures] : null,
    context ? [context, []] : null,
  ].filter(Boolean);
  for (let i = 0; i < attempts.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const sku = await searchAnchor(...attempts[i]);
    if (sku) return sku;
  }
  return undefined;
}

function whenNearViewport(el) {
  return new Promise((resolve) => {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        resolve();
      }
    }, { rootMargin: '400px' });
    io.observe(el);
  });
}

async function renderUnit(block, $list, config, unitId) {
  await initializeCommerce();
  await import('../../scripts/initializers/recommendations.js');
  const [{ default: ProductList }, { render: provider }, cartApi] = await Promise.all([
    import('@dropins/storefront-recommendations/containers/ProductList.js'),
    import('@dropins/storefront-recommendations/render.js'),
    import('@dropins/storefront-cart/api.js'),
  ]);

  const currentSku = config.sku || getProductSku()
    || await skuForContext(config.context, config.adventure).catch(() => undefined);
  const cartSkus = (events.lastPayload('cart/data')?.items || []).map((i) => i.topLevelSku || i.sku);

  events.on('recommendations/data', (data) => {
    const units = Array.isArray(data) ? data : [data];
    const unit = units.find((u) => u?.unitId === unitId) || units[0];
    if (!unit?.items?.length) block.closest('.section')?.classList.add('product-recommendations--empty');
  }, { eager: true });

  await provider.render(ProductList, {
    recId: unitId,
    hideHeading: config.hideHeading,
    currentProduct: currentSku ? { sku: currentSku } : undefined,
    currentSku: currentSku || '',
    cartSkus,
    userViewHistory: getProductViewHistory(),
    routeProduct: (item) => getProductLink(item.urlKey),
    slots: {
      // The drop-in's `label` prop selects units by label, so headings are overridden here.
      ...(config.heading ? {
        Heading: (ctx) => {
          const heading = document.createElement('h2');
          heading.textContent = config.heading;
          ctx.replaceWith(heading);
        },
      } : {}),
      Thumbnail: (ctx) => {
        const { item, defaultImageProps } = ctx;
        const wrapper = document.createElement('a');
        wrapper.href = getProductLink(item.urlKey);
        tryRenderAemAssetsImage(ctx, {
          alias: item.sku,
          imageProps: defaultImageProps,
          wrapper,
          params: { width: defaultImageProps.width, height: defaultImageProps.height },
        });
      },
      Footer: (ctx) => {
        const $button = document.createElement('div');
        $button.className = 'product-recommendations__cta';
        const simple = ctx.item.itemType === 'SimpleProductView';
        UI.render(Button, simple ? {
          children: ctx.item.inStock ? 'Add to cart' : 'Out of stock',
          icon: Icon({ source: 'Cart' }),
          variant: 'primary',
          disabled: !ctx.item.inStock,
          onClick: (event) => {
            event.stopPropagation();
            cartApi.addProductsToCart([{ sku: ctx.item.sku, quantity: 1 }]);
          },
        } : {
          children: 'Choose options',
          href: getProductLink(ctx.item.urlKey),
          variant: 'secondary',
        })($button);
        ctx.replaceWith($button);
      },
    },
  })($list);
}

/** True when the author placed a heading directly above the block (avoid a second unit title). */
function hasAuthoredHeading(block) {
  const prev = block.parentElement?.previousElementSibling;
  return !!prev?.classList.contains('default-content-wrapper')
    && /^H[1-6]$/.test(prev.lastElementChild?.tagName || '');
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  config.hideHeading = !config.heading && hasAuthoredHeading(block);
  const unitId = config['unit-id'] || config.unitid;
  block.textContent = '';
  if (!unitId) return;
  block.dataset.unitId = unitId;
  const $list = document.createElement('div');
  $list.className = 'product-recommendations__list';
  block.append($list);
  // Don't await: EDS keeps the section hidden until decorate() resolves, so waiting for
  // visibility here would never resolve.
  whenNearViewport(block).then(() => renderUnit(block, $list, config, unitId))
    .catch((e) => console.error('product-recommendations', e));
}
