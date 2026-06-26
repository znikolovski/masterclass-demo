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
 * @property {string} [theme]
 */

/** @type {Record<string, PageMeta>} */
export const PAGE_ANALYTICS = {
  '/': { adventureCategory: 'general-outdoor', journeyStage: 'inspiration', template: 'homepage', theme: 'magazine' },
  '/about': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page', theme: 'editorial' },
  '/adventures': { adventureCategory: 'general-outdoor', journeyStage: 'discovery', template: 'landing-page', theme: 'discovery' },
  '/destinations': { adventureCategory: 'general-outdoor', journeyStage: 'discovery', template: 'landing-page', theme: 'discovery' },
  '/expeditions': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page', theme: 'planning' },
  '/gear': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page', theme: 'planning' },
  '/faq': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page', theme: 'support' },
  '/basecamp': { adventureCategory: 'general-outdoor', journeyStage: 'planning', template: 'landing-page', theme: 'planning' },
  '/field-notes': { adventureCategory: 'photography', journeyStage: 'inspiration', template: 'landing-page', theme: 'photography' },
  '/community': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page', theme: 'community' },
  '/sustainability': { adventureCategory: 'general-outdoor', journeyStage: 'community', template: 'page', theme: 'community' },
  '/find-your-adventure': {
    adventureCategory: 'general-outdoor',
    journeyStage: 'discovery',
    template: 'landing-page',
    theme: 'quiz',
  },
  '/find-your-adventure/results': {
    adventureCategory: 'general-outdoor',
    journeyStage: 'discovery',
    template: 'landing-page',
    theme: 'quiz-results',
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
    theme: 'storytelling',
  },
  'yosemite-rock-climbing': {
    adventureInterest: 'Yosemite climbing',
    adventureCategory: 'climbing',
    journeyStage: 'inspiration',
    theme: 'storytelling',
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
 * Approximate coordinates for blog adventure map pins.
 * @type {Record<string, { latitude: string, longitude: string, placeName: string }>}
 */
export const BLOG_GEO = {
  'patagonia-trek': {
    latitude: '-50.94',
    longitude: '-73.00',
    placeName: 'Torres del Paine, Chile',
  },
  'yosemite-rock-climbing': {
    latitude: '37.87',
    longitude: '-119.54',
    placeName: 'Yosemite Valley, USA',
  },
  'wild-swimming-guide': {
    latitude: '54.60',
    longitude: '-3.07',
    placeName: 'Lake District, UK',
  },
  'alpine-cycling': {
    latitude: '45.92',
    longitude: '6.87',
    placeName: 'French Alps',
  },
  'kayaking-norway': {
    latitude: '62.47',
    longitude: '6.15',
    placeName: 'Geirangerfjord, Norway',
  },
  'winter-mountaineering': {
    latitude: '46.55',
    longitude: '8.02',
    placeName: 'Swiss Alps',
  },
  'desert-survival-guide': {
    latitude: '36.27',
    longitude: '-116.82',
    placeName: 'Death Valley, USA',
  },
  'mountain-photography': {
    latitude: '46.88',
    longitude: '10.97',
    placeName: 'Dolomites, Italy',
  },
  'ultralight-backpacking': {
    latitude: '37.73',
    longitude: '-119.57',
    placeName: 'Sierra Nevada, USA',
  },
  'surfing-costa-rica': {
    latitude: '9.62',
    longitude: '-85.16',
    placeName: 'Nosara, Costa Rica',
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
    const geo = BLOG_GEO[slug] || {};
    return {
      ...blog,
      ...geo,
      template: 'blog-article',
      theme: blog.theme || 'storytelling',
    };
  }
  const page = PAGE_ANALYTICS[path] || {};
  return {
    ...page,
    theme: page.theme || '',
  };
}
