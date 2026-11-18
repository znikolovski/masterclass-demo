/**
 * WKND site search modal (Frescopa-style Content AI search).
 *  - Pages: AEM Content AI vector search via the wknd-commerce `content-ai` proxy
 *  - AI summary: Content AI gensearch, shown only when the answer is grounded
 *  - Products: WKND Commerce API Mesh `productSearch` (no drop-ins on non-shop pages)
 *  - Hand-off: "Ask WKND Sherpa" opens the OF1 generative experience with the query
 */
import { loadCSS } from '../../scripts/aem.js';
import {
  CONTENT_AI_BASE, MESH_ENDPOINT, SHOP_PATHS,
} from '../../scripts/commerce-config.js';
import { dmRendition } from '../../scripts/dm-image.js';

const SEARCH_DELAY = 250;
const MIN_QUERY = 2;
const PAGE_LIMIT = 8;
const PRODUCT_LIMIT = 4;
const RECENT_KEY = 'wknd:search:recent';
const MAX_RECENT = 5;
const OF1_PATH = '/of1';

const LABELS = {
  placeholder: 'Search adventures, guides and gear…',
  close: 'Close search',
  recent: 'Recent searches',
  popular: 'Popular right now',
  trending: 'Trending gear',
  products: 'Gear',
  allProducts: 'See all {count} products',
  pages: 'Stories, guides & adventures',
  summary: 'AI summary',
  summaryDisclaimer: 'Generated from WKND content. Check details before you book.',
  sources: 'Sources',
  searching: 'Searching…',
  thinking: 'Summarising WKND content…',
  noResults: 'No pages match “{query}”. Try WKND Sherpa for a tailored answer.',
  error: 'Search is unavailable right now.',
  retry: 'Try again',
  askSherpa: 'Ask WKND Sherpa',
  askSherpaQuery: 'Ask WKND Sherpa about “{query}”',
};
const POPULAR = ['Patagonia trek', 'Waterproof jacket', 'Surf the Azores', 'Packing list', 'Gift ideas'];

const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2" stroke-linecap="round"></path></svg>';
const SPARKLE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 7l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z M5 2v6 M2 5h6 M20 3v4 M18 5h4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

const PRICE_FIELDS = `... on SimpleProductView { price { final { amount { value currency } } regular { amount { value currency } } } }
  ... on ComplexProductView { priceRange { minimum { final { amount { value currency } } regular { amount { value currency } } } } }`;
const PRODUCT_FIELDS = `sku name urlKey images(roles: ["thumbnail"]) { url label } ${PRICE_FIELDS}`;
const PRODUCT_SEARCH = `query WkndSearchProducts($phrase: String!, $size: Int!) {
  productSearch(phrase: $phrase, page_size: $size) { total_count items { productView { ${PRODUCT_FIELDS} } } } }`;
const TRENDING = `query WkndTrendingGear {
  recommendationsByUnitIds(unitIds: ["wknd-trending"]) { results { productsView { ${PRODUCT_FIELDS} } } } }`;

const state = {
  overlay: null,
  lastFocused: null,
  timer: null,
  controller: null,
  requestId: 0,
  trending: null,
};
let els = {};

const format = (template, values = {}) => template
  .replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(values, k) ? String(values[k]) : m));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isSiteHref(href) {
  try {
    const u = new URL(href, window.location.origin);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/* ---------- analytics ---------- */

function pushSearchEvent(event, search = {}) {
  if (document.querySelector('meta[name="analytics"][content="off"]')) return;
  const phrase = (search.phrase || '').slice(0, 100);
  window.adobeDataLayer ||= [];
  window.adobeDataLayer.push({
    event,
    interaction: { label: phrase, block: 'search', detail: search.target || '' },
    search: { source: 'site-search-modal', ...search, phrase },
    // forwarded to the Web SDK as an Analytics link event; mapped by mapShopToAnalytics()
    xdm: {
      eventType: 'siteSearch',
      web: { webInteraction: { type: 'other', name: event, linkClicks: { value: 1 } } },
    },
    data: { wkndSearch: { event, ...search, phrase } },
  });
}

/* ---------- recent searches (local only, never sent anywhere) ---------- */

function getRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((q) => typeof q === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function rememberQuery(query) {
  const q = query.trim().slice(0, 80);
  if (q.length < MIN_QUERY) return;
  try {
    const next = [q, ...getRecent().filter((r) => r.toLowerCase() !== q.toLowerCase())]
      .slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

/* ---------- data ---------- */

async function meshGet(query, variables, signal) {
  const url = new URL(MESH_ENDPOINT);
  url.searchParams.set('query', query.replace(/\s+/g, ' '));
  url.searchParams.set('variables', JSON.stringify(variables));
  const res = await fetch(url, { headers: { Store: 'wknd_au' }, signal });
  if (!res.ok) throw new Error(`Mesh ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

async function contentAi(route, body, signal) {
  const res = await fetch(`${CONTENT_AI_BASE}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Content AI ${route} ${res.status}`);
  return res.json();
}

const searchPages = (query, signal) => contentAi('search', {
  query: { type: 'vector', text: query },
  queryOptions: { pagination: { limit: PAGE_LIMIT } },
}, signal);

const searchProducts = (query, signal) => meshGet(
  PRODUCT_SEARCH,
  { phrase: query, size: PRODUCT_LIMIT },
  signal,
).then((d) => ({
  total: d?.productSearch?.total_count || 0,
  items: (d?.productSearch?.items || []).map((i) => i.productView).filter(Boolean),
}));

async function loadTrending() {
  state.trending ??= meshGet(TRENDING, {})
    .then((d) => d?.recommendationsByUnitIds?.results?.[0]?.productsView?.slice(0, 4) || [])
    .catch(() => []);
  return state.trending;
}

/* ---------- rendering helpers ---------- */

function money(amount) {
  if (!amount || !Number.isFinite(amount.value)) return '';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: amount.currency || 'AUD' })
    .format(amount.value);
}

function productCard(product, position, query) {
  const price = product.price || product.priceRange?.minimum;
  const final = price?.final?.amount;
  const regular = price?.regular?.amount;
  const a = el('a', 'search-product');
  a.href = SHOP_PATHS.product(product.urlKey);
  const media = el('span', 'search-product-media');
  const src = product.images?.[0]?.url;
  if (src) {
    const img = el('img');
    img.src = dmRendition(src, { width: 240, alias: product.urlKey });
    img.alt = '';
    img.width = 120;
    img.height = 150;
    img.loading = 'lazy';
    img.decoding = 'async';
    media.append(img);
  }
  const priceEl = el('span', 'search-product-price', money(final));
  if (regular && final && regular.value > final.value) {
    priceEl.classList.add('is-sale');
    priceEl.append(' ', el('s', '', money(regular)));
  }
  a.append(media, el('span', 'search-product-name', product.name), priceEl);
  a.addEventListener('click', () => {
    rememberQuery(query || '');
    pushSearchEvent('siteSearchClick', {
      phrase: query, target: a.pathname, resultType: 'product', position, sku: product.sku,
    });
  });
  return a;
}

function group(title, className = '') {
  const section = el('section', `search-group ${className}`.trim());
  section.append(el('h2', 'search-group-title', title));
  return section;
}

function chip(text, recent = false) {
  const btn = el('button', `search-chip${recent ? ' is-recent' : ''}`, text);
  btn.type = 'button';
  btn.dataset.query = text;
  return btn;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Minimal, escape-first markdown (bold, links, bullet lists) for the AI summary. */
export function renderSummaryHtml(text) {
  const inline = (line) => escapeHtml(line)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
      const decoded = href.replace(/&amp;/g, '&');
      return isSiteHref(decoded) ? `<a href="${escapeHtml(decoded)}">${label}</a>` : label;
    });
  let html = '';
  let list = false;
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) {
      if (!list) html += '<ul>';
      list = true;
      html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
      return;
    }
    if (list) html += '</ul>';
    list = false;
    if (line) html += `<p>${inline(line)}</p>`;
  });
  if (list) html += '</ul>';
  return html;
}

function sherpaHref(query) {
  const url = new URL(OF1_PATH, window.location.origin);
  if (query) url.searchParams.set('q', query);
  return `${url.pathname}${url.search}`;
}

/* ---------- panels ---------- */

async function renderDefault() {
  const { defaultPanel } = els;
  defaultPanel.textContent = '';
  const recent = getRecent();
  if (recent.length) {
    const g = group(LABELS.recent);
    const chips = el('div', 'search-chips');
    recent.forEach((q) => chips.append(chip(q, true)));
    g.append(chips);
    defaultPanel.append(g);
  }
  const popular = group(LABELS.popular);
  const chips = el('div', 'search-chips');
  POPULAR.forEach((q) => chips.append(chip(q)));
  popular.append(chips);
  defaultPanel.append(popular);

  const trending = await loadTrending();
  if (trending.length && !els.input.value.trim()) {
    const g = group(LABELS.trending);
    const row = el('div', 'search-products');
    trending.forEach((p, i) => row.append(productCard(p, i + 1, '')));
    g.append(row);
    defaultPanel.append(g);
  }
}

function renderMessage(container, message, retry = false) {
  container.textContent = '';
  container.append(el('p', 'search-empty', message));
  if (retry) {
    const btn = el('button', 'search-chip', LABELS.retry);
    btn.type = 'button';
    btn.dataset.retry = '';
    container.append(btn);
  }
}

function renderProducts({ total, items }, query) {
  const { productsPanel } = els;
  productsPanel.textContent = '';
  productsPanel.hidden = !items.length;
  if (!items.length) return;
  const g = group(LABELS.products);
  const row = el('div', 'search-products');
  items.forEach((p, i) => row.append(productCard(p, i + 1, query)));
  const all = el('a', 'search-see-all', format(LABELS.allProducts, { count: total }));
  all.href = `${SHOP_PATHS.search}?q=${encodeURIComponent(query)}`;
  all.addEventListener('click', () => {
    rememberQuery(query);
    pushSearchEvent('siteSearchClick', { phrase: query, target: all.pathname, resultType: 'all-products' });
  });
  g.append(row, all);
  productsPanel.append(g);
}

function renderPages({ results = [] }, query) {
  const { pagesPanel } = els;
  pagesPanel.textContent = '';
  const g = group(LABELS.pages);
  const hits = results.filter((hit) => isSiteHref(hit.path));
  if (!hits.length) {
    g.append(el('p', 'search-empty', format(LABELS.noResults, { query })));
    pagesPanel.append(g);
    return;
  }
  const list = el('ul', 'search-pages');
  hits.forEach((hit, i) => {
    const li = el('li');
    const a = el('a', 'search-page');
    a.href = hit.path;
    a.append(el('span', 'search-page-title', hit.title || hit.path));
    const sub = hit.description || hit.snippet;
    if (sub) a.append(el('span', 'search-page-sub', sub));
    a.append(el('span', 'search-page-path', hit.path));
    a.addEventListener('click', () => {
      rememberQuery(query);
      pushSearchEvent('siteSearchClick', {
        phrase: query, target: hit.path, resultType: 'page', position: i + 1,
      });
    });
    li.append(a);
    list.append(li);
  });
  g.append(list);
  pagesPanel.append(g);
}

function renderSummary(data) {
  const { summaryPanel, summaryText, summarySources } = els;
  summaryPanel.setAttribute('aria-busy', 'false');
  if (!data?.grounded) {
    summaryPanel.hidden = true;
    return;
  }
  summaryText.innerHTML = renderSummaryHtml(data.answer);
  summarySources.textContent = '';
  (data.hits || []).slice(0, 4).forEach((hit) => {
    if (!isSiteHref(hit.path)) return;
    const a = el('a', 'search-chip', hit.title || hit.path);
    a.href = hit.path;
    summarySources.append(a);
  });
  summarySources.hidden = !summarySources.childElementCount;
  summaryPanel.hidden = false;
}

function updateSherpa(query) {
  els.sherpa.href = sherpaHref(query);
  els.sherpaLabel.textContent = query
    ? format(LABELS.askSherpaQuery, { query })
    : LABELS.askSherpa;
}

/* ---------- search orchestration ---------- */

function cancel() {
  state.requestId += 1;
  clearTimeout(state.timer);
  state.controller?.abort();
  state.controller = null;
}

async function runSearch(query, requestId) {
  const controller = new AbortController();
  state.controller = controller;
  const { signal } = controller;
  const current = () => requestId === state.requestId;
  const counts = { pages: 0, products: 0 };

  const products = searchProducts(query, signal)
    .then((data) => {
      counts.products = data.total;
      if (current()) renderProducts(data, query);
    })
    .catch(() => {
      if (current()) els.productsPanel.hidden = true;
    });

  const pages = searchPages(query, signal)
    .then((data) => {
      counts.pages = data.results?.length || 0;
      if (current()) renderPages(data, query);
    })
    .catch((e) => {
      if (current() && e.name !== 'AbortError') renderMessage(els.pagesPanel, LABELS.error, true);
    })
    .finally(() => {
      if (current()) els.pagesPanel.setAttribute('aria-busy', 'false');
    });

  contentAi('gensearch', { query }, signal)
    .then((data) => {
      if (!current()) return;
      renderSummary(data);
      if (data?.grounded) pushSearchEvent('siteSearchSummary', { phrase: query, grounded: true });
    })
    .catch(() => {
      if (current()) renderSummary(null);
    });

  await Promise.allSettled([products, pages]);
  if (current()) {
    pushSearchEvent('siteSearch', {
      phrase: query, resultCount: counts.pages, productCount: counts.products,
    });
  }
}

function render() {
  cancel();
  const query = els.input.value.trim();
  const active = query.length >= MIN_QUERY;
  updateSherpa(query);
  els.defaultPanel.hidden = active;
  els.resultsPanel.hidden = !active;
  if (!active) {
    if (!query) renderDefault();
    return;
  }
  renderMessage(els.pagesPanel, LABELS.searching);
  els.pagesPanel.setAttribute('aria-busy', 'true');
  els.summaryPanel.hidden = false;
  els.summaryPanel.setAttribute('aria-busy', 'true');
  els.summaryText.textContent = LABELS.thinking;
  els.summarySources.hidden = true;
  const { requestId } = state;
  state.timer = setTimeout(() => runSearch(query, requestId), SEARCH_DELAY);
}

/* ---------- modal ---------- */

function focusables() {
  return [...els.modal.querySelectorAll('a[href], button, input')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    // eslint-disable-next-line no-use-before-define
    closeSearch();
    return;
  }
  if (e.key !== 'Tab') return;
  const list = focusables();
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function closeSearch() {
  const { overlay } = state;
  if (!overlay || overlay.hidden) return;
  cancel();
  overlay.classList.remove('is-open');
  overlay.hidden = true;
  document.body.classList.remove('search-open');
  document.removeEventListener('keydown', onKeydown);
  state.lastFocused?.focus?.();
}

function buildOverlay() {
  const overlay = el('div', 'search-overlay');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="search-modal" role="dialog" aria-modal="true" aria-label="Search WKND">
      <form class="search-bar" role="search" action="${OF1_PATH}" method="get">
        <span class="search-bar-icon">${SEARCH_ICON}</span>
        <input class="search-input" type="search" name="q" autocomplete="off" enterkeyhint="search"
          placeholder="${LABELS.placeholder}" aria-label="${LABELS.placeholder}">
        <button class="search-close" type="button" aria-label="${LABELS.close}">Esc</button>
      </form>
      <div class="search-body">
        <div class="search-default"></div>
        <div class="search-results" hidden>
          <section class="search-summary" aria-live="polite" aria-label="${LABELS.summary}" hidden>
            <h2 class="search-group-title">${SPARKLE_ICON}<span>${LABELS.summary}</span></h2>
            <div class="search-summary-text"></div>
            <div class="search-chips search-summary-sources" aria-label="${LABELS.sources}" hidden></div>
            <p class="search-summary-disclaimer">${LABELS.summaryDisclaimer}</p>
          </section>
          <div class="search-products-panel" hidden></div>
          <div class="search-pages-panel" aria-live="polite"></div>
        </div>
      </div>
      <a class="search-sherpa" href="${OF1_PATH}">${SPARKLE_ICON}<span class="search-sherpa-label">${LABELS.askSherpa}</span></a>
    </div>`;
  document.body.append(overlay);

  els = {
    modal: overlay.querySelector('.search-modal'),
    form: overlay.querySelector('.search-bar'),
    input: overlay.querySelector('.search-input'),
    defaultPanel: overlay.querySelector('.search-default'),
    resultsPanel: overlay.querySelector('.search-results'),
    summaryPanel: overlay.querySelector('.search-summary'),
    summaryText: overlay.querySelector('.search-summary-text'),
    summarySources: overlay.querySelector('.search-summary-sources'),
    productsPanel: overlay.querySelector('.search-products-panel'),
    pagesPanel: overlay.querySelector('.search-pages-panel'),
    sherpa: overlay.querySelector('.search-sherpa'),
    sherpaLabel: overlay.querySelector('.search-sherpa-label'),
  };

  els.input.addEventListener('input', (e) => {
    if (!e.isComposing) render();
  });
  els.input.addEventListener('compositionend', render);
  const handOff = () => {
    const query = els.input.value.trim();
    rememberQuery(query);
    pushSearchEvent('siteSearchClick', { phrase: query, target: OF1_PATH, resultType: 'sherpa' });
  };
  els.form.addEventListener('submit', (e) => {
    if (!els.input.value.trim()) {
      e.preventDefault();
      return;
    }
    handOff();
  });
  els.sherpa.addEventListener('click', handOff);
  overlay.querySelector('.search-close').addEventListener('click', closeSearch);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSearch();
  });
  els.modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) {
      render();
      return;
    }
    const c = e.target.closest('button.search-chip[data-query]');
    if (!c) return;
    els.input.value = c.dataset.query;
    render();
    els.input.focus();
  });
  state.overlay = overlay;
}

/**
 * Opens the search modal (built on first use).
 * @param {Element} [trigger] element to restore focus to on close
 * @param {string} [initialQuery]
 */
export async function openSearch(trigger, initialQuery = '') {
  loadCSS(`${window.hlx.codeBasePath}/blocks/search/search.css`);
  if (!state.overlay) buildOverlay();
  state.lastFocused = trigger || document.activeElement;
  const { overlay } = state;
  overlay.hidden = false;
  // eslint-disable-next-line no-unused-expressions
  overlay.offsetHeight;
  overlay.classList.add('is-open');
  document.body.classList.add('search-open');
  document.addEventListener('keydown', onKeydown);
  els.input.value = initialQuery;
  render();
  els.input.focus();
  pushSearchEvent('siteSearchOpen', { phrase: initialQuery });
}

/**
 * Authored `search` block: renders a search trigger that opens the modal.
 * @param {Element} block
 */
export default async function decorate(block) {
  const label = block.textContent.trim() || LABELS.placeholder;
  const button = el('button', 'search-trigger');
  button.type = 'button';
  button.innerHTML = SEARCH_ICON;
  button.append(el('span', '', label));
  button.addEventListener('click', () => openSearch(button));
  block.replaceChildren(button);
}
