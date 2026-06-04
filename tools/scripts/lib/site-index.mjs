/**
 * Fetch and classify publishable paths from the live site query index.
 */

const PATH_DENYLIST = [
  /^\/fragments\//,
  /^\/blocks\//,
  /^\/tools\//,
  /^\/library/,
  /^\/drafts\//,
  /^\/icons\//,
  /^\/fonts\//,
  /^\/nav$/,
  /^\/footer$/,
  /^\/templates\//,
  /^\/metadata/,
  /^\/index$/,
];

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
 * @param {string} path
 */
export function normalizePath(path) {
  if (!path || path === '/' || path === 'index' || path === '/index') return '/';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  const trimmed = withSlash.replace(/\/+$/, '') || '/';
  return trimmed === '/index' ? '/' : trimmed;
}

/**
 * @param {string} path
 */
export function isPublishablePage(path) {
  const normalized = normalizePath(path);
  if (PATH_DENYLIST.some((re) => re.test(normalized))) return false;
  if (normalized.includes('.')) return false;
  return true;
}

/**
 * @param {string} pathname
 */
export function getSiteSection(pathname) {
  const segment = pathname.split('/').filter(Boolean)[0];
  return segment || 'home';
}

/**
 * @param {string} pathname
 * @returns {{ adventureCategory: string, journeyStage: string, siteSection: string }}
 */
export function classifyPath(pathname) {
  const path = normalizePath(pathname).toLowerCase();
  const siteSection = getSiteSection(path);

  let journeyStage = '';
  if (siteSection === 'home') {
    journeyStage = 'inspiration';
  } else {
    const match = Object.entries(JOURNEY_STAGE_SEGMENTS).find(([, segments]) => (
      segments.some((segment) => path.includes(`/${segment}`))
    ));
    journeyStage = match ? match[0] : '';
  }

  let adventureCategory = '';
  const catMatch = Object.entries(ADVENTURE_CATEGORY_KEYWORDS).find(([, keywords]) => (
    keywords.some((keyword) => path.includes(keyword))
  ));
  if (catMatch) adventureCategory = catMatch[0];
  else if (path.includes('/adventures') || siteSection === 'home') adventureCategory = 'general-outdoor';

  return { adventureCategory, journeyStage, siteSection };
}

/**
 * @param {string} origin
 */
export async function fetchQueryIndex(origin) {
  const base = origin.replace(/\/$/, '');
  const res = await fetch(`${base}/query-index.json`);
  if (!res.ok) {
    throw new Error(`query-index fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  const paths = rows
    .map((row) => normalizePath(row.path || ''))
    .filter((path) => path && isPublishablePage(path));

  const unique = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  const byStage = {
    inspiration: [],
    discovery: [],
    planning: [],
    community: [],
    other: [],
  };
  const byCategory = {};

  unique.forEach((path) => {
    const { adventureCategory, journeyStage } = classifyPath(path);
    if (journeyStage && byStage[journeyStage]) byStage[journeyStage].push(path);
    else byStage.other.push(path);
    const cat = adventureCategory || 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(path);
  });

  return {
    fetchedAt: new Date().toISOString(),
    origin: base,
    pathCount: unique.length,
    paths: unique,
    byStage,
    byCategory,
  };
}
