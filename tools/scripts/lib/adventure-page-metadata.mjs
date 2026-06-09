/**
 * Page metadata for adventure interest form prefill and analytics segments.
 * adventureInterest — B2C form select label (Patagonia trek, …)
 * adventureCategory — Analytics eVar4 + B2B adventure type fallback
 */

/**
 * @typedef {object} PageMeta
 * @property {string} [adventureInterest]
 * @property {string} adventureCategory
 * @property {string} journeyStage
 * @property {string} [template]
 */

/** @type {Record<string, PageMeta>} */
export const PAGE_ANALYTICS = {
  '/': { adventureCategory: 'general-outdoor', journeyStage: 'inspiration', template: 'homepage' },
  '/about': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page' },
  '/adventures': { adventureCategory: 'general-outdoor', journeyStage: 'discovery', template: 'landing-page' },
  '/destinations': { adventureCategory: 'general-outdoor', journeyStage: 'discovery', template: 'landing-page' },
  '/expeditions': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/gear': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/faq': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/basecamp': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page' },
  '/field-notes': { adventureCategory: 'photography', journeyStage: 'inspiration', template: 'landing-page' },
  '/community': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page' },
  '/sustainability': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page' },
  '/find-your-adventure': {
    adventureCategory: 'general-outdoor',
    journeyStage: 'discovery',
    template: 'landing-page',
  },
  '/find-your-adventure/results': {
    adventureCategory: 'general-outdoor',
    journeyStage: 'discovery',
    template: 'landing-page',
  },
};

/**
 * Blog slugs → form prefill + analytics metadata.
 * adventureInterest values match form option labels in WKND_FORMS adventure select.
 */
export const BLOG_ANALYTICS = {
  'patagonia-trek': {
    adventureInterest: 'Patagonia trek',
    adventureCategory: 'trekking',
    journeyStage: 'inspiration',
  },
  'yosemite-rock-climbing': {
    adventureInterest: 'Yosemite climbing',
    adventureCategory: 'climbing',
    journeyStage: 'inspiration',
  },
  'wild-swimming-guide': {
    adventureInterest: 'Wild swimming',
    adventureCategory: 'water',
    journeyStage: 'inspiration',
  },
  'alpine-cycling': {
    adventureInterest: 'Alpine cycling',
    adventureCategory: 'cycling',
    journeyStage: 'inspiration',
  },
  'kayaking-norway': {
    adventureInterest: 'Norway kayaking',
    adventureCategory: 'water',
    journeyStage: 'inspiration',
  },
  'winter-mountaineering': {
    adventureInterest: 'Winter mountaineering',
    adventureCategory: 'winter-alpine',
    journeyStage: 'inspiration',
  },
  'desert-survival-guide': {
    adventureInterest: 'Desert survival',
    adventureCategory: 'desert',
    journeyStage: 'inspiration',
  },
  'mountain-photography': {
    adventureInterest: 'Mountain photography',
    adventureCategory: 'photography',
    journeyStage: 'inspiration',
  },
  'ultralight-backpacking': {
    adventureInterest: 'Ultralight backpacking',
    adventureCategory: 'trekking',
    journeyStage: 'inspiration',
  },
  'surfing-costa-rica': {
    adventureInterest: 'Surfing Costa Rica',
    adventureCategory: 'water',
    journeyStage: 'inspiration',
  },
};

/**
 * @param {string} path
 */
export function fieldsForPath(path) {
  if (path.startsWith('/blog/')) {
    const slug = path.split('/').pop();
    const blog = BLOG_ANALYTICS[slug] || {
      adventureCategory: 'general-outdoor',
      journeyStage: 'inspiration',
    };
    return {
      ...blog,
      template: 'blog-article',
    };
  }
  return PAGE_ANALYTICS[path] || {};
}
