import { getMetadata } from './aem.js';

/** @typedef {{ b2cValue?: string, b2bValue?: string, source: string }} AdventureContext */

const B2C_OPTIONS = [
  { value: 'Patagonia', label: 'Patagonia trek' },
  { value: 'Yosemite', label: 'Yosemite climbing' },
  { value: 'Alpine cycling', label: 'Alpine cycling' },
  { value: 'Wild swimming', label: 'Wild swimming' },
  { value: 'Norway kayaking', label: 'Norway kayaking' },
  { value: 'Other', label: 'Other' },
];

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

/** Fallback B2C select value when only adventureCategory metadata is set. */
const CATEGORY_TO_B2C = {
  climbing: 'Yosemite',
  trekking: 'Patagonia',
  cycling: 'Alpine cycling',
  water: 'Norway kayaking',
  'winter-alpine': 'Other',
  desert: 'Other',
  photography: 'Other',
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
  const explicit = getPageMetadataValue('adventureInterest', doc);
  if (explicit) {
    return {
      b2cValue: matchOptionValue(explicit, B2C_OPTIONS),
      b2bValue: matchOptionValue(explicit, B2B_OPTIONS)
        || CATEGORY_TO_B2B[explicit.toLowerCase()] || '',
      source: 'metadata:adventureInterest',
    };
  }

  const slug = getPageSlug();
  if (slug && SLUG_MAP[slug]) {
    return {
      b2cValue: SLUG_MAP[slug].b2c,
      b2bValue: SLUG_MAP[slug].b2b,
      source: `slug:${slug}`,
    };
  }

  const category = getPageMetadataValue('adventureCategory', doc);
  if (category && CATEGORY_TO_B2B[category]) {
    return {
      b2cValue: CATEGORY_TO_B2C[category] || '',
      b2bValue: CATEGORY_TO_B2B[category],
      source: 'metadata:adventureCategory',
    };
  }

  const title = getPageMetadataValue('title', doc) || doc.title || '';
  const b2cFromTitle = matchOptionValue(title, B2C_OPTIONS);
  if (b2cFromTitle) {
    const slugMatch = Object.values(SLUG_MAP).find((entry) => entry.b2c === b2cFromTitle);
    return {
      b2cValue: b2cFromTitle,
      b2bValue: slugMatch?.b2b || '',
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
export function applyAdventurePrefillToDom(form, kind, context) {
  if (!form || !kind) return;
  const fieldName = kind === 'b2c-interest' ? 'adventure' : 'adventureType';
  const value = kind === 'b2c-interest' ? context.b2cValue : context.b2bValue;
  if (!value) return;
  const wrapper = form.querySelector(`.field-wrapper.field-${toFieldClass(fieldName)}`);
  const select = wrapper?.querySelector('select')
    || form.querySelector(`select[name$="${fieldName}"], select[name*="${fieldName}"]`);
  if (!select) return;
  const option = [...select.options].find(
    (opt) => opt.value === value || opt.textContent.trim() === value,
  );
  if (!option) return;
  select.value = option.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
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
