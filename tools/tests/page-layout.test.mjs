import assert from 'node:assert/strict';
import { test } from 'node:test';
// eslint-disable-next-line import/no-extraneous-dependencies -- browser test dependency
import { chromium } from 'playwright';

const baseUrl = process.env.PAGE_LAYOUT_BASE_URL;

test('hero pages paint their decorated layout without cumulative layout shift', {
  skip: !baseUrl && 'Set PAGE_LAYOUT_BASE_URL to a local AEM dev server.',
}, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());

  // eslint-disable-next-line no-restricted-syntax -- avoid CPU contention between measurements
  for (const width of [390, 1350]) {
    // eslint-disable-next-line no-restricted-syntax -- each case owns a separate cold browser page
    for (const path of ['/blog/yosemite-rock-climbing', '/gear']) {
      // eslint-disable-next-line no-await-in-loop -- concurrent measurements distort CLS timings
      await t.test(`${path} at ${width}px`, async (subtest) => {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        subtest.after(() => page.close());
        const errors = [];
        const imageRequests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (request.resourceType() === 'image') imageRequests.push(new URL(request.url()));
        });
        if (width === 1350 && path.includes('/blog/')) {
          // The head can insert this link before eager loading checks it.
          await page.route('**/blocks/hero-adventure/hero-adventure.css', async (route) => {
            await page.waitForTimeout(1000);
            await route.continue();
          });
        }
        await page.addInitScript(() => {
          window.layoutResult = {
            cls: 0, shifts: [], revealHeroStatus: null,
          };
          let sessionValue = 0;
          let sessionStart = 0;
          let previousShift = 0;
          new PerformanceObserver((list) => {
            list.getEntries().filter((entry) => !entry.hadRecentInput).forEach((entry) => {
              if (entry.startTime - previousShift < 1000
                && entry.startTime - sessionStart < 5000) {
                sessionValue += entry.value;
              } else {
                sessionValue = entry.value;
                sessionStart = entry.startTime;
              }
              previousShift = entry.startTime;
              window.layoutResult.cls = Math.max(window.layoutResult.cls, sessionValue);
              window.layoutResult.shifts.push({
                value: entry.value,
                time: entry.startTime,
                sources: entry.sources.map((source) => ({
                  node: source.node?.outerHTML?.slice(0, 180),
                  before: source.previousRect.toJSON(),
                  after: source.currentRect.toJSON(),
                })),
              });
            });
          }).observe({ type: 'layout-shift', buffered: true });
          const observer = new MutationObserver(() => {
            if (document.body?.classList.contains('appear')) {
              window.layoutResult.revealHeroStatus = document
                .querySelector('.hero-adventure')?.dataset.blockStatus;
              observer.disconnect();
            }
          });
          observer.observe(document, { attributes: true, childList: true, subtree: true });
        });
        await page.goto(new URL(path, baseUrl).href, { waitUntil: 'domcontentloaded' });
        await page.locator('body.appear .hero-adventure[data-block-status="loaded"]')
          .waitFor({ state: 'visible' });
        await page.waitForTimeout(6000);
        const result = await page.evaluate(() => window.layoutResult);
        assert.equal(result.revealHeroStatus, 'loaded');
        assert.ok(result.cls <= 0.1, `CLS ${result.cls}: ${JSON.stringify(result.shifts)}`);
        assert.deepEqual(errors, []);
        assert.equal(await page.locator('.hero-adventure h1').isVisible(), true);
        const providerStart = await page.evaluate(() => performance
          .getEntriesByType('resource')
          .find((entry) => entry.name.startsWith('https://fonts.googleapis.com/css2'))?.startTime);
        assert.equal(
          providerStart,
          undefined,
          'Registered font subsets must not require a redundant provider stylesheet.',
        );
        const heroSrc = new URL(await page.locator('.hero-adventure > div:first-child img')
          .getAttribute('src'));
        const heroOrigins = new Set(imageRequests
          .filter((url) => url.pathname === heroSrc.pathname).map((url) => url.origin));
        assert.deepEqual(
          [...heroOrigins],
          [new URL(baseUrl).origin],
          'Do not download the same EDS hero from both the live OG URL and preview origin.',
        );
      });
    }
  }

  await t.test('extended glyphs have both final fonts before page reveal', async (subtest) => {
    const page = await browser.newPage();
    subtest.after(() => page.close());
    await page.route(new URL('/gear', baseUrl).href, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i,
        '$1Ā Ł — Gear$2',
      );
      await route.fulfill({ response, body });
    });
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.body?.classList.contains('appear')) {
          window.extendedFontsAtReveal = [...document.fonts]
            .filter((face) => /U\+0?100-0?2BA/i.test(face.unicodeRange))
            .map(({ family, status }) => ({ family, status }));
          observer.disconnect();
        }
      });
      observer.observe(document, { attributes: true, childList: true, subtree: true });
    });
    await page.goto(new URL('/gear', baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.locator('body.appear .hero-adventure h1').waitFor({ state: 'visible' });
    const fonts = await page.evaluate(() => window.extendedFontsAtReveal);
    assert.equal(fonts.length, 2, 'Both heading and body extended subsets must exist.');
    assert.ok(fonts.every(({ status }) => status === 'loaded'), JSON.stringify(fonts));
  });

  await t.test('a failed font service does not leave the page hidden', async (subtest) => {
    const page = await browser.newPage();
    subtest.after(() => page.close());
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.goto(new URL('/gear', baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.locator('body.appear .hero-adventure h1').waitFor({ state: 'visible' });
  });
});
