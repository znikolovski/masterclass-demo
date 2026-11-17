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
      <div class="search__result-info" role="status" aria-live="polite"></div>
      <div class="search__view-facets"></div>
      <div class="search__facets"></div>
      <div class="search__product-sort"></div>
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
      variant: 'secondary',
    } : {
      children: product.inStock ? 'Add to cart' : 'Out of stock',
      'aria-label': `Add ${product.name} to cart`,
      icon: Icon({ source: 'Cart' }),
      onClick: () => cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]),
      variant: 'primary',
      disabled: !product.inStock,
    })(wrapper);
    return wrapper;
  };

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
          anchor.href = getProductLink(product.urlKey);
          anchor.setAttribute('aria-label', product.name || product.sku);
          tryRenderAemAssetsImage(ctx, {
            alias: product.sku,
            imageProps: defaultImageProps,
            wrapper: anchor,
            params: { width: defaultImageProps.width, height: defaultImageProps.height },
          });
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

  events.on('search/result', (payload) => {
    const total = payload.result?.totalCount || 0;
    block.classList.toggle('product-list-page--empty', total === 0);
    const phrase = payload.request?.phrase;
    $resultInfo.textContent = '';
    const count = document.createElement('span');
    count.textContent = `${total} ${total === 1 ? 'product' : 'products'}`;
    $resultInfo.append(count);
    if (phrase) {
      const strong = document.createElement('strong');
      strong.textContent = `“${phrase}”`;
      $resultInfo.append(' for ', strong);
    }
    const filters = (payload.request?.filter || []).filter((f) => !['visibility', 'categoryPath'].includes(f.attribute));
    const button = $viewFacets.querySelector('button');
    if (filters.length) button?.setAttribute('data-count', filters.length);
    else button?.removeAttribute('data-count');
  }, { eager: true });

  events.on('search/result', (payload) => {
    const next = new URL(window.location.href);
    applySearchStateToUrl(next, payload.request);
    window.history.pushState({}, '', next.toString());
  }, { eager: false });
}
