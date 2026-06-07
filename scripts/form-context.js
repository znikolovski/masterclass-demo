import { getMetadata } from './aem.js';

/** @typedef {{ b2cValue?: string, b2bValue?: string, source: string }} AdventureContext */

/** Options URL for blog-index driven adventure select (pathname fetched on current origin). */
export const BLOG_ARTICLES_OPTIONS_URL = 'https://www.aem.live/blog-index.json';

const B2B_OPTIONS = [
  { value: 'Trekking', label: 'Trekking' },
  { value: 'Climbing', label: 'Climbing' },
  { value: 'Water', label: 'Water' },
  { value: 'Winter', label: 'Winter' },
  { value: 'Retreat', label: 'Leadership retreat' },
  { value: 'Custom', label: 'Custom itinerary' },
];

const SLUG_MAP = {
  'patagonia-trek': { b2c: 'Patagonia', b2b: 'Trekking' },
  patagonia: { b2c: 'Patagonia', b2b: 'Trekking' },
  'yosemite-rock-climbing': { b2c: 'Yosemite', b2b: 'Climbing' },
  yosemite: { b2c: 'Yosemite', b2b: 'Climbing' },
  'alpine-cycling': { b2c: 'Alpine cycling', b2b: 'Custom' },
  'wild-swimming-guide': { b2c: 'Wild swimming', b2b: 'Water' },
  'wild-swimming': { b2c: 'Wild swimming', b2b: 'Water' },
  'norway-kayaking': { b2c: 'Norway kayaking', b2b: 'Water' },
  'kayaking-norway': { b2c: 'Norway kayaking', b2b: 'Water' },
  'winter-mountaineering': { b2c: 'Other', b2b: 'Winter' },
  'desert-survival-guide': { b2c: 'Other', b2b: 'Custom' },
  'mountain-photography': { b2c: 'Other', b2b: 'Custom' },
  'ultralight-backpacking': { b2c: 'Other', b2b: 'Trekking' },
  'surfing-costa-rica': { b2c: 'Other', b2b: 'Water' },
};

const CATEGORY_TO_B2B = {
  climbing: 'Climbing',
  trekking: 'Trekking',
  'winter-alpine': 'Winter',
  cycling: 'Custom',
  water: 'Water',
  desert: 'Custom',
  photography: 'Custom',
  'general-outdoor': 'Custom',
};

/**
 * @param {string} name
 * @param {Document} [doc]
 */
export function getPageMetadataValue(name, doc = document) {
  const fromHead = getMetadata(name, doc);
  if (fromHead) return fromHead;
  const headMeta = [...doc.head.querySelectorAll('meta[name]')].find(
    (m) => m.getAttribute('name')?.toLowerCase() === name.toLowerCase(),
  );
  if (headMeta?.content?.trim()) return headMeta.content.trim();
  const block = doc.querySelector('main .metadata');
  if (!block) return '';
  const row = [...block.children].find((child) => {
    const cells = child.querySelectorAll(':scope > div');
    return cells.length >= 2
      && cells[0].textContent.trim().toLowerCase() === name.toLowerCase();
  });
  if (!row) return '';
  const cells = row.querySelectorAll(':scope > div');
  return cells[1]?.textContent.trim() || '';
}

/**
 * @param {string} pathname
 */
function getPageSlug(pathname = window.location.pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return '';
  const last = segments[segments.length - 1];
  if (last === 'index' || last === 'index.html') {
    return segments[segments.length - 2] || '';
  }
  return last.replace(/\.html$/, '');
}

/**
 * @param {Document} doc
 */
function getBlogArticlePath(doc = document) {
  const pathname = doc.defaultView?.location?.pathname || window.location.pathname;
  const normalized = pathname.replace(/\.html$/, '').replace(/\/index$/, '');
  if (normalized.startsWith('/blog/') || normalized.startsWith('/drafts/blog/')) {
    return normalized;
  }
  return '';
}

/**
 * @param {string} raw
 * @param {Array<{ value: string, label: string }>} options
 */
function matchOptionValue(raw, options) {
  if (!raw) return '';
  const normalized = raw.trim().toLowerCase();
  const exact = options.find(
    (opt) => opt.value.toLowerCase() === normalized
      || opt.label.toLowerCase() === normalized,
  );
  if (exact) return exact.value;
  const partial = options.find(
    (opt) => normalized.includes(opt.value.toLowerCase())
      || normalized.includes(opt.label.toLowerCase())
      || opt.label.toLowerCase().includes(normalized),
  );
  return partial?.value || '';
}

/**
 * @param {Document} [doc]
 * @returns {AdventureContext}
 */
export function resolveAdventureContext(doc = document) {
  const blogPath = getBlogArticlePath(doc);
  if (blogPath) {
    const slug = blogPath.split('/').pop() || '';
    return {
      b2cValue: blogPath,
      b2bValue: SLUG_MAP[slug]?.b2b || '',
      source: `path:${blogPath}`,
    };
  }

  const explicit = getPageMetadataValue('adventureInterest', doc);
  if (explicit) {
    return {
      b2cValue: explicit.trim(),
      b2bValue: matchOptionValue(explicit, B2B_OPTIONS)
        || CATEGORY_TO_B2B[explicit.toLowerCase()] || '',
      source: 'metadata:adventureInterest',
    };
  }

  const slug = getPageSlug();
  if (slug && SLUG_MAP[slug]) {
    return {
      b2cValue: `/blog/${slug}`,
      b2bValue: SLUG_MAP[slug].b2b,
      source: `slug:${slug}`,
    };
  }

  const category = getPageMetadataValue('adventureCategory', doc);
  if (category && CATEGORY_TO_B2B[category]) {
    return {
      b2cValue: '',
      b2bValue: CATEGORY_TO_B2B[category],
      source: 'metadata:adventureCategory',
    };
  }

  const title = getPageMetadataValue('title', doc) || doc.title || '';
  if (title.trim()) {
    return {
      b2cValue: title.trim(),
      b2bValue: '',
      source: 'metadata:title',
    };
  }

  return { source: 'none' };
}

/**
 * @param {string} [href]
 */
export function getAdventureFormKind(href = '') {
  const path = href.toLowerCase();
  if (path.includes('wknd-adventure-interest-b2b')) return 'b2b-interest';
  if (path.includes('wknd-adventure-interest')) return 'b2c-interest';
  return null;
}

/**
 * @param {object} node
 * @returns {object[]}
 */
function getChildFields(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node.items)) return node.items;
  if (node[':itemsOrder'] && node[':items']) {
    return node[':itemsOrder'].map((key) => node[':items'][key]).filter(Boolean);
  }
  return [];
}

/**
 * @param {object} node
 * @param {string} fieldName
 * @param {string} value
 */
function setFieldValueInFormDef(node, fieldName, value) {
  if (!node || !value) return;
  if (node.name === fieldName) {
    node.value = value;
    node.default = value;
    return;
  }
  getChildFields(node).forEach((child) => setFieldValueInFormDef(child, fieldName, value));
}

/**
 * @param {object} sheetForm
 * @param {'b2c-interest'|'b2b-interest'} kind
 * @param {AdventureContext} context
 */
export function applyAdventurePrefillToSheet(sheetForm, kind, context) {
  if (!sheetForm?.data || !kind) return;
  const fieldName = kind === 'b2c-interest' ? 'adventure' : 'adventureType';
  const value = kind === 'b2c-interest' ? context.b2cValue : context.b2bValue;
  if (!value) return;
  const row = sheetForm.data.find((entry) => entry.Name === fieldName);
  if (row) row.Value = value;
}

/**
 * @param {object} formDef
 * @param {'b2c-interest'|'b2b-interest'} kind
 * @param {AdventureContext} context
 */
export function applyAdventurePrefillToFormDef(formDef, kind, context) {
  if (!formDef || !kind) return;
  const fieldName = kind === 'b2c-interest' ? 'adventure' : 'adventureType';
  const value = kind === 'b2c-interest' ? context.b2cValue : context.b2bValue;
  if (!value) return;
  setFieldValueInFormDef(formDef, fieldName, value);
}

/**
 * @param {string} name
 */
function toFieldClass(name) {
  return name.toLowerCase().replace(/[^0-9a-z]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * @param {HTMLFormElement} form
 * @param {'b2c-interest'|'b2b-interest'} kind
 * @param {AdventureContext} context
 */
/**
 * @param {HTMLOptionElement} opt
 * @param {string} value
 */
function optionMatchesPrefillValue(opt, value) {
  const normalized = value.trim().toLowerCase();
  const optionValue = opt.value.trim().toLowerCase();
  const optionLabel = opt.textContent.trim().toLowerCase();
  if (!normalized || !optionValue) return false;
  if (optionValue === normalized || optionLabel === normalized) return true;
  if (normalized.startsWith('/blog/') && optionValue === normalized) return true;
  const titlePrefix = optionLabel.split(':')[0].trim();
  return titlePrefix.includes(normalized) || normalized.includes(titlePrefix);
}

export function applyAdventurePrefillToDom(form, kind, context) {
  if (!form || !kind) return;
  const fieldName = kind === 'b2c-interest' ? 'adventure' : 'adventureType';
  const value = kind === 'b2c-interest' ? context.b2cValue : context.b2bValue;
  if (!value) return;
  const wrapper = form.querySelector(`.field-wrapper.field-${toFieldClass(fieldName)}`);
  const select = wrapper?.querySelector('select')
    || form.querySelector(`select[name$="${fieldName}"], select[name*="${fieldName}"]`);
  if (!select) return;
  const option = [...select.options].find((opt) => optionMatchesPrefillValue(opt, value));
  if (!option) return;
  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * @param {HTMLFormElement} form
 * @param {string} fieldName
 * @param {number} [timeoutMs]
 */
export function waitForSelectEnumLoad(form, fieldName, timeoutMs = 8000) {
  const wrapper = form.querySelector(`.field-wrapper.field-${toFieldClass(fieldName)}`);
  const select = wrapper?.querySelector('select')
    || form.querySelector(`select[name$="${fieldName}"], select[name*="${fieldName}"]`);
  if (!select) return Promise.resolve();
  if (select.dataset.enumLoad === 'done' || select.options.length > 1) {
    return Promise.resolve();
  }
  if (select.dataset.enumLoad !== 'pending') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => resolve();
    select.addEventListener('enum-loaded', finish, { once: true });
    window.setTimeout(finish, timeoutMs);
  });
}

/**
 * @param {object} formDef
 * @param {string} [formHref]
 */
export function prefillAdventureInterestForm(formDef, formHref = '') {
  if (document.documentElement.classList.contains('adobe-ue-edit')) return;
  const kind = getAdventureFormKind(formHref);
  if (!kind) return;
  const context = resolveAdventureContext();
  if (formDef?.data) {
    applyAdventurePrefillToSheet(formDef, kind, context);
  } else {
    applyAdventurePrefillToFormDef(formDef, kind, context);
  }
}
