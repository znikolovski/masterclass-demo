import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const PAGE_SIZE = 20;
const SDK_TIMEOUT = 2000;
const THUMBS_KEY = 'commerce-catalog:thumbnails';
const FORMAT_KEY = 'commerce-catalog:format';
const DA_ADMIN = 'https://admin.da.live';
const TEMPLATES_SHEET = 'commerce-templates';

// Used when neither the site config nor local settings define insert formats.
const DEFAULT_TEMPLATES = [
  { name: 'SKU', template: '{{sku}}' },
  { name: 'Product link', template: '<p><a href="{{url}}">{{name}}</a></p>' },
  {
    name: 'Product teaser block',
    template: '<div class="product-teaser"><div><div>sku</div><div>{{sku}}</div></div></div>',
  },
  {
    name: 'Commerce Card block',
    template: '<div class="cards-commerce"><div><div>{{sku}}</div></div></div>',
  },
];

const EMPTY_CONFIG = { endpoint: '', headers: {} };

const PRICE_FIELDS = `
  ... on SimpleProductView { price { final { amount { value currency } } regular { amount { value currency } } } }
  ... on ComplexProductView { priceRange {
    minimum { final { amount { value currency } } }
    maximum { final { amount { value currency } } }
  } }`;

const SEARCH_QUERY = `
query Search($phrase: String!, $page: Int, $size: Int, $filter: [SearchClauseInput!], $sort: [ProductSearchSortInput!]) {
  productSearch(phrase: $phrase, current_page: $page, page_size: $size, filter: $filter, sort: $sort) {
    total_count
    page_info { current_page total_pages }
    facets { attribute buckets { title ... on CategoryView { name path count } } }
    items { productView {
      __typename sku name inStock url urlKey
      images(roles: ["thumbnail", "small_image", "image"]) { url roles }
      ${PRICE_FIELDS}
    } }
  }
}`;

const PRODUCT_QUERY = `
query Product($skus: [String]) {
  products(skus: $skus) {
    __typename sku name url urlKey inStock description shortDescription
    images(roles: []) { url label roles }
    attributes(roles: []) { name label value }
    ${PRICE_FIELDS}
    ... on ComplexProductView { options { id title values { id title } } }
  }
}`;

const VARIANTS_QUERY = `
query Variants($sku: String!) {
  variants(sku: $sku) { variants {
    selections
    product { sku name inStock url urlKey images(roles: ["thumbnail"]) { url roles } ${PRICE_FIELDS} }
  } }
}`;

const $ = (sel) => document.querySelector(sel);

const state = {
  sdk: null,
  context: {},
  config: null,
  configSource: '',
  phrase: '',
  category: '',
  sort: 'relevance',
  page: 1,
  totalPages: 0,
  items: [],
  categoriesLoaded: false,
  requestId: 0,
  showThumbs: localStorage.getItem(THUMBS_KEY) === 'true',
  templates: DEFAULT_TEMPLATES,
  templatesSource: '',
  formatName: localStorage.getItem(FORMAT_KEY) || '',
  selected: new Map(),
};

/* ---------- helpers ---------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') node.className = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  });
  node.append(...children.flat().filter((c) => c !== undefined && c !== null && c !== false));
  return node;
}

function formatMoney(amount) {
  if (!amount || amount.value === null || amount.value === undefined) return '';
  const currency = amount.currency && amount.currency !== 'NONE' ? amount.currency : undefined;
  try {
    return currency
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount.value)
      : amount.value.toFixed(2);
  } catch {
    return `${amount.value}`;
  }
}

function formatPrice(product) {
  if (product.price) return formatMoney(product.price.final?.amount);
  const min = product.priceRange?.minimum?.final?.amount;
  const max = product.priceRange?.maximum?.final?.amount;
  if (!min) return '';
  if (max && max.value !== min.value) return `${formatMoney(min)} – ${formatMoney(max)}`;
  return formatMoney(min);
}

function pickImage(images = [], preferred = ['thumbnail', 'small_image', 'image']) {
  const match = preferred.map((role) => images.find((img) => img.roles?.includes(role))).find(Boolean);
  const url = (match || images[0])?.url;
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}

function humanize(key) {
  return String(key).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

// Attribute values can be scalars, arrays, objects or JSON strings.
function formatAttrValue(value) {
  let v = value;
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
    try { v = JSON.parse(v); } catch { /* keep as string */ }
  }
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.map(formatAttrValue).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    return Object.entries(v)
      .map(([k, val]) => [k, formatAttrValue(val)])
      .filter(([, val]) => val)
      .map(([k, val]) => `${humanize(k)}: ${val}`)
      .join('\n');
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function htmlToText(html = '') {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  doc.querySelectorAll('p, li, div').forEach((node) => node.append('\n'));
  return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

function toast(message, variant = 'positive') {
  const t = el('sp-toast', { variant, timeout: 6000, open: true }, message);
  t.addEventListener('close', () => t.remove());
  $('#toasts').replaceChildren(t);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/* ---------- insertion ---------- */

function currentFormat() {
  return state.templates.find((t) => t.name === state.formatName) || state.templates[0];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function isHtmlTemplate(template) {
  return /<[a-z][\s\S]*>/i.test(template);
}

function fillTemplate(template, product, escape) {
  const values = {
    sku: product.sku,
    name: product.name,
    price: formatPrice(product),
    url: product.url || '',
    urlKey: product.urlKey || '',
    image: pickImage(product.images, ['image', 'small_image', 'thumbnail']),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (!(key in values)) return match;
    return escape ? escapeHtml(values[key]) : values[key];
  });
}

// Mirrors Experience Workspace's library conversion: AEM block markup
// (<div class="name variant"><div><div>cell</div></div></div>) becomes a block table.
function blockToTable(block) {
  const [name, ...variants] = block.className.split(/\s+/).filter(Boolean);
  const rows = [...block.children];
  const maxCols = rows.reduce((n, row) => Math.max(n, row.children.length), 0) || 1;
  const table = document.createElement('table');
  table.setAttribute('border', '1');
  const header = el('td', { colspan: String(maxCols) }, variants.length ? `${name} (${variants.join(', ')})` : name);
  table.append(el('tr', {}, header));
  rows.forEach((row) => {
    const cells = [...row.children];
    const tr = document.createElement('tr');
    cells.forEach((col, i) => {
      const td = document.createElement('td');
      if (cells.length < maxCols && i === cells.length - 1) td.setAttribute('colspan', String(maxCols - i));
      td.innerHTML = col.innerHTML;
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

function toEditorHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll(':scope > div[class], :scope > div > div[class]').forEach((block) => {
    if (block.closest('table')) return;
    block.replaceWith(blockToTable(block));
  });
  // Unwrap section wrappers left behind by `<div><div class="block">` markup.
  doc.body.querySelectorAll(':scope > div:not([class])').forEach((section) => section.replaceWith(...section.childNodes));
  return doc.body.innerHTML;
}

async function insertProduct(product, format = currentFormat()) {
  return insertProducts([product], format);
}

// Combines several products into one output. For a block template the block's
// rows are repeated once per product inside a single block; other HTML is
// concatenated and plain text becomes one paragraph per product.
function buildMultiOutput(products, format) {
  if (!isHtmlTemplate(format.template)) {
    if (products.length === 1) return { text: fillTemplate(format.template, products[0], false) };
    return { html: products.map((p) => `<p>${escapeHtml(fillTemplate(format.template, p, false))}</p>`).join('') };
  }
  const filled = products.map((p) => fillTemplate(format.template, p, true));
  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
  const findBlock = (doc) => doc.body.querySelector(':scope > div[class], :scope > div > div[class]');
  const first = parse(filled[0]);
  const block = findBlock(first);
  if (!block || products.length === 1) return { html: toEditorHtml(filled.join('')) };
  filled.slice(1).forEach((html) => {
    const other = findBlock(parse(html));
    if (other) block.append(...other.children);
  });
  return { html: toEditorHtml(first.body.innerHTML) };
}

async function insertProducts(products, format = currentFormat()) {
  if (!products.length) return false;
  const { text, html } = buildMultiOutput(products, format);
  const what = products.length === 1 ? products[0].sku : `${products.length} products`;
  const actions = state.sdk?.actions;
  if (actions?.sendText) {
    if (html !== undefined) actions.sendHTML(html);
    else actions.sendText(text);
    toast(`Inserted ${format.name} for ${what}`);
    return true;
  }
  await copyText(text ?? html);
  toast(`Not in Experience Workspace – copied ${format.name} for ${what}`, 'info');
  return true;
}

/* ---------- multi-select ---------- */

function updateSelectionBar() {
  const count = state.selected.size;
  const bar = $('#selection-bar');
  bar.hidden = count === 0;
  document.body.classList.toggle('has-selection', count > 0);
  $('#selection-count').textContent = `${count} selected`;
  $('#selection-insert').textContent = `Insert ${count} as ${currentFormat()?.name || ''}`;
  document.querySelectorAll('sp-checkbox[data-sku]').forEach((cb) => {
    cb.checked = state.selected.has(cb.dataset.sku);
  });
}

function toggleSelected(product, checked) {
  if (checked) state.selected.set(product.sku, product);
  else state.selected.delete(product.sku);
  updateSelectionBar();
}

async function insertSelected() {
  const inserted = await insertProducts([...state.selected.values()]);
  if (inserted) {
    state.selected.clear();
    updateSelectionBar();
  }
}

async function copySku(sku) {
  await copyText(sku);
  toast(`Copied ${sku}`);
}

/* ---------- configuration ---------- */

function overrideKey() {
  const { org = 'standalone', repo = 'standalone' } = state.context;
  return `commerce-catalog:config:${org}/${repo}`;
}

function parseSiteConfig(json, path = '/') {
  const scopes = json?.public;
  if (!scopes?.default) return null;
  // Apply path-specific overrides (e.g. "/fr/") on top of the default scope.
  const keys = Object.keys(scopes)
    .filter((key) => key !== 'default' && path.startsWith(key))
    .sort((a, b) => a.length - b.length);
  const merged = [scopes.default, ...keys.map((k) => scopes[k])].reduce((acc, scope) => ({
    ...acc,
    ...scope,
    headers: {
      all: { ...acc.headers?.all, ...scope.headers?.all },
      cs: { ...acc.headers?.cs, ...scope.headers?.cs },
    },
  }), {});
  const endpoint = merged['commerce-endpoint'];
  if (!endpoint) return null;
  return { endpoint, headers: { ...merged.headers.all, ...merged.headers.cs } };
}

async function fetchSiteConfig() {
  const { org, repo, path = '/' } = state.context;
  const branch = state.context.branch || 'main';
  const candidates = ['/config.json'];
  if (org && repo) {
    candidates.push(`https://${branch}--${repo}--${org}.aem.live/config.json`);
    candidates.push(`https://${branch}--${repo}--${org}.aem.page/config.json`);
  }
  for (const url of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(url);
      if (resp.ok) {
        // eslint-disable-next-line no-await-in-loop
        const config = parseSiteConfig(await resp.json(), path);
        if (config) return config;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function resolveConfig({ ignoreOverride = false } = {}) {
  const stored = !ignoreOverride && localStorage.getItem(overrideKey());
  if (stored) {
    try {
      state.config = JSON.parse(stored);
      state.configSource = 'Custom settings (saved in this browser)';
      return;
    } catch {
      localStorage.removeItem(overrideKey());
    }
  }
  const site = await fetchSiteConfig();
  if (site) {
    state.config = site;
    state.configSource = 'Site commerce config (config.json)';
    return;
  }
  state.config = EMPTY_CONFIG;
  state.configSource = 'Not configured (no site commerce config found)';
}

function templatesKey() {
  const { org = 'standalone', repo = 'standalone' } = state.context;
  return `commerce-catalog:templates:${org}/${repo}`;
}

function normalizeTemplates(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({ name: String(row?.name ?? '').trim(), template: String(row?.template ?? '') }))
    .filter((row) => row.name && row.template);
}

async function fetchDaTemplates() {
  const { org, repo } = state.context;
  const token = state.sdk?.token;
  if (!org || !repo || !token) return [];
  // Site config first, then org config.
  for (const path of [`${org}/${repo}/`, `${org}/`]) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(`${DA_ADMIN}/config/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        // eslint-disable-next-line no-await-in-loop
        const json = await resp.json();
        const rows = json?.[TEMPLATES_SHEET]?.data
          || (json?.[':sheetname'] === TEMPLATES_SHEET ? json.data : null);
        const templates = normalizeTemplates(rows);
        if (templates.length) return templates;
      }
    } catch {
      // try next scope
    }
  }
  return [];
}

async function resolveTemplates({ ignoreOverride = false } = {}) {
  const stored = !ignoreOverride && localStorage.getItem(templatesKey());
  if (stored) {
    try {
      const templates = normalizeTemplates(JSON.parse(stored));
      if (templates.length) {
        state.templates = templates;
        state.templatesSource = 'Custom formats (saved in this browser)';
        return;
      }
    } catch {
      // fall through
    }
    localStorage.removeItem(templatesKey());
  }
  const site = await fetchDaTemplates();
  if (site.length) {
    state.templates = site;
    state.templatesSource = `Site config "${TEMPLATES_SHEET}" tab`;
    return;
  }
  state.templates = DEFAULT_TEMPLATES;
  state.templatesSource = `Built-in defaults (no "${TEMPLATES_SHEET}" tab in site config)`;
}

function populateFormats() {
  const picker = $('#format');
  picker.replaceChildren(...state.templates.map((t) => el('sp-menu-item', { value: t.name }, t.name)));
  if (!state.templates.some((t) => t.name === state.formatName)) state.formatName = state.templates[0].name;
  picker.value = state.formatName;
}

/* ---------- API ---------- */

async function gql(query, variables) {
  const { endpoint, headers } = state.config;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`Catalog request failed (${resp.status})`);
  const json = await resp.json();
  if (json.errors?.length && !json.data) throw new Error(json.errors[0].message);
  return json.data;
}

/* ---------- browse view ---------- */

function showView(name) {
  ['browse', 'detail', 'settings'].forEach((view) => {
    $(`#${view}-view`).hidden = view !== name;
  });
  window.scrollTo(0, 0);
}

function setStatus(kind, message) {
  const status = $('#status');
  status.replaceChildren();
  status.hidden = !kind;
  if (kind === 'loading') {
    status.append(el('sp-progress-circle', { indeterminate: true, size: 'm', label: 'Loading products' }));
  } else if (kind === 'empty' || kind === 'error') {
    status.append(el(
      'sp-illustrated-message',
      { heading: kind === 'empty' ? 'No products found' : 'Unable to load catalog' },
      el('div', { slot: 'description' }, message),
    ));
    if (kind === 'error') {
      status.append(el('sp-button', { variant: 'secondary', treatment: 'outline', size: 's', onClick: () => search() }, 'Try again'));
    }
  } else if (kind === 'unconfigured') {
    status.append(
      el(
        'sp-illustrated-message',
        { heading: 'Configure commerce settings' },
        el('div', { slot: 'description' }, message),
      ),
      el('sp-button', { variant: 'accent', size: 's', onClick: () => openSettings() }, 'Open settings'),
    );
  }
}

function thumbnail(product) {
  if (!state.showThumbs) return el('div', { className: 'thumb', 'aria-hidden': 'true' });
  const src = pickImage(product.images);
  if (!src) {
    return el('div', { className: 'thumb', 'aria-hidden': 'true' }, el('sp-icon-image', { size: 's' }));
  }
  const img = el('img', {
    className: 'thumb', src, alt: '', loading: 'lazy', width: 48, height: 48,
  });
  img.addEventListener('error', () => {
    img.replaceWith(el('div', { className: 'thumb', 'aria-hidden': 'true' }, el('sp-icon-image', { size: 's' })));
  }, { once: true });
  return img;
}

function stockBadge(product) {
  if (product.inStock !== false) return null;
  return el('sp-badge', { size: 's', variant: 'negative' }, 'Out of stock');
}

function productRow(product, { onOpen, label = product.name } = {}) {
  const insertBtn = el('sp-action-button', {
    quiet: true,
    size: 's',
    label: `Insert ${product.sku}`,
    title: 'Insert into page (uses the "Insert as" format)',
    onClick: (e) => { e.stopPropagation(); insertProduct(product); },
  }, el('sp-icon-text-add', { slot: 'icon' }));
  const copyBtn = el('sp-action-button', {
    quiet: true,
    size: 's',
    label: `Copy SKU ${product.sku}`,
    title: 'Copy SKU',
    onClick: (e) => { e.stopPropagation(); copySku(product.sku); },
  }, el('sp-icon-copy', { slot: 'icon' }));
  const checkbox = el('sp-checkbox', {
    size: 's',
    'data-sku': product.sku,
    checked: state.selected.has(product.sku),
    'aria-label': `Select ${product.sku}`,
    title: 'Select to insert several products together',
    onClick: (e) => e.stopPropagation(),
    onKeydown: (e) => e.stopPropagation(),
    onChange: (e) => toggleSelected(product, e.target.checked),
  });

  const row = el(
    'li',
    {
      className: 'result',
      tabindex: onOpen ? '0' : undefined,
      role: onOpen ? 'button' : undefined,
      'aria-label': onOpen ? `View ${product.name}` : undefined,
      onClick: onOpen,
      onKeydown: onOpen ? (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); onOpen(); } } : undefined,
    },
    checkbox,
    thumbnail(product),
    el(
      'div',
      { className: 'result-main' },
      el('span', { className: 'name', title: label }, label),
      el(
        'div',
        { className: 'result-meta' },
        el('span', { className: 'sku' }, product.sku),
        el('span', { className: 'price' }, formatPrice(product)),
        stockBadge(product),
      ),
    ),
    el('div', { className: 'result-actions' }, copyBtn, insertBtn),
  );
  return row;
}

function renderResults() {
  const list = $('#results');
  list.classList.toggle('with-thumbs', state.showThumbs);
  list.replaceChildren(...state.items.map((p) => productRow(p, { onOpen: () => openDetail(p.sku) })));
  $('#load-more').hidden = state.page >= state.totalPages || !state.items.length;
}

function populateCategories(facets = []) {
  if (state.categoriesLoaded) return;
  // WKND: Catalog Service backends expose `categories` or the newer `categoryPath` facet
  // (same CategoryView buckets); search() already filters on categoryPath.
  const facet = facets.find((f) => ['categories', 'categoryPath'].includes(f.attribute));
  if (!facet) return;
  const picker = $('#category');
  const buckets = facet.buckets
    .filter((b) => b.path && b.path !== 'all')
    .sort((a, b) => a.path.localeCompare(b.path));
  const items = buckets.map((b) => {
    const depth = b.path.split('/').length - 1;
    const label = `${'\u2003'.repeat(depth)}${b.name || b.title}`;
    return el('sp-menu-item', { value: b.path }, `${label} (${b.count})`);
  });
  picker.append(...items);
  state.categoriesLoaded = true;
}

async function search({ append = false } = {}) {
  const requestId = ++state.requestId;
  if (!append) {
    state.page = 1;
    state.items = [];
    $('#results').replaceChildren();
    $('#result-count').textContent = '';
  }
  $('#load-more').hidden = true;
  if (!state.config?.endpoint) {
    setStatus('unconfigured', 'No Catalog Service connection was found in the site\'s config.json. Add the commerce endpoint and headers to the site config, or enter them in settings.');
    return;
  }
  setStatus('loading');

  const filter = state.category ? [{ attribute: 'categoryPath', eq: state.category }] : [];
  const sort = state.sort === 'relevance' ? [] : [{
    attribute: state.sort.split(':')[0],
    direction: state.sort.split(':')[1],
  }];

  try {
    const data = await gql(SEARCH_QUERY, {
      phrase: state.phrase, page: state.page, size: PAGE_SIZE, filter, sort,
    });
    if (requestId !== state.requestId) return;
    const result = data.productSearch;
    state.totalPages = result.page_info?.total_pages || 0;
    state.items = [...state.items, ...result.items.map((i) => i.productView).filter(Boolean)];
    if (!state.category) populateCategories(result.facets);
    $('#result-count').textContent = `${result.total_count} product${result.total_count === 1 ? '' : 's'}`;
    setStatus(state.items.length ? null : 'empty', 'Try a different search term or category.');
    renderResults();
  } catch (error) {
    if (requestId !== state.requestId) return;
    setStatus('error', error.message);
  }
}

/* ---------- detail view ---------- */

function renderGallery(images, mainImg) {
  if (images.length < 2) return null;
  const buttons = images.map((img, idx) => el(
    'button',
    {
      type: 'button',
      'aria-label': `Show image ${idx + 1}`,
      'aria-current': idx === 0 ? 'true' : 'false',
      onClick: (e) => {
        mainImg.src = img.url;
        buttons.forEach((b) => b.setAttribute('aria-current', 'false'));
        e.currentTarget.setAttribute('aria-current', 'true');
      },
    },
    el('img', { src: img.url, alt: img.label || '', loading: 'lazy' }),
  ));
  return el('div', { className: 'gallery' }, buttons);
}

async function renderVariants(product, container) {
  if (product.__typename !== 'ComplexProductView') return;
  try {
    const data = await gql(VARIANTS_QUERY, { sku: product.sku });
    const variants = data?.variants?.variants || [];
    if (!variants.length) return;
    const labels = Object.fromEntries((product.options || [])
      .flatMap((o) => o.values.map((v) => [v.id, v.title])));
    container.append(
      el('h3', { className: 'section-title' }, `Variants (${variants.length})`),
      el('ul', { className: 'variants results with-thumbs', role: 'list' }, variants.map((v) => productRow(v.product, {
        label: v.selections.map((id) => labels[id]).filter(Boolean).join(' / ') || v.product.name,
      }))),
    );
    if (!state.showThumbs) container.querySelector('.variants').classList.remove('with-thumbs');
  } catch {
    // variants are optional – the backend may not support the query
  }
}

async function openDetail(sku) {
  showView('detail');
  const detail = $('#detail');
  detail.replaceChildren(el('div', { className: 'status' }, el('sp-progress-circle', { indeterminate: true, label: 'Loading product' })));

  try {
    const data = await gql(PRODUCT_QUERY, { skus: [sku] });
    const product = data.products?.[0];
    if (!product) throw new Error(`Product ${sku} was not found.`);

    const images = [...new Map((product.images || []).filter((img) => img.url)
      .map((img) => [pickImage([img]), { ...img, url: pickImage([img]) }])).values()];
    const mainSrc = pickImage(product.images, ['image', 'small_image', 'thumbnail']);
    const mainImg = mainSrc
      ? el('img', { className: 'detail-image', src: mainSrc, alt: product.name })
      : null;
    const description = htmlToText(product.description || product.shortDescription || '');
    const attrs = (product.attributes || [])
      .map((a) => ({ ...a, text: formatAttrValue(a.value) }))
      .filter((a) => a.text);
    const variantsContainer = el('div');

    detail.replaceChildren(...[
      mainImg,
      mainImg && renderGallery(images, mainImg),
      el('h2', { className: 'heading' }, product.name),
      el(
        'div',
        { className: 'sku-row' },
        el('span', { className: 'sku' }, `SKU ${product.sku}`),
        el('sp-action-button', {
          quiet: true, size: 's', label: 'Copy SKU', title: 'Copy SKU', onClick: () => copySku(product.sku),
        }, el('sp-icon-copy', { slot: 'icon' })),
      ),
      el(
        'div',
        { className: 'result-meta' },
        el('span', { className: 'detail-price' }, formatPrice(product)),
        el('sp-badge', { size: 's', variant: product.inStock === false ? 'negative' : 'positive' }, product.inStock === false ? 'Out of stock' : 'In stock'),
        el('sp-badge', { size: 's', variant: 'neutral' }, product.__typename === 'ComplexProductView' ? 'Configurable' : 'Simple'),
      ),
      description && el('p', { className: 'description' }, description),
      product.url && el('sp-link', { href: product.url, target: '_blank', rel: 'noopener' }, 'View in storefront'),
      attrs.length > 0 && el('h3', { className: 'section-title' }, 'Attributes'),
      attrs.length > 0 && el('dl', { className: 'attrs' }, attrs.flatMap((a) => [el('dt', {}, a.label || a.name), el('dd', {}, a.text)])),
      variantsContainer,
      el(
        'div',
        { className: 'sticky-actions' },
        el('sp-button', { variant: 'secondary', treatment: 'outline', size: 's', onClick: () => copySku(product.sku) }, 'Copy SKU'),
        el('sp-button', { variant: 'accent', size: 's', onClick: () => insertProduct(product) }, `Insert ${currentFormat().name}`),
      ),
    ].filter(Boolean));
    renderVariants(product, variantsContainer);
  } catch (error) {
    detail.replaceChildren(el('div', { className: 'status' }, el(
      'sp-illustrated-message',
      { heading: 'Unable to load product' },
      el('div', { slot: 'description' }, error.message),
    )));
  }
}

/* ---------- settings view ---------- */

function openSettings() {
  $('#config-source').textContent = `Currently using: ${state.configSource}`;
  $('#cfg-endpoint').value = state.config.endpoint;
  $('#cfg-headers').value = JSON.stringify(state.config.headers, null, 2);
  $('#cfg-headers').invalid = false;
  $('#templates-source').textContent = `Currently using: ${state.templatesSource}`;
  $('#cfg-templates').value = JSON.stringify(state.templates, null, 2);
  $('#cfg-templates').invalid = false;
  showView('settings');
}

function resetCatalog() {
  state.categoriesLoaded = false;
  state.category = '';
  const picker = $('#category');
  picker.replaceChildren(el('sp-menu-item', { value: '' }, 'All categories'));
  picker.value = '';
  search();
}

async function saveSettings() {
  const endpoint = $('#cfg-endpoint').value.trim();
  let headers;
  try {
    headers = JSON.parse($('#cfg-headers').value || '{}');
    $('#cfg-headers').invalid = false;
  } catch {
    $('#cfg-headers').invalid = true;
    toast('Headers must be valid JSON', 'negative');
    return;
  }
  if (!/^https?:\/\//.test(endpoint)) {
    $('#cfg-endpoint').invalid = true;
    toast('Endpoint must be a URL', 'negative');
    return;
  }
  $('#cfg-endpoint').invalid = false;

  let templates;
  try {
    templates = normalizeTemplates(JSON.parse($('#cfg-templates').value || '[]'));
    if (!templates.length) throw new Error('empty');
    $('#cfg-templates').invalid = false;
  } catch {
    $('#cfg-templates').invalid = true;
    toast('Templates must be a JSON list of { "name", "template" }', 'negative');
    return;
  }

  // Only pin a local override for the parts the author actually changed.
  if (JSON.stringify(templates) !== JSON.stringify(state.templates)) {
    state.templates = templates;
    state.templatesSource = 'Custom formats (saved in this browser)';
    localStorage.setItem(templatesKey(), JSON.stringify(templates));
    populateFormats();
  }
  showView('browse');
  const config = { endpoint, headers };
  if (JSON.stringify(config) !== JSON.stringify(state.config)) {
    state.config = config;
    state.configSource = 'Custom settings (saved in this browser)';
    localStorage.setItem(overrideKey(), JSON.stringify(config));
    resetCatalog();
  }
}

async function useSiteConfig() {
  localStorage.removeItem(overrideKey());
  localStorage.removeItem(templatesKey());
  await Promise.all([resolveConfig({ ignoreOverride: true }), resolveTemplates({ ignoreOverride: true })]);
  populateFormats();
  showView('browse');
  toast(`Using ${state.configSource}`, 'info');
  resetCatalog();
}

/* ---------- init ---------- */

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function bindEvents() {
  const searchField = $('#search');
  const runSearch = debounce(() => {
    state.phrase = searchField.value.trim();
    search();
  }, 300);
  searchField.addEventListener('input', runSearch);
  searchField.addEventListener('submit', (e) => {
    e.preventDefault();
    state.phrase = searchField.value.trim();
    search();
  });
  searchField.addEventListener('reset', () => {
    state.phrase = '';
    search();
  });

  $('#category').addEventListener('change', (e) => {
    state.category = e.target.value;
    search();
  });
  $('#format').addEventListener('change', (e) => {
    state.formatName = e.target.value;
    localStorage.setItem(FORMAT_KEY, state.formatName);
    updateSelectionBar();
  });
  $('#selection-clear').addEventListener('click', () => {
    state.selected.clear();
    updateSelectionBar();
  });
  $('#selection-insert').addEventListener('click', insertSelected);
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    search();
  });

  const thumbs = $('#thumbs');
  thumbs.checked = state.showThumbs;
  thumbs.addEventListener('change', () => {
    state.showThumbs = thumbs.checked;
    localStorage.setItem(THUMBS_KEY, String(state.showThumbs));
    renderResults();
  });

  $('#load-more').addEventListener('click', () => {
    state.page += 1;
    search({ append: true });
  });

  $('#back-btn').addEventListener('click', () => showView('browse'));
  $('#settings-back-btn').addEventListener('click', () => showView('browse'));
  $('#settings-btn').addEventListener('click', openSettings);
  $('#cfg-save').addEventListener('click', saveSettings);
  $('#cfg-reset').addEventListener('click', useSiteConfig);
  $('#settings-form').addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });
}

function applyColorScheme() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => { $('sp-theme').color = dark.matches ? 'dark' : 'light'; };
  apply();
  dark.addEventListener('change', apply);
}

(async function init() {
  applyColorScheme();
  bindEvents();
  setStatus('loading');

  const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), SDK_TIMEOUT); });
  state.sdk = await Promise.race([DA_SDK, timeout]);
  state.context = state.sdk?.context || {};

  if (!state.sdk) {
    const notice = $('#notice');
    notice.hidden = false;
    notice.textContent = 'Running outside Experience Workspace – "Insert" copies the result to your clipboard.';
  }

  await Promise.all([resolveConfig(), resolveTemplates()]);
  populateFormats();
  search();
}());
