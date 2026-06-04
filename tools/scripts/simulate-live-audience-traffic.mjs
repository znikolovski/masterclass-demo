#!/usr/bin/env node
/**
 * Simulate WKND audience traffic on production (.aem.live) for Analytics demo data.
 *
 * Uses Playwright to load pages so Launch / Web SDK fire real page-view beacons
 * (prop1=live, journey/adventure derived from paths).
 *
 * Each run randomizes audience mix at startup. Re-run over several days for a
 * spread of traffic over time.
 *
 * Prerequisites:
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Examples:
 *   node tools/scripts/simulate-live-audience-traffic.mjs
 *   node tools/scripts/simulate-live-audience-traffic.mjs --hits=500 --concurrency=2
 *   node tools/scripts/simulate-live-audience-traffic.mjs --dry-run
 *   node tools/scripts/simulate-live-audience-traffic.mjs --base=https://main--masterclass-demo--znikolovski.aem.live
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIENCE_PROFILES, PROFILE_IDS } from './lib/audience-traffic-profiles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_BASE = 'https://main--masterclass-demo--znikolovski.aem.live';
const DEFAULT_HITS = 10000;
const DEFAULT_CONCURRENCY = 4;
const ANALYTICS_WAIT_MS = 3500;
const BETWEEN_VISITS_MS = [300, 1200];

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = {
    base: DEFAULT_BASE,
    hits: DEFAULT_HITS,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    seed: null,
    outDir: join(__dirname, 'output'),
  };
  argv.forEach((arg) => {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--base=')) opts.base = arg.slice(7);
    else if (arg.startsWith('--hits=')) opts.hits = Math.max(1, parseInt(arg.slice(7), 10) || DEFAULT_HITS);
    else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = Math.min(8, Math.max(1, parseInt(arg.slice(14), 10) || DEFAULT_CONCURRENCY));
    } else if (arg.startsWith('--seed=')) opts.seed = parseInt(arg.slice(7), 10);
    else if (arg.startsWith('--out-dir=')) opts.outDir = arg.slice(10);
  });
  return opts;
}

/**
 * @param {number} seed
 */
function createRng(seed) {
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
 * @returns {Record<string, number>}
 */
function randomizeAudienceMix(rng) {
  const weights = PROFILE_IDS.map(() => rng() + 0.05);
  const sum = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    PROFILE_IDS.map((id, i) => [id, weights[i] / sum]),
  );
}

/**
 * @param {Record<string, number>} mix
 * @param {() => number} rng
 */
function pickAudience(mix, rng) {
  const r = rng();
  let acc = 0;
  for (const id of PROFILE_IDS) {
    acc += mix[id];
    if (r <= acc) return id;
  }
  return PROFILE_IDS[PROFILE_IDS.length - 1];
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
 * @param {number} total
 */
function createHitQuota(total) {
  let remaining = total;
  let done = 0;
  return {
    take() {
      if (remaining <= 0) return false;
      remaining -= 1;
      done += 1;
      return true;
    },
    get done() { return done; },
    get remaining() { return remaining; },
  };
}

/**
 * @param {import('playwright').Browser} browser
 * @param {string} origin
 * @param {Record<string, number>} mix
 * @param {() => number} rng
 * @param {ReturnType<typeof createHitQuota>} quota
 * @param {(profileId: string, path: string) => void} onHit
 * @param {(profileId: string, path: string, err: Error) => void} onError
 */
async function runVisitor(browser, origin, mix, rng, quota, onHit, onError) {
  while (quota.remaining > 0) {
    const profileId = pickAudience(mix, rng);
    const profile = AUDIENCE_PROFILES[profileId];
    const journey = profile.journeys[Math.floor(rng() * profile.journeys.length)];

    const context = await browser.newContext({
      userAgent: 'WKND-DemoTraffic/1.0 (Analytics audience simulator; +https://www.aem.live)',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    const page = await context.newPage();

    for (const path of journey) {
      if (!quota.take()) break;
      const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await waitForAnalytics(page);
        onHit(profileId, path);
      } catch (err) {
        onError(profileId, path, err);
      }
      await page.waitForTimeout(200 + Math.floor(rng() * 400));
    }

    await context.close();
    const pause = BETWEEN_VISITS_MS[0]
      + Math.floor(rng() * (BETWEEN_VISITS_MS[1] - BETWEEN_VISITS_MS[0]));
    await new Promise((r) => setTimeout(r, pause));
  }
}

/**
 * @param {Record<string, number>} mix
 * @param {number} hits
 * @param {() => number} rng
 */
function estimatePlan(mix, hits, seed) {
  const perAudience = {};
  PROFILE_IDS.forEach((id) => { perAudience[id] = 0; });
  let remaining = hits;
  const rngCopy = createRng((seed + 1) >>> 0);
  while (remaining > 0) {
    const id = pickAudience(mix, rngCopy);
    const journey = AUDIENCE_PROFILES[id].journeys[
      Math.floor(rngCopy() * AUDIENCE_PROFILES[id].journeys.length)
    ];
    const n = Math.min(journey.length, remaining);
    perAudience[id] += n;
    remaining -= n;
  }
  return perAudience;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const origin = assertLiveOrigin(opts.base);
  const seed = opts.seed ?? Date.now();
  const rng = createRng(seed);
  const mix = randomizeAudienceMix(rng);

  const mixReport = PROFILE_IDS.map((id) => ({
    id,
    label: AUDIENCE_PROFILES[id].label,
    share: Math.round(mix[id] * 1000) / 10,
  })).sort((a, b) => b.share - a.share);

  const runMeta = {
    startedAt: new Date().toISOString(),
    origin,
    targetHits: opts.hits,
    seed,
    concurrency: opts.concurrency,
    audienceMix: mixReport,
  };

  console.log('WKND live audience traffic simulator');
  console.log(`  Origin:       ${origin}`);
  console.log(`  Target hits:  ${opts.hits}`);
  console.log(`  Concurrency:  ${opts.concurrency}`);
  console.log(`  Seed:         ${seed}`);
  console.log('  Audience mix (% of visits):');
  mixReport.forEach(({ label, share }) => {
    console.log(`    ${share.toString().padStart(5)}%  ${label}`);
  });

  const estimate = estimatePlan(mix, opts.hits, seed);
  console.log('  Expected hit distribution (approx):');
  PROFILE_IDS.filter((id) => estimate[id] > 0)
    .sort((a, b) => estimate[b] - estimate[a])
    .forEach((id) => {
      console.log(`    ~${estimate[id]} hits  ${AUDIENCE_PROFILES[id].label}`);
    });

  mkdirSync(opts.outDir, { recursive: true });
  const mixPath = join(opts.outDir, `traffic-mix-${seed}.json`);
  writeFileSync(mixPath, JSON.stringify(runMeta, null, 2));
  console.log(`  Mix saved:    ${mixPath}`);

  if (opts.dryRun) {
    console.log('\nDry run — no browser traffic sent.');
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('\nPlaywright is required. Run:');
    console.error('  npm install -D playwright');
    console.error('  npx playwright install chromium');
    process.exit(1);
  }

  const quota = createHitQuota(opts.hits);
  let errors = 0;
  const started = Date.now();

  const onHit = () => {
    if (quota.done % 100 === 0 || quota.done === opts.hits) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = quota.done / elapsed;
      const eta = Math.round((opts.hits - quota.done) / Math.max(rate, 0.01));
      console.log(`  Progress: ${quota.done}/${opts.hits} hits (${rate.toFixed(1)}/s, ~${eta}s left)`);
    }
  };

  const onError = (profileId, path, err) => {
    errors += 1;
    if (errors <= 10) {
      console.warn(`  WARN ${profileId} ${path}: ${err.message}`);
    }
  };

  console.log('\nStarting browsers…');
  const browser = await chromium.launch({ headless: true });

  const workers = Array.from({ length: opts.concurrency }, (_, i) => runVisitor(
    browser,
    origin,
    mix,
    createRng((seed + 1009 * (i + 1)) >>> 0),
    quota,
    onHit,
    onError,
  ));

  await Promise.all(workers);
  await browser.close();

  const summary = {
    ...runMeta,
    finishedAt: new Date().toISOString(),
    hitsCompleted: quota.done,
    errors,
    durationSec: Math.round((Date.now() - started) / 1000),
  };
  const summaryPath = join(opts.outDir, `traffic-run-${seed}.json`);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\nDone.');
  console.log(`  Hits:     ${quota.done}/${opts.hits}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Duration: ${summary.durationSec}s`);
  console.log(`  Summary:  ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
