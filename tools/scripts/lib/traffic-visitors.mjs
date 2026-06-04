/**
 * Virtual visitor pool for WKND traffic simulation.
 * Persists Playwright storage state so Web SDK keeps the same ECID across visits.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIENCE_PROFILES, PROFILE_IDS } from './audience-traffic-profiles.mjs';

const AVG_PAGES_PER_VISIT = 2.8;

/**
 * @param {number} seed
 */
export function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (Math.imul(t ^ (t >>> 7), 61 | t) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} rng
 * @param {string[]} profileIds
 * @returns {Record<string, number>}
 */
export function randomizeAudienceMix(rng, profileIds = PROFILE_IDS) {
  const weights = profileIds.map(() => rng() + 0.05);
  const sum = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    profileIds.map((id, i) => [id, weights[i] / sum]),
  );
}

/**
 * @param {Record<string, number>} mix
 * @param {() => number} rng
 * @param {string[]} profileIds
 */
export function pickAudience(mix, rng, profileIds = PROFILE_IDS) {
  const r = rng();
  let acc = 0;
  for (const id of profileIds) {
    acc += mix[id];
    if (r <= acc) return id;
  }
  return profileIds[profileIds.length - 1];
}

/**
 * Draw how many Analytics "visits" (sessions) this virtual visitor will have.
 * @param {() => number} rng
 */
export function drawVisitsPerVisitor(rng) {
  const r = rng();
  if (r < 0.52) return 1;
  if (r < 0.85) return 2;
  return 3 + Math.floor(rng() * 4);
}

/**
 * @param {number} visitCount
 * @param {number} visitorCount
 * @param {() => number} rng
 * @returns {number[]}
 */
export function buildVisitsPerVisitorCounts(visitCount, visitorCount, rng) {
  const counts = Array.from({ length: visitorCount }, () => drawVisitsPerVisitor(rng));
  let total = counts.reduce((a, b) => a + b, 0);

  while (total > visitCount) {
    const idx = counts.findIndex((c) => c > 1);
    if (idx === -1) break;
    counts[idx] -= 1;
    total -= 1;
  }

  while (total < visitCount) {
    const idx = Math.floor(rng() * visitorCount);
    counts[idx] += 1;
    total += 1;
  }

  return counts;
}

/**
 * @param {number} hits
 * @param {Record<string, number>} mix
 * @param {() => number} rng
 * @param {Record<string, { label: string, journeys: string[][] }>} profiles
 * @returns {{ profileId: string, paths: string[] }[]}
 */
export function buildVisitDefinitions(hits, mix, rng, profiles = AUDIENCE_PROFILES) {
  const profileIds = Object.keys(profiles);
  const visits = [];
  let hitsLeft = hits;

  while (hitsLeft > 0) {
    const profileId = pickAudience(mix, rng, profileIds);
    const profile = profiles[profileId];
    const journey = profile.journeys[Math.floor(rng() * profile.journeys.length)];
    const paths = journey.slice(0, hitsLeft);
    visits.push({ profileId, paths });
    hitsLeft -= paths.length;
  }

  return visits;
}

/**
 * @param {{ profileId: string, paths: string[] }[]} visitDefs
 * @param {number} visitorCount
 * @param {() => number} rng
 * @returns {{ profileId: string, paths: string[], visitorId: string }[]}
 */
export function assignVisitorsToVisits(visitDefs, visitorCount, rng) {
  const visitCount = visitDefs.length;
  const counts = buildVisitsPerVisitorCounts(visitCount, visitorCount, rng);
  const queue = [];

  counts.forEach((sessionCount, visitorIndex) => {
    const visitorId = `v${String(visitorIndex + 1).padStart(5, '0')}`;
    for (let i = 0; i < sessionCount; i += 1) {
      queue.push(visitorId);
    }
  });

  while (queue.length < visitCount) {
    queue.push(`v${String(Math.floor(rng() * visitorCount) + 1).padStart(5, '0')}`);
  }
  while (queue.length > visitCount) {
    queue.pop();
  }

  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  return visitDefs.map((visit, i) => ({
    ...visit,
    visitorId: queue[i],
  }));
}

/**
 * @param {number} hits
 * @param {number|null} visitors
 */
export function resolveVisitorCount(hits, visitors) {
  if (visitors && visitors > 0) return visitors;
  const estimatedVisits = Math.max(1, Math.round(hits / AVG_PAGES_PER_VISIT));
  return Math.max(80, Math.round(estimatedVisits * 0.58));
}

/**
 * @param {{ profileId: string, paths: string[], visitorId: string }[]} scheduled
 */
export function summarizeVisitorStats(scheduled) {
  const byVisitor = new Map();
  scheduled.forEach(({ visitorId }) => {
    byVisitor.set(visitorId, (byVisitor.get(visitorId) || 0) + 1);
  });
  const sessionCounts = [...byVisitor.values()];
  const returning = sessionCounts.filter((c) => c > 1).length;
  return {
    uniqueVisitors: byVisitor.size,
    totalSessions: scheduled.length,
    returningVisitors: returning,
    returningShare: Math.round((returning / byVisitor.size) * 1000) / 10,
    maxSessionsPerVisitor: Math.max(...sessionCounts),
    avgSessionsPerVisitor: Math.round((sessionCounts.reduce((a, b) => a + b, 0)
      / byVisitor.size) * 100) / 100,
  };
}

/**
 * @param {string} poolDir
 */
export function ensureVisitorPoolDir(poolDir) {
  mkdirSync(poolDir, { recursive: true });
}

/**
 * @param {string} poolDir
 * @param {string} visitorId
 */
export function visitorStoragePath(poolDir, visitorId) {
  return join(poolDir, `${visitorId}.json`);
}

/**
 * @param {string} poolDir
 */
export function loadPoolManifest(poolDir) {
  const manifestPath = join(poolDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { visitors: {}, updatedAt: null };
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { visitors: {}, updatedAt: null };
  }
}

/**
 * @param {string} poolDir
 * @param {object} manifest
 */
export function savePoolManifest(poolDir, manifest) {
  ensureVisitorPoolDir(poolDir);
  writeFileSync(join(poolDir, 'manifest.json'), JSON.stringify({
    ...manifest,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

/**
 * @param {string} poolDir
 * @param {string} visitorId
 */
export function hasVisitorState(poolDir, visitorId) {
  return existsSync(visitorStoragePath(poolDir, visitorId));
}

/**
 * @param {string} poolDir
 */
export function countPersistedVisitors(poolDir) {
  const manifest = loadPoolManifest(poolDir);
  return Object.keys(manifest.visitors || {}).length;
}

/**
 * Build full schedule for a run.
 * @param {object} options
 * @param {number} options.hits
 * @param {number} options.seed
 * @param {number|null} [options.visitors]
 * @param {() => number} [options.rng]
 * @param {Record<string, { label: string, journeys: string[][] }>} [options.profiles]
 */
export function buildTrafficSchedule({
  hits,
  seed,
  visitors = null,
  rng = createRng(seed),
  profiles = AUDIENCE_PROFILES,
}) {
  const profileIds = Object.keys(profiles);
  const mix = randomizeAudienceMix(rng, profileIds);
  const visitDefs = buildVisitDefinitions(hits, mix, rng, profiles);
  const visitorCount = resolveVisitorCount(hits, visitors);
  const scheduled = assignVisitorsToVisits(visitDefs, visitorCount, rng);
  const mixReport = profileIds.map((id) => ({
    id,
    label: profiles[id].label,
    share: Math.round((mix[id] || 0) * 1000) / 10,
  })).sort((a, b) => b.share - a.share);

  return {
    mix,
    mixReport,
    scheduled,
    visitorStats: summarizeVisitorStats(scheduled),
    visitorCount,
    visitorPoolDir: null,
  };
}
