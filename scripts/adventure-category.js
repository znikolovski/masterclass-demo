/**
 * Adventure category (eVar4) derivation from URL paths.
 * Longest keyword match first so alpine-cycling → cycling, not winter-alpine.
 */

/** @type {Record<string, string>} */
export const BLOG_CATEGORY_BY_SLUG = {
  'patagonia-trek': 'trekking',
  'yosemite-rock-climbing': 'climbing',
  'wild-swimming-guide': 'water',
  'alpine-cycling': 'cycling',
  'kayaking-norway': 'water',
  'winter-mountaineering': 'winter-alpine',
  'desert-survival-guide': 'desert',
  'mountain-photography': 'photography',
  'ultralight-backpacking': 'trekking',
  'surfing-costa-rica': 'water',
};

/** @type {Record<string, string[]>} */
export const ADVENTURE_CATEGORY_KEYWORDS = {
  climbing: ['climbing', 'yosemite', 'ice-climbing'],
  trekking: ['trek', 'backpacking', 'patagonia', 'hiking'],
  'winter-alpine': ['winter', 'mountaineering', 'alpine'],
  cycling: ['cycling', 'alpine-cycling'],
  water: ['kayak', 'surfing', 'swimming', 'norway'],
  desert: ['desert', 'survival'],
  photography: ['photography', 'field-notes'],
};

/**
 * @param {string} pathname
 * @returns {string}
 */
export function deriveAdventureCategory(pathname) {
  const path = pathname.toLowerCase();
  const blogMatch = path.match(/\/blog\/([^/?#]+)/);
  if (blogMatch && BLOG_CATEGORY_BY_SLUG[blogMatch[1]]) {
    return BLOG_CATEGORY_BY_SLUG[blogMatch[1]];
  }

  const keywordEntries = Object.entries(ADVENTURE_CATEGORY_KEYWORDS).flatMap(
    ([category, keywords]) => keywords.map((keyword) => ({ category, keyword })),
  );
  keywordEntries.sort((a, b) => b.keyword.length - a.keyword.length);

  const match = keywordEntries.find(({ keyword }) => path.includes(keyword));
  if (match) return match.category;

  if (path.includes('/adventures') || path === '/' || path === '/index') {
    return 'general-outdoor';
  }
  return '';
}
