/**
 * ACDL page context and Analytics variable mapping for Web SDK.
 * @see docs/ANALYTICS-LAUNCH-PLAN.md Phase 2
 */

const JOURNEY_STAGE_SEGMENTS = {
  inspiration: ['blog', 'field-notes'],
  discovery: ['adventures', 'destinations'],
  planning: ['expeditions', 'gear', 'faq', 'basecamp'],
  community: ['community', 'sustainability', 'about'],
};

const ADVENTURE_CATEGORY_KEYWORDS = {
  climbing: ['climbing', 'yosemite', 'ice-climbing'],
  trekking: ['trek', 'backpacking', 'patagonia', 'hiking'],
  'winter-alpine': ['winter', 'mountaineering', 'alpine'],
  cycling: ['cycling', 'alpine-cycling'],
  water: ['kayak', 'surfing', 'swimming', 'norway'],
  desert: ['desert', 'survival'],
  photography: ['photography', 'field-notes'],
};

/**
 * @param {string} [hostname]
 * @returns {'local'|'preview'|'live'|'other'}
 */
export function getAnalyticsEnvironment(hostname = window.location?.hostname || '') {
  if (hostname === 'localhost' || hostname === 'localhost.local') return 'local';
  if (hostname.endsWith('.aem.page')) return 'preview';
  if (hostname.endsWith('.aem.live')) return 'live';
  return 'other';
}

/**
 * @param {string} pathname
 * @returns {string}
 */
function getSiteSection(pathname) {
  const segment = pathname.split('/').filter(Boolean)[0];
  return segment || 'home';
}

/**
 * @param {string} pathname
 * @param {string} siteSection
 * @returns {string}
 */
function deriveJourneyStage(pathname, siteSection) {
  const path = pathname.toLowerCase();
  if (siteSection === 'home') return 'inspiration';
  const match = Object.entries(JOURNEY_STAGE_SEGMENTS).find(([, segments]) => (
    segments.some((segment) => path.includes(`/${segment}`))
  ));
  return match ? match[0] : '';
}

/**
 * @param {string} pathname
 * @returns {string}
 */
function deriveAdventureCategory(pathname) {
  const path = pathname.toLowerCase();
  const match = Object.entries(ADVENTURE_CATEGORY_KEYWORDS).find(([, keywords]) => (
    keywords.some((keyword) => path.includes(keyword))
  ));
  if (match) return match[0];
  if (path.includes('/adventures') || getSiteSection(pathname) === 'home') return 'general-outdoor';
  return '';
}

/**
 * @param {string} template
 * @param {string} pathname
 * @returns {string}
 */
function deriveContentType(template, pathname) {
  if (template) return template;
  if (pathname.includes('/blog/')) return 'blog-article';
  if (getSiteSection(pathname) === 'home') return 'homepage';
  return 'page';
}

/**
 * @param {Document} doc
 * @param {(name: string, doc?: Document) => string} getMetadataValue
 * @returns {Record<string, string>}
 */
export function buildPageContext(doc, getMetadataValue) {
  const { pathname } = window.location;
  const siteSection = getMetadataValue('siteSection', doc) || getSiteSection(pathname);
  const template = getMetadataValue('template', doc);
  const title = getMetadataValue('title', doc);

  return {
    pageName: title || doc.title || '',
    template,
    theme: getMetadataValue('theme', doc),
    contentType: getMetadataValue('contentType', doc) || deriveContentType(template, pathname),
    environment: getAnalyticsEnvironment(),
    siteSection,
    adventureCategory: getMetadataValue('adventureCategory', doc)
      || deriveAdventureCategory(pathname),
    journeyStage: getMetadataValue('journeyStage', doc)
      || deriveJourneyStage(pathname, siteSection),
    targetEnabled: ['on', 'true', 'yes'].includes(
      (getMetadataValue('target', doc) || '').toLowerCase(),
    ) ? 'yes' : 'no',
  };
}

/**
 * @returns {Record<string, string>}
 */
function getPageStateFromDataLayer() {
  if (window.adobeDataLayer?.getState) {
    return window.adobeDataLayer.getState('page') || {};
  }
  if (!Array.isArray(window.adobeDataLayer)) return {};
  for (let i = window.adobeDataLayer.length - 1; i >= 0; i -= 1) {
    const item = window.adobeDataLayer[i];
    if (item?.page) return item.page;
  }
  return {};
}

/**
 * Push page state to ACDL before the lazy-phase page view (no event — avoids duplicate hits).
 * @param {Document} doc
 * @param {(name: string, doc?: Document) => string} getMetadataValue
 */
export function pushAnalyticsPageContext(doc, getMetadataValue) {
  if (typeof window === 'undefined' || !window.adobeDataLayer) return;
  window.adobeDataLayer.push({
    page: buildPageContext(doc, getMetadataValue),
  });
}

/**
 * Maps ACDL page state to legacy Analytics variables on each Web SDK hit.
 * @param {Object} content Web SDK onBeforeEventSend payload
 * @returns {boolean}
 */
export function mapPageToAnalytics(content) {
  /* eslint-disable no-underscore-dangle -- Web SDK Analytics data object */
  content.data = content.data || {};
  content.data.__adobe = content.data.__adobe || {};
  content.data.__adobe.analytics = content.data.__adobe.analytics || {};

  const s = content.data.__adobe.analytics;
  /* eslint-enable no-underscore-dangle */
  const page = getPageStateFromDataLayer();

  if (page.pageName) s.pageName = page.pageName;
  else if (document.title) s.pageName = document.title;

  if (page.template) s.eVar5 = page.template;
  if (page.contentType) s.eVar3 = page.contentType;
  if (page.adventureCategory) s.eVar4 = page.adventureCategory;
  if (page.journeyStage) s.prop3 = page.journeyStage;
  if (page.theme) s.prop2 = page.theme;
  if (page.siteSection) s.prop4 = page.siteSection;
  if (page.targetEnabled === 'yes') s.prop9 = 'target-on';

  s.prop1 = page.environment || getAnalyticsEnvironment();

  const cid = new URLSearchParams(window.location.search).get('cid');
  if (cid) s.eVar1 = cid;

  return true;
}
