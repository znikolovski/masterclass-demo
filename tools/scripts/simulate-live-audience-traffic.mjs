#!/usr/bin/env node
/**
 * Simulate WKND audience traffic on production (.aem.live) for Analytics demo data.
 *
 * Uses Playwright with persisted storage state per virtual visitor so the Web SDK
 * reuses the same ECID across multiple visits (returning visitors).
 * Each session uses a standard Chrome/Safari/Firefox User-Agent (Playwright device
 * presets) so Analytics Browser is not "None" / bot-flagged.
 * After each page load, scrolls for asset impressions/clicks and simulates form
 * funnel steps (start, field complete, submit, validation errors, abandon).
 *
 * Each run randomizes audience mix at startup. Re-run over several days with the
 * same --visitor-pool-dir for cross-day returning visitors.
 *
 * Prerequisites:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Examples:
 *   node tools/scripts/simulate-live-audience-traffic.mjs
 *   node tools/scripts/simulate-live-audience-traffic.mjs --hits=500 --concurrency=2
 *   node tools/scripts/simulate-live-audience-traffic.mjs --visitors=1200
 *   node tools/scripts/simulate-live-audience-traffic.mjs --visitor-pool-dir=tools/scripts/output/visitor-pool
 *   node tools/scripts/simulate-live-audience-traffic.mjs --dry-run
 *   node tools/scripts/simulate-live-audience-traffic.mjs --no-index   # skip query-index refresh
 *   node tools/scripts/simulate-live-audience-traffic.mjs --channel-mix=direct:30,organic:30,email:20,social:10,referral:10
 *   node tools/scripts/simulate-live-audience-traffic.mjs --direct-only   # no referrers / cid (legacy)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIENCE_PROFILES, PROFILE_IDS } from './lib/audience-traffic-profiles.mjs';
import { enrichProfilesFromIndex } from './lib/enrich-profiles-from-index.mjs';
import { fetchQueryIndex } from './lib/site-index.mjs';
import {
  buildBrowserContextOptions,
  pickBrowserDeviceForVisitor,
  summarizeBrowserMix,
} from './lib/traffic-browsers.mjs';
import {
  DEFAULT_CHANNEL_MIX,
  assignChannelsToSessions,
  buildGotoOptions,
  buildSessionPageUrl,
  parseChannelMixArg,
  summarizeChannelMix,
  summarizeChannelStats,
} from './lib/traffic-channels.mjs';
import {
  buildTrafficSchedule,
  createRng,
  ensureVisitorPoolDir,
  hasVisitorState,
  loadPoolManifest,
  savePoolManifest,
  visitorStoragePath,
} from './lib/traffic-visitors.mjs';
import {
  createEngagementTotals,
  engagementRng,
  isNavigationContextError,
  mergeEngagementStats,
  simulateBounceEngagement,
  simulatePageEngagement,
} from './lib/traffic-page-engagement.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_BASE = 'https://main--masterclass-demo--znikolovski.aem.live';
const DEFAULT_HITS = 10000;
const DEFAULT_CONCURRENCY = 4;
const ANALYTICS_WAIT_MS = 3500;
const BETWEEN_SESSIONS_MS = [500, 1800];
const RETURNING_SESSIONS_MS = [8000, 45000];

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = {
    base: DEFAULT_BASE,
    hits: DEFAULT_HITS,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    seed: null,
    visitors: null,
    outDir: join(__dirname, 'output'),
    visitorPoolDir: null,
    persistVisitors: true,
    fromIndex: true,
    skipEngagement: false,
    directOnly: false,
    channelMix: null,
  };
  argv.forEach((arg) => {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--direct-only') opts.directOnly = true;
    else if (arg === '--skip-engagement') opts.skipEngagement = true;
    else if (arg === '--no-index') opts.fromIndex = false;
    else if (arg === '--from-index') opts.fromIndex = true;
    else if (arg === '--no-persist-visitors') opts.persistVisitors = false;
    else if (arg.startsWith('--base=')) opts.base = arg.slice(7);
    else if (arg.startsWith('--hits=')) opts.hits = Math.max(1, parseInt(arg.slice(7), 10) || DEFAULT_HITS);
    else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = Math.min(8, Math.max(1, parseInt(arg.slice(14), 10) || DEFAULT_CONCURRENCY));
    } else if (arg.startsWith('--seed=')) opts.seed = parseInt(arg.slice(7), 10);
    else if (arg.startsWith('--visitors=')) opts.visitors = parseInt(arg.slice(11), 10);
    else if (arg.startsWith('--out-dir=')) opts.outDir = arg.slice(10);
    else if (arg.startsWith('--visitor-pool-dir=')) opts.visitorPoolDir = arg.slice(19);
    else if (arg.startsWith('--channel-mix=')) opts.channelMix = parseChannelMixArg(arg.slice(14));
  });
  return opts;
}

/**
 * @param {string} base
 */
function assertLiveOrigin(base) {
  const url = new URL(base);
  if (!url.hostname.endsWith('.aem.live')) {
    throw new Error(`Refusing non-production host "${url.hostname}". Use an *.aem.live URL.`);
  }
  return url.origin;
}

/**
 * @param {import('playwright').Page} page
 */
async function waitForAnalytics(page) {
  const patterns = [/edge\.adobedc\.net/, /adobedc\.net/, /\/ee\//, /interact/, /collect\?/];
  try {
    await page.waitForResponse(
      (resp) => patterns.some((re) => re.test(resp.url())),
      { timeout: 12000 },
    );
  } catch {
    await page.waitForTimeout(ANALYTICS_WAIT_MS);
  }
}

/**
 * @param {import('playwright').Browser} browser
 * @param {Record<string, import('playwright').DeviceDescriptor>} devicesMap
 * @param {string} origin
 * @param {{ profileId: string, paths: string[], visitorId: string, isBounce?: boolean, exitAfterFirstPage?: boolean, channel?: import('./lib/traffic-channels.mjs').SessionChannel }} task
 * @param {string|null} poolDir
 * @param {boolean} persistVisitors
 * @param {number} seed
 * @param {boolean} skipEngagement
 * @param {(profileId: string, path: string, visitorId: string, stats?: object, opts?: { supplemental?: boolean }) => void} onHit
 * @param {(profileId: string, path: string, visitorId: string, err: Error) => void} onError
 */
async function runSession(
  browser,
  devicesMap,
  origin,
  task,
  poolDir,
  persistVisitors,
  seed,
  skipEngagement,
  onHit,
  onError,
) {
  const storagePath = poolDir ? visitorStoragePath(poolDir, task.visitorId) : null;
  const isReturning = storagePath && hasVisitorState(poolDir, task.visitorId);

  const deviceName = pickBrowserDeviceForVisitor(task.visitorId);
  const { options: contextOptions, browserLabel } = buildBrowserContextOptions(
    deviceName,
    devicesMap,
    { storageState: isReturning && storagePath ? storagePath : undefined },
  );

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  let sessionFormEngaged = false;
  const endsAsBounce = Boolean(task.isBounce || task.exitAfterFirstPage);

  for (let pageIndex = 0; pageIndex < task.paths.length; pageIndex += 1) {
    const path = task.paths[pageIndex];
    const isLanding = pageIndex === 0;
    const url = buildSessionPageUrl(origin, path, task.channel, isLanding);
    const gotoOptions = buildGotoOptions(task.channel, isLanding);
    const useBounceEngagement = !skipEngagement
      && (endsAsBounce || (task.exitAfterFirstPage && pageIndex === 0));
    try {
      await page.goto(url, gotoOptions);
      let engagementStats = null;
      if (skipEngagement) {
        await waitForAnalytics(page);
      } else {
        const rng = engagementRng(task.visitorId, path, seed);
        engagementStats = useBounceEngagement
          ? await simulateBounceEngagement(page, rng)
          : await simulatePageEngagement(page, rng, {
            visitorId: task.visitorId,
            path,
            seed,
          });
        if (engagementStats?.formOutcome && engagementStats.formOutcome !== 'none') {
          sessionFormEngaged = true;
        }
      }
      onHit(task.profileId, path, task.visitorId, engagementStats);
    } catch (err) {
      onError(task.profileId, path, task.visitorId, err);
    }
    if (endsAsBounce) break;
    await page.waitForTimeout(200 + Math.floor(Math.random() * 400));
  }

  if (!skipEngagement && !sessionFormEngaged && !endsAsBounce) {
    const boostRng = engagementRng(task.visitorId, 'form-boost', seed);
    if (boostRng() < 0.42) {
      try {
        await page.goto(`${origin}/adventures`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const boostStats = await simulatePageEngagement(
          page,
          boostRng,
          { visitorId: task.visitorId, path: '/adventures', seed },
        );
        onHit(task.profileId, '/adventures', task.visitorId, boostStats, { supplemental: true });
      } catch (err) {
        onError(task.profileId, '/adventures', task.visitorId, err);
      }
    }
  }

  if (persistVisitors && storagePath) {
    await context.storageState({ path: storagePath });
  }
  await context.close();

  return { isReturning, deviceName, browserLabel, endsAsBounce };
}

/**
 * @param {import('playwright').Browser} browser
 * @param {Record<string, import('playwright').DeviceDescriptor>} devicesMap
 * @param {string} origin
 * @param {{ profileId: string, paths: string[], visitorId: string, isBounce?: boolean, exitAfterFirstPage?: boolean }[]} schedule
 * @param {string|null} poolDir
 * @param {boolean} persistVisitors
 * @param {number} concurrency
 * @param {number} seed
 * @param {boolean} skipEngagement
 * @param {(profileId: string, path: string, visitorId: string, stats?: object, opts?: { supplemental?: boolean }) => void} onHit
 * @param {(profileId: string, path: string, visitorId: string, err: Error) => void} onError
 */
async function runScheduledTraffic(
  browser,
  devicesMap,
  origin,
  schedule,
  poolDir,
  persistVisitors,
  concurrency,
  seed,
  skipEngagement,
  onHit,
  onError,
) {
  let nextIndex = 0;
  let bounceSessionsDone = 0;
  const rng = createRng(schedule.length);

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= schedule.length) break;

      const task = schedule[index];
      const sessionResult = await runSession(
        browser,
        devicesMap,
        origin,
        task,
        poolDir,
        persistVisitors,
        seed,
        skipEngagement,
        onHit,
        onError,
      );
      const { isReturning, endsAsBounce } = sessionResult;
      if (endsAsBounce) bounceSessionsDone += 1;

      const gap = isReturning
        ? RETURNING_SESSIONS_MS[0] + Math.floor(rng() * (RETURNING_SESSIONS_MS[1] - RETURNING_SESSIONS_MS[0]))
        : BETWEEN_SESSIONS_MS[0] + Math.floor(rng() * (BETWEEN_SESSIONS_MS[1] - BETWEEN_SESSIONS_MS[0]));
      await new Promise((r) => setTimeout(r, gap));
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { bounceSessionsDone };
}

/**
 * @param {Record<string, number>} mix
 * @param {number} hits
 * @param {number} seed
 */
function estimateHitDistribution(mix, hits, seed, profiles) {
  const perAudience = {};
  PROFILE_IDS.forEach((id) => { perAudience[id] = 0; });
  const { scheduled } = buildTrafficSchedule({
    hits, seed, rng: createRng(seed + 1), profiles,
  });
  scheduled.forEach(({ profileId, paths }) => {
    perAudience[profileId] += paths.length;
  });
  return perAudience;
}

/**
 * @param {string} origin
 * @param {boolean} fromIndex
 * @param {number} seed
 */
async function resolveProfiles(origin, fromIndex, seed) {
  if (!fromIndex) {
    return { profiles: AUDIENCE_PROFILES, indexMeta: null, enrichStats: null };
  }

  const index = await fetchQueryIndex(origin);
  const rng = createRng(seed + 404);
  const { profiles, stats } = enrichProfilesFromIndex(AUDIENCE_PROFILES, index, rng);
  return {
    profiles,
    indexMeta: {
      fetchedAt: index.fetchedAt,
      pathCount: index.pathCount,
    },
    enrichStats: stats,
    indexSnapshot: index,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const origin = assertLiveOrigin(opts.base);
  const seed = opts.seed ?? Date.now();
  const poolDir = opts.persistVisitors
    ? (opts.visitorPoolDir || join(opts.outDir, 'visitor-pool'))
    : null;

  if (poolDir) ensureVisitorPoolDir(poolDir);

  mkdirSync(opts.outDir, { recursive: true });

  const {
    profiles, indexMeta, enrichStats, indexSnapshot,
  } = await resolveProfiles(origin, opts.fromIndex, seed);

  if (indexSnapshot) {
    const indexPath = join(opts.outDir, `site-index-${seed}.json`);
    writeFileSync(indexPath, JSON.stringify({
      ...indexMeta,
      paths: indexSnapshot.paths,
      byCategory: indexSnapshot.byCategory,
    }, null, 2));
  }

  const scheduleResult = buildTrafficSchedule({
    hits: opts.hits,
    seed,
    visitors: opts.visitors,
    profiles,
  });
  const {
    mixReport, scheduled, visitorStats, visitorCount, bounceStats,
  } = scheduleResult;

  let channelMixReport = null;
  let channelStats = null;
  if (!opts.directOnly) {
    const normalizedChannelMix = assignChannelsToSessions(
      scheduled,
      opts.channelMix || DEFAULT_CHANNEL_MIX,
      createRng(seed + 909),
    );
    channelMixReport = summarizeChannelMix(normalizedChannelMix);
    channelStats = summarizeChannelStats(scheduled);
  }

  const uniqueVisitorIds = [...new Set(scheduled.map(({ visitorId }) => visitorId))];

  const poolManifest = poolDir ? loadPoolManifest(poolDir) : { visitors: {} };
  let crossDayReturning = 0;
  if (poolDir) {
    scheduled.forEach(({ visitorId }) => {
      if (hasVisitorState(poolDir, visitorId)) crossDayReturning += 1;
    });
  }

  const runMeta = {
    startedAt: new Date().toISOString(),
    origin,
    targetHits: opts.hits,
    seed,
    concurrency: opts.concurrency,
    visitorCount,
    visitorStats,
    crossDayReturningSessions: crossDayReturning,
    persistVisitors: opts.persistVisitors,
    visitorPoolDir: poolDir,
    audienceMix: mixReport,
    fromIndex: opts.fromIndex,
    indexMeta,
    enrichStats,
    bounceStats,
    directOnly: opts.directOnly,
    channelMix: channelMixReport,
    channelStats,
  };

  console.log('WKND live audience traffic simulator');
  console.log(`  Origin:         ${origin}`);
  if (indexMeta) {
    console.log(`  Site index:     ${indexMeta.pathCount} paths from query-index.json`);
    console.log(`  Paths in use:   ${enrichStats?.uniquePathsUsed ?? '—'}`);
  }
  console.log(`  Target hits:    ${opts.hits}`);
  console.log(`  Sessions:       ${scheduled.length}`);
  console.log(`  Unique visitors: ${visitorStats.uniqueVisitors}`);
  console.log(`  Returning (2+ sessions this run): ${visitorStats.returningVisitors} (${visitorStats.returningShare}%)`);
  if (poolDir) {
    console.log(`  Visitor pool:   ${poolDir}`);
    console.log(`  Cross-day return sessions: ${crossDayReturning}`);
  }
  console.log(`  Concurrency:    ${opts.concurrency}`);
  console.log(`  Engagement:     ${opts.skipEngagement ? 'off (page views only)' : 'on (assets + forms)'}`);
  console.log(`  Channels:       ${opts.directOnly ? 'direct only (no referrers/cid)' : 'mixed marketing channels'}`);
  console.log(`  Bounce rate:    ~${bounceStats.bounceRate}% of sessions (${bounceStats.bounceSessions}/${scheduled.length}, ${bounceStats.earlyExitSessions} early exits)`);
  console.log(`  Seed:           ${seed}`);

  let devicesMap = null;
  let chromium = null;
  try {
    const playwright = await import('playwright');
    chromium = playwright.chromium;
    devicesMap = playwright.devices;
    const browserMix = summarizeBrowserMix(uniqueVisitorIds, devicesMap);
    runMeta.browserMix = browserMix;
    console.log('  Browser mix (unique visitors, Analytics Browser dimension):');
    browserMix.forEach(({ label, count }) => {
      const pct = Math.round((count / uniqueVisitorIds.length) * 1000) / 10;
      console.log(`    ${pct.toString().padStart(5)}%  ${label} (${count} visitors)`);
    });
  } catch {
    if (!opts.dryRun) {
      console.error('\nPlaywright is required. Run:');
      console.error('  npm install -D playwright');
      console.error('  npx playwright install chromium');
      process.exit(1);
    }
  }

  console.log('  Audience mix (% of sessions):');
  mixReport.forEach(({ label, share }) => {
    console.log(`    ${share.toString().padStart(5)}%  ${label}`);
  });

  if (channelMixReport) {
    console.log('  Marketing channel mix (landing page per session):');
    channelMixReport.forEach(({ label, share }) => {
      console.log(`    ${share.toString().padStart(5)}%  ${label}`);
    });
    if (channelStats) {
      console.log('  Assigned sessions by channel:');
      Object.entries(channelStats.byChannel)
        .sort((a, b) => b[1].sessions - a[1].sessions)
        .forEach(([, stats]) => {
          console.log(`    ${stats.share.toString().padStart(5)}%  ${stats.label} (${stats.sessions} sessions)`);
        });
    }
  }

  const estimate = estimateHitDistribution(scheduleResult.mix, opts.hits, seed, profiles);
  console.log('  Expected hit distribution (approx):');
  PROFILE_IDS.filter((id) => estimate[id] > 0)
    .sort((a, b) => estimate[b] - estimate[a])
    .forEach((id) => {
      console.log(`    ~${estimate[id]} hits  ${AUDIENCE_PROFILES[id].label}`);
    });

  const mixPath = join(opts.outDir, `traffic-mix-${seed}.json`);
  writeFileSync(mixPath, JSON.stringify(runMeta, null, 2));
  console.log(`  Mix saved:      ${mixPath}`);

  if (opts.dryRun) {
    console.log('\nDry run — no browser traffic sent.');
    return;
  }

  if (!chromium || !devicesMap) {
    console.error('\nPlaywright is required. Run:');
    console.error('  npm install -D playwright');
    console.error('  npx playwright install chromium');
    process.exit(1);
  }

  let hitsDone = 0;
  let errors = 0;
  let bounceSessionsDone = 0;
  const engagementTotals = createEngagementTotals();
  const started = Date.now();

  const onHit = (profileId, path, visitorId, engagementStats, hitOpts = {}) => {
    if (!hitOpts.supplemental) hitsDone += 1;
    if (engagementStats) mergeEngagementStats(engagementTotals, engagementStats);
    if (hitsDone % 100 === 0 || hitsDone === opts.hits) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = hitsDone / elapsed;
      const eta = Math.round((opts.hits - hitsDone) / Math.max(rate, 0.01));
      console.log(`  Progress: ${hitsDone}/${opts.hits} hits (${rate.toFixed(1)}/s, ~${eta}s left)`);
    }
  };

  const onError = (profileId, path, visitorId, err) => {
    errors += 1;
    if (errors <= 10) {
      const detail = isNavigationContextError(err)
        ? 'page navigated during engagement (usually a linked image click)'
        : err.message;
      console.warn(`  WARN ${visitorId} ${profileId} ${path}: ${detail}`);
    }
  };

  console.log('\nStarting browsers…');
  const browser = await chromium.launch({ headless: true });

  const { bounceSessionsDone: completedBounces } = await runScheduledTraffic(
    browser,
    devicesMap,
    origin,
    scheduled,
    poolDir,
    opts.persistVisitors,
    opts.concurrency,
    seed,
    opts.skipEngagement,
    onHit,
    onError,
  );
  bounceSessionsDone = completedBounces;

  await browser.close();

  if (poolDir) {
    scheduled.forEach(({ visitorId }) => {
      poolManifest.visitors[visitorId] = (poolManifest.visitors[visitorId] || 0) + 1;
    });
    savePoolManifest(poolDir, poolManifest);
  }

  const summary = {
    ...runMeta,
    finishedAt: new Date().toISOString(),
    hitsCompleted: hitsDone,
    errors,
    bounceSessionsCompleted: bounceSessionsDone,
    engagement: engagementTotals,
    skipEngagement: opts.skipEngagement,
    durationSec: Math.round((Date.now() - started) / 1000),
  };
  const summaryPath = join(opts.outDir, `traffic-run-${seed}.json`);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\nDone.');
  console.log(`  Hits:     ${hitsDone}/${opts.hits}`);
  console.log(`  Errors:   ${errors}`);
  if (!opts.skipEngagement) {
    const realizedBounceRate = Math.round((bounceSessionsDone / scheduled.length) * 1000) / 10;
    console.log(`  Bounces:  ${bounceSessionsDone}/${scheduled.length} sessions (${realizedBounceRate}%)`);
    console.log(`  Assets:   ${engagementTotals.assetClicks} clicks (${engagementTotals.assetCandidates} candidates)`);
    console.log(`  Forms:    ${engagementTotals.formPages} pages with forms`);
    Object.entries(engagementTotals.formOutcomes).forEach(([outcome, count]) => {
      console.log(`    ${outcome}: ${count}`);
    });
  }
  console.log(`  Duration: ${summary.durationSec}s`);
  console.log(`  Summary:  ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
