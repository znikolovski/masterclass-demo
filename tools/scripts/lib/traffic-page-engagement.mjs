/**
 * Playwright page engagement for Analytics demo traffic.
 * Scrolls for asset impressions, clicks images, and walks form funnels
 * (impression → start → steps → submit / validation error / abandon).
 */

import { createRng } from './traffic-visitors.mjs';

export const DEFAULT_ENGAGEMENT_OPTS = {
  lazySectionsMs: 2500,
  martechSettleMs: 5500,
  postEngagementMs: 2000,
};

const ANALYTICS_URL_PATTERNS = [/edge\.adobedc\.net/, /adobedc\.net/, /\/ee\//, /interact/, /collect\?/];

/**
 * @param {string} text
 */
function hashString(text) {
  let h = 1;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return h;
}

/**
 * @param {import('playwright').Page} page
 * @param {object} [opts]
 */
export async function waitForPageAnalyticsReady(page, opts = DEFAULT_ENGAGEMENT_OPTS) {
  await page.waitForFunction(
    () => typeof window.adobeDataLayer?.push === 'function',
    { timeout: 20000 },
  ).catch(() => {});

  await page.waitForTimeout(opts.lazySectionsMs);
  await page.waitForTimeout(opts.martechSettleMs);
}

/**
 * @param {import('playwright').Page} page
 * @param {number} [minHits]
 * @param {number} [timeoutMs]
 */
export async function waitForAnalyticsBeacons(page, minHits = 1, timeoutMs = 12000) {
  let seen = 0;
  const onResponse = (resp) => {
    if (ANALYTICS_URL_PATTERNS.some((re) => re.test(resp.url()))) {
      seen += 1;
    }
  };
  page.on('response', onResponse);
  const started = Date.now();
  const poll = async () => {
    while (seen < minHits && Date.now() - started < timeoutMs) {
      await page.waitForTimeout(250);
    }
  };
  await poll();
  page.off('response', onResponse);
}

/**
 * @param {import('playwright').Locator} form
 * @param {import('playwright').Page} page
 */
async function waitForFormReady(form, page) {
  try {
    await page.waitForSelector('main form', { timeout: 8000 });
  } catch {
    return false;
  }
  await form.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);

  await page.waitForFunction(() => {
    const selects = [...document.querySelectorAll('main form select')];
    return selects.every((sel) => sel.dataset.enumLoad !== 'pending'
      || sel.options.length > 1);
  }, { timeout: 12000 }).catch(() => {});

  return true;
}

/**
 * @param {import('playwright').Locator} form
 * @param {string} name
 * @param {string} value
 */
async function fillIfPresent(form, name, value) {
  const field = form.locator(`[name="${name}"]`).first();
  if (await field.count() === 0) return false;
  const tag = await field.evaluate((el) => el.tagName);
  if (tag === 'SELECT') {
    const optionCount = await field.locator('option').count();
    if (optionCount > 1) await field.selectOption({ index: 1 });
  } else {
    await field.fill(value);
  }
  await field.blur();
  return true;
}

/**
 * @param {import('playwright').Page} page
 * @param {() => number} rng
 */
export async function simulateAssetEngagement(page, rng) {
  const clickProb = 0.12 + rng() * 0.18;
  return page.evaluate(async ({ probability }) => {
    const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
    const main = document.querySelector('main');
    if (!main) return { scrolled: false, candidateImages: 0, clicks: 0 };

    const maxScroll = Math.max(document.body.scrollHeight, main.scrollHeight);
    const step = Math.max(240, Math.floor(maxScroll / 8));
    const scrollStops = [];
    for (let y = 0; y <= maxScroll; y += step) scrollStops.push(y);
    await scrollStops.reduce(
      (chain, y) => chain.then(() => {
        window.scrollTo(0, y);
        return sleep(180);
      }),
      Promise.resolve(),
    );

    const imgs = [...main.querySelectorAll('img[src]')].filter((img) => {
      const rect = img.getBoundingClientRect();
      return rect.width > 40 && rect.height > 40;
    });

    const clickTargets = imgs.slice(0, 12).filter(() => Math.random() < probability);
    await clickTargets.reduce(
      (chain, img) => chain.then(() => {
        img.scrollIntoView({ block: 'center' });
        return sleep(120).then(() => {
          img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
      }),
      Promise.resolve(),
    );

    return {
      scrolled: true,
      candidateImages: imgs.length,
      clicks: clickTargets.length,
    };
  }, { probability: clickProb });
}

/**
 * @param {import('playwright').Page} page
 * @param {() => number} rng
 * @param {{ visitorId: string }} meta
 */
export async function simulateFormEngagement(page, rng, { visitorId }) {
  const form = page.locator('main form').first();
  const ready = await waitForFormReady(form, page);
  if (!ready || (await form.count()) === 0) {
    return { outcome: 'none', formSlug: null };
  }

  const formSlug = await form.evaluate((el) => el.dataset.formSlug
    || el.dataset.action?.match(/\/api\/forms\/([^/?#]+)/i)?.[1]
    || 'form');

  const roll = rng();
  let outcome;
  if (roll < 0.32) outcome = 'impression-only';
  else if (roll < 0.58) outcome = 'abandon';
  else if (roll < 0.72) outcome = 'validation-error';
  else outcome = 'submit';

  const numericId = visitorId.replace(/\D/g, '') || '00001';
  const email = `sim.${numericId}@wknd-traffic.demo`;
  const displayName = 'WKND Sim Visitor';

  const focusable = form.locator(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea',
  ).first();
  if (await focusable.count()) {
    await focusable.focus();
    await page.waitForTimeout(250);
  }

  if (outcome === 'impression-only') {
    return { outcome, formSlug };
  }

  if (outcome === 'abandon') {
    await fillIfPresent(form, 'name', displayName);
    await fillIfPresent(form, 'contactName', displayName);
    await page.waitForTimeout(350);
    return { outcome, formSlug };
  }

  if (outcome === 'validation-error') {
    await fillIfPresent(form, 'email', 'not-an-email');
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(600);
    return { outcome, formSlug };
  }

  await fillIfPresent(form, 'name', displayName);
  await fillIfPresent(form, 'contactName', displayName);
  await fillIfPresent(form, 'company', 'WKND Sim Co');
  await fillIfPresent(form, 'email', email);
  await fillIfPresent(form, 'dates', 'Summer 2026');
  await fillIfPresent(form, 'groupSize', '2');
  await fillIfPresent(form, 'teamSize', '4');
  await fillIfPresent(form, 'notes', 'Simulated interest from traffic demo.');
  await fillIfPresent(form, 'message', 'Simulated contact from traffic demo.');

  const adventureSelect = form.locator('select[name*="adventure"], .field-adventure select').first();
  if (await adventureSelect.count()) {
    const options = await adventureSelect.locator('option').count();
    if (options > 1) await adventureSelect.selectOption({ index: 1 });
  }

  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(1800);

  const successVisible = await page.locator('main .form-message.success-message').count();
  return {
    outcome: successVisible ? 'submit-success' : 'submit-attempt',
    formSlug,
  };
}

/**
 * @param {import('playwright').Page} page
 * @param {() => number} rng
 * @param {{ visitorId: string, path: string, seed: number }} meta
 * @param {object} [opts]
 */
export async function simulatePageEngagement(page, rng, meta, opts = DEFAULT_ENGAGEMENT_OPTS) {
  const stats = {
    assetClicks: 0,
    assetCandidates: 0,
    formOutcome: 'none',
    formSlug: null,
  };

  await waitForPageAnalyticsReady(page, opts);

  const asset = await simulateAssetEngagement(page, rng);
  stats.assetClicks = asset.clicks;
  stats.assetCandidates = asset.candidateImages;

  const form = await simulateFormEngagement(page, rng, meta);
  stats.formOutcome = form.outcome;
  stats.formSlug = form.formSlug;

  await page.waitForTimeout(opts.postEngagementMs);
  await waitForAnalyticsBeacons(page, 1, 10000);

  return stats;
}

/**
 * @param {string} visitorId
 * @param {string} path
 * @param {number} seed
 */
export function engagementRng(visitorId, path, seed) {
  return createRng(hashString(`${seed}:${visitorId}:${path}`));
}

/**
 * @param {object} totals
 * @param {object} stats
 */
export function mergeEngagementStats(totals, stats) {
  totals.pagesEngaged += 1;
  totals.assetClicks += stats.assetClicks || 0;
  totals.assetCandidates += stats.assetCandidates || 0;
  if (stats.formOutcome && stats.formOutcome !== 'none') {
    totals.formPages += 1;
    totals.formOutcomes[stats.formOutcome] = (totals.formOutcomes[stats.formOutcome] || 0) + 1;
    if (stats.formSlug) {
      totals.formSlugs[stats.formSlug] = (totals.formSlugs[stats.formSlug] || 0) + 1;
    }
  }
}

/**
 * @returns {object}
 */
export function createEngagementTotals() {
  return {
    pagesEngaged: 0,
    assetClicks: 0,
    assetCandidates: 0,
    formPages: 0,
    formOutcomes: {},
    formSlugs: {},
  };
}
