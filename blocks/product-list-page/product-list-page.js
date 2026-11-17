/*
 * Product list page — Adobe Commerce product discovery drop-in (category listing or search).
 * Authoring (key/value rows):
 *   type       (optional) category (default) | search — search reads ?q= from the URL
 *   category   (optional) category path, e.g. apparel or apparel/jackets; empty = all products
 *   page-size  (optional) products per page, default 12
 * Adapted from hlxsites/aem-boilerplate-commerce (Apache-2.0). Product images are rendered
 * from Dynamic Media OpenAPI via tryRenderAemAssetsImage.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { initializeCommerce, getProductLink } from '../../scripts/commerce.js';
import { getSearchStateFromUrl, applySearchStateToUrl } from './search-url.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const attr = (product, name) => product.attributes?.find((a) => a.name === name)?.value;

/** Up to two short spec fragments for the card spec bar, e.g. "410 g · 20 000 mm". */
function cardSpecs(product) {
  const specs = [];
  const weight = attr(product, 'weight_g');
  if (weight) specs.push(`${new Intl.NumberFormat('en-AU').format(Number(weight))} g`);
  const capacity = attr(product, 'capacity_l');
  if (capacity) specs.push(`${capacity} L`);
  const waterproof = attr(product, 'waterproof_rating');
  if (waterproof) specs.push(String(waterproof));
  if (specs.length < 2) {
    const material = String(attr(product, 'material') || '').split(',')[0].trim();
    if (material) specs.push(material);
  }
  return specs.slice(0, 2);
}

function priceOf(product) {
  const p = product.price || product.priceRange?.minimum;
  return { final: p?.final?.amount?.value, regular: p?.regular?.amount?.value };
}

function cardBadges(product) {
  const badges = [];
  const { final, regular } = priceOf(product);
  if (final && regular && final < regular) {
    badges.push(['sale', `Sale −${Math.round((1 - final / regular) * 100)}%`]);
  }
  if (product.inStock === false) badges.push(['muted', 'Sold out']);
  const material = String(attr(product, 'material') || '').split(',')[0].trim();
  if (material && material.length <= 28) badges.push(['', material]);
  return badges.slice(0, 2);
}

const filterValueLabel = (filter) => {
  if (!filter.range) return filter.eq;
  const { from, to } = filter.range;
  return to == null ? `$${from}+` : `$${from}–$${to}`;
};

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const pageSize = parseInt(config['page-size'] || config.pagesize, 10) || 12;
  const isSearch = (config.type || '').toLowerCase() === 'search';
  const category = isSearch ? '' : (config.category || '').replace(/^\/|\/$/g, '');

  await initializeCommerce();
  await import('../../scripts/initializers/search.js');
  const [
    { default: SearchResults }, { default: Facets }, { default: SortBy }, { default: Pagination },
    { render: provider }, { Button, Icon, provider: UI }, { search }, cartApi,
    { tryRenderAemAssetsImage }, { events },
  ] = await Promise.all([
    import('@dropins/storefront-product-discovery/containers/SearchResults.js'),
    import('@dropins/storefront-product-discovery/containers/Facets.js'),
    import('@dropins/storefront-product-discovery/containers/SortBy.js'),
    import('@dropins/storefront-product-discovery/containers/Pagination.js'),
    import('@dropins/storefront-product-discovery/render.js'),
    import('@dropins/tools/components.js'),
    import('@dropins/storefront-product-discovery/api.js'),
    import('@dropins/storefront-cart/api.js'),
    import('@dropins/tools/lib/aem/assets.js'),
    import('@dropins/tools/event-bus.js'),
  ]);

  const fragment = document.createRange().createContextualFragment(`
    <div class="search__wrapper">
      <div class="search__top">
        <form class="search__query" role="search" hidden>
          <label class="shop-eyebrow" for="plp-search-q">Search the gear depot</label>
          <div class="search__query-row">
            <input id="plp-search-q" type="search" name="q" autocomplete="off" placeholder="Jackets, packs, bottles…">
            <button type="submit" class="search__submit">Search</button>
          </div>
        </form>
        <nav class="search__categories" aria-label="Categories" hidden></nav>
        <div class="search__active-filters" hidden></div>
      </div>
      <div class="search__toolbar">
        <div class="search__result-info" role="status" aria-live="polite"></div>
        <div class="search__product-sort"></div>
      </div>
      <div class="search__view-facets"></div>
      <div class="search__facets"></div>
      <div class="search__product-list"></div>
      <div class="search__pagination"></div>
    </div>`);
  const $ = (s) => fragment.querySelector(s);
  const $resultInfo = $('.search__result-info');
  const $viewFacets = $('.search__view-facets');
  const $facets = $('.search__facets');
  const $productSort = $('.search__product-sort');
  const $productList = $('.search__product-list');
  const $pagination = $('.search__pagination');
  const $query = $('.search__query');
  const $categories = $('.search__categories');
  const $activeFilters = $('.search__active-filters');
  block.replaceChildren(fragment);

  const url = new URL(window.location.href);
  // the site-wide search uses ?q=; the drop-in URL state uses ?q as well
  const searchState = getSearchStateFromUrl(url);
  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  const userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');
  applySearchStateToUrl(url, searchState);
  window.history.replaceState({}, '', url.toString());

  const defaultSort = isSearch ? [] : [{ attribute: 'position', direction: 'ASC' }];
  await search({
    phrase: isSearch ? searchState.phrase : '',
    currentPage: searchState.currentPage,
    pageSize,
    sort: searchState.sort?.length ? searchState.sort : defaultSort,
    filter: [
      ...(category ? [{ attribute: 'categoryPath', eq: category }] : []),
      visibilityFilter,
      ...userFilters,
    ],
  }).catch((e) => console.error('Product search failed', e));

  const actionButton = (product) => {
    const wrapper = document.createElement('div');
    const configurable = product.typename === 'ComplexProductView';
    UI.render(Button, configurable ? {
      children: 'Choose options',
      'aria-label': `Choose options for ${product.name}`,
      href: getProductLink(product.urlKey),
      variant: 'primary',
    } : {
      children: product.inStock ? 'Add to cart' : 'Sold out',
      'aria-label': `Add ${product.name} to cart`,
      icon: Icon({ source: 'Cart' }),
      onClick: () => cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]),
      variant: 'primary',
      disabled: !product.inStock,
    })(wrapper);
    return wrapper;
  };

  let lastRequest;
  const rerun = (patch) => search({ ...lastRequest, currentPage: 1, ...patch })
    .catch((e) => console.error('Product search failed', e));

  await Promise.all([
    provider.render(SortBy, {})($productSort),
    provider.render(Pagination, { onPageChange: () => window.scrollTo({ top: 0, behavior: 'smooth' }) })($pagination),
    UI.render(Button, {
      children: 'Filters',
      icon: Icon({ source: 'Burger' }),
      variant: 'secondary',
      onClick: () => $facets.classList.toggle('search__facets--visible'),
    })($viewFacets),
    provider.render(Facets, {})($facets),
    provider.render(SearchResults, {
      routeProduct: (product) => getProductLink(product.urlKey),
      slots: {
        ProductImage: (ctx) => {
          const { product, defaultImageProps } = ctx;
          const anchor = document.createElement('a');
          anchor.className = 'shop-card__media';
          anchor.href = getProductLink(product.urlKey);
          anchor.setAttribute('aria-label', product.name || product.sku);
          const image = el('span', 'shop-card__image');
          anchor.append(image);
          // render into an inner holder so the badges and spec bar can sit on the image
          tryRenderAemAssetsImage({ ...ctx, replaceWith: () => {} }, {
            alias: product.sku,
            imageProps: defaultImageProps,
            wrapper: image,
            params: { width: defaultImageProps.width, height: defaultImageProps.height },
          });
          ctx.replaceWith(anchor);
          const badges = cardBadges(product);
          if (badges.length) {
            const list = el('span', 'shop-badges');
            badges.forEach(([variant, text]) => {
              list.append(el('span', `shop-badge${variant ? ` shop-badge--${variant}` : ''}`, text));
            });
            anchor.append(list);
          }
          const specs = cardSpecs(product);
          if (specs.length) anchor.append(el('span', 'shop-card__specbar', `Specs: ${specs.join(' / ')}`));
        },
        ProductName: (ctx) => {
          const { product } = ctx;
          const wrapper = el('div', 'shop-card__heading');
          const activity = attr(product, 'activity');
          if (activity) wrapper.append(el('span', 'shop-eyebrow', activity));
          const link = el('a', 'shop-card__name', product.name);
          link.href = getProductLink(product.urlKey);
          wrapper.append(link);
          ctx.replaceWith(wrapper);
        },
        ProductActions: (ctx) => {
          const actions = document.createElement('div');
          actions.className = 'product-discovery-product-actions';
          actions.append(actionButton(ctx.product));
          ctx.replaceWith(actions);
        },
      },
    })($productList),
  ]);

  let childCategories = [];
  const renderCategories = (payload) => {
    if (isSearch) return;
    const filters = payload.request?.filter || [];
    const selected = filters.find((f) => f.attribute === 'categoryPath' && f.in)?.in?.[0];
    const buckets = payload.result?.facets?.find((f) => f.attribute === 'categoryPath')?.buckets || [];
    const depth = category ? category.split('/').length + 1 : 1;
    const children = buckets.filter((b) => b.path && b.path.split('/').length === depth
      && (!category || b.path.startsWith(`${category}/`)));
    if (!selected && children.length) childCategories = children;
    $categories.hidden = childCategories.length < 2;
    if ($categories.hidden) return;
    $categories.replaceChildren();
    const chip = (label, path, count) => {
      const button = el('button', 'search__category', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String((path || null) === (selected || null)));
      if (count != null) button.append(el('span', 'search__category-count', String(count)));
      button.addEventListener('click', () => rerun({
        filter: [
          ...lastRequest.filter.filter((f) => !(f.attribute === 'categoryPath' && f.in)),
          ...(path ? [{ attribute: 'categoryPath', in: [path] }] : []),
        ],
      }));
      return button;
    };
    $categories.append(chip('All', null));
    childCategories.forEach((c) => $categories.append(chip(c.title || c.name, c.path, c.count)));
  };

  const renderActiveFilters = (payload) => {
    const facets = payload.result?.facets || [];
    const filters = (payload.request?.filter || []).filter((f) => f.attribute !== 'visibility'
      && f.attribute !== 'categoryPath');
    $activeFilters.replaceChildren();
    $activeFilters.hidden = !filters.length;
    if (!filters.length) return;
    $activeFilters.append(el('span', 'shop-eyebrow', 'Applied'));
    filters.forEach((filter) => {
      const title = facets.find((f) => f.attribute === filter.attribute)?.title || filter.attribute;
      const values = filter.in || [filterValueLabel(filter)];
      values.forEach((value) => {
        const button = el('button', 'search__active-filter', `${title}: ${value}`);
        button.type = 'button';
        button.setAttribute('aria-label', `Remove filter ${title}: ${value}`);
        button.addEventListener('click', () => rerun({
          filter: lastRequest.filter.flatMap((f) => {
            if (f.attribute !== filter.attribute) return [f];
            const rest = (f.in || []).filter((v) => v !== value);
            return rest.length ? [{ ...f, in: rest }] : [];
          }),
        }));
        $activeFilters.append(button);
      });
    });
    const reset = el('button', 'search__reset-filters', 'Reset all');
    reset.type = 'button';
    reset.addEventListener('click', () => rerun({
      filter: lastRequest.filter.filter((f) => f.attribute === 'visibility'
        || (f.attribute === 'categoryPath' && !f.in)),
    }));
    $activeFilters.append(reset);
  };

  if (isSearch) {
    $query.hidden = false;
    const input = $query.querySelector('input');
    input.value = searchState.phrase || '';
    $query.addEventListener('submit', (e) => {
      e.preventDefault();
      rerun({ phrase: input.value.trim() });
    });
  }

  events.on('search/result', (payload) => {
    lastRequest = payload.request;
    const total = payload.result?.totalCount || 0;
    block.classList.toggle('product-list-page--empty', total === 0);
    const phrase = payload.request?.phrase;
    $resultInfo.textContent = '';
    const count = el('span', 'search__count', `${total} ${total === 1 ? 'product' : 'products'}`);
    $resultInfo.append(count);
    if (phrase) {
      count.append(' for ');
      count.append(el('strong', '', `“${phrase}”`));
    }
    const applied = (payload.request?.filter || [])
      .filter((f) => !['visibility', 'categoryPath'].includes(f.attribute));
    const button = $viewFacets.querySelector('button');
    if (applied.length) button?.setAttribute('data-count', applied.length);
    else button?.removeAttribute('data-count');
    renderCategories(payload);
    renderActiveFilters(payload);
  }, { eager: true });

  events.on('search/result', (payload) => {
    const next = new URL(window.location.href);
    applySearchStateToUrl(next, payload.request);
    window.history.pushState({}, '', next.toString());
  }, { eager: false });
}
