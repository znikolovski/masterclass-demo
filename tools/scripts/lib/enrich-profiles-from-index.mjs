/**
 * Merge live query-index paths into audience journey definitions.
 */

import { classifyPath, normalizePath } from './site-index.mjs';

/** Primary adventure categories per profile (for blog substitution). */
const PROFILE_CATEGORIES = {
  climbingSeekers: ['climbing'],
  trekkingHiking: ['trekking'],
  winterAlpine: ['winter-alpine'],
  cyclingAdventurers: ['cycling'],
  waterAdventurers: ['water'],
  desertExplorers: ['desert'],
  photographyStory: ['photography'],
  broadOutdoorBrowse: ['general-outdoor'],
  inspirationReaders: ['photography', 'general-outdoor'],
  discoveryBrowsers: ['general-outdoor'],
  plannersPrep: [],
  communityValues: [],
  inspiredToPlanning: ['photography', 'general-outdoor'],
  climberReadyToBook: ['climbing'],
  weekendBrowser: ['general-outdoor'],
  destinationResearchers: [],
};

const STAGE_FALLBACK_HUBS = {
  inspiration: ['/', '/field-notes'],
  discovery: ['/adventures', '/destinations'],
  planning: ['/expeditions', '/gear', '/faq', '/basecamp'],
  community: ['/community', '/sustainability', '/about'],
};

/**
 * @param {string[]} list
 * @param {() => number} rng
 */
function pickOne(list, rng) {
  if (!list?.length) return null;
  return list[Math.floor(rng() * list.length)];
}

/**
 * @param {string} path
 * @param {Set<string>} indexSet
 * @param {{ paths: string[], byStage: object, byCategory: object }} pools
 * @param {string[]} categories
 * @param {() => number} rng
 */
function resolvePath(path, indexSet, pools, categories, rng) {
  const normalized = normalizePath(path);
  if (indexSet.has(normalized)) return normalized;

  const { journeyStage, adventureCategory } = classifyPath(normalized);

  if (normalized.startsWith('/blog/')) {
    for (const cat of categories) {
      const candidates = pools.byCategory[cat] || [];
      const blogPaths = candidates.filter((p) => p.startsWith('/blog/'));
      if (blogPaths.length) return pickOne(blogPaths, rng);
    }
    const anyBlog = pools.paths.filter((p) => p.startsWith('/blog/'));
    if (anyBlog.length) return pickOne(anyBlog, rng);
  }

  const stageList = pools.byStage[journeyStage] || STAGE_FALLBACK_HUBS[journeyStage] || [];
  const inIndex = stageList.filter((p) => indexSet.has(p));
  if (inIndex.length) return pickOne(inIndex, rng);

  for (const cat of [adventureCategory, ...categories]) {
    if (!cat) continue;
    const catPaths = (pools.byCategory[cat] || []).filter((p) => indexSet.has(p));
    if (catPaths.length) return pickOne(catPaths, rng);
  }

  return pickOne(pools.paths, rng) || normalized;
}

/**
 * @param {string} profileId
 * @param {{ paths: string[], byStage: object, byCategory: object }} pools
 * @param {Set<string>} indexSet
 * @param {() => number} rng
 */
function buildDynamicJourneys(profileId, pools, indexSet, rng) {
  const categories = PROFILE_CATEGORIES[profileId] || [];
  const journeys = [];
  const blogCandidates = pools.paths.filter((p) => {
    if (!p.startsWith('/blog/')) return false;
    const { adventureCategory } = classifyPath(p);
    return categories.length === 0 || categories.includes(adventureCategory);
  });

  if (blogCandidates.length >= 1) {
    const blog = pickOne(blogCandidates, rng);
    const planning = pickOne(
      pools.byStage.planning.filter((p) => indexSet.has(p)),
      rng,
    );
    const discovery = pickOne(
      pools.byStage.discovery.filter((p) => indexSet.has(p)),
      rng,
    );
    if (blog && planning) journeys.push([blog, planning].filter(Boolean));
    if (blog && discovery) journeys.push([blog, discovery].filter(Boolean));
    if (blog) journeys.push([blog]);
  }

  const browse = pickOne(
    pools.byStage.discovery.filter((p) => indexSet.has(p)),
    rng,
  );
  const home = indexSet.has('/') ? '/' : pickOne(pools.paths, rng);
  if (browse && home) journeys.push([home, browse]);

  return journeys.slice(0, 3);
}

/**
 * @param {Record<string, { label: string, journeys: string[][] }>} baseProfiles
 * @param {{ paths: string[], byStage: object, byCategory: object }} index
 * @param {() => number} rng
 */
export function enrichProfilesFromIndex(baseProfiles, index, rng) {
  const indexSet = new Set(index.paths);
  const pools = index;

  const enriched = {};
  Object.entries(baseProfiles).forEach(([profileId, profile]) => {
    const categories = PROFILE_CATEGORIES[profileId] || [];
    const resolvedJourneys = profile.journeys.map((journey) => journey.map((step) => (
      resolvePath(step, indexSet, pools, categories, rng)
    )));

    const dynamicJourneys = buildDynamicJourneys(profileId, pools, indexSet, rng);
    dynamicJourneys.forEach((journey) => {
      if (!resolvedJourneys.some((existing) => existing.join('|') === journey.join('|'))) {
        resolvedJourneys.push(journey);
      }
    });

    enriched[profileId] = {
      ...profile,
      journeys: resolvedJourneys,
    };
  });

  const usedPaths = new Set();
  Object.values(enriched).forEach((p) => {
    p.journeys.forEach((j) => j.forEach((step) => usedPaths.add(step)));
  });

  return {
    profiles: enriched,
    stats: {
      indexPathCount: index.pathCount,
      uniquePathsUsed: usedPaths.size,
      dynamicJourneysAdded: Object.values(enriched).reduce(
        (sum, p) => sum + p.journeys.length,
        0,
      ),
    },
  };
}
