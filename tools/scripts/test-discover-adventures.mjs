#!/usr/bin/env node
/* eslint-disable import/no-absolute-path, import/no-unresolved -- browser module imports */
/* eslint-disable no-restricted-syntax, no-await-in-loop -- viewports share one browser page */
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies

const base = process.argv[2] || 'http://localhost:3000';
const screenshots = process.argv[3];
const adventures = Array.from({ length: 15 }, (_, i) => ({
  adventure_id: `adventure-${i}`,
  title: `Adventure ${i + 1}`,
  activity: i % 2 ? 'Hiking' : 'Cycling',
  region: 'Europe',
  experience_level: 'Beginner',
  image_url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
}));
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`${base}/__discovery-widget`, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><link rel="stylesheet" href="/blocks/discover-adventures/discover-adventures.css"></head><body><main><div class="discover-adventures"></div></main></body></html>',
  }));
  await page.goto(`${base}/__discovery-widget`);
  const render = (payload) => page.evaluate(async (structuredContent) => {
    const { default: decorate } = await import('/blocks/discover-adventures/discover-adventures.js');
    window.discoveryMessages = [];
    await decorate(document.querySelector('.discover-adventures'), {
      hostContext: { preview: false },
      applyHostStyles: () => {},
      reportSize: () => {},
      sendMessage: (message) => window.discoveryMessages.push(message),
      toolResult: Promise.resolve({ structuredContent }),
    });
  }, payload);
  await render({ adventures, ranked: false });
  assert.equal(await page.locator('.da-card').count(), 15);
  assert.equal(await page.locator('.da-ribbon').count(), 0);
  assert.equal(await page.locator('img[loading="lazy"]').count(), 14);
  assert.equal(await page.locator('img[loading="eager"]').count(), 1);

  for (const width of [375, 768, 1200]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('.da-track').evaluate((track) => { track.scrollLeft = 0; });
    await page.waitForFunction(() => (
      document.querySelector('.da-nav-right').style.display === 'flex'
    ));
    await page.getByRole('button', { name: 'Scroll right' }).click();
    await page.waitForFunction(() => document.querySelector('.da-track').scrollLeft > 0);
    await page.locator('.da-track').evaluate((track) => {
      track.style.scrollBehavior = 'auto';
      track.scrollLeft = track.scrollWidth;
    });
    await page.waitForFunction(() => (
      document.querySelector('.da-nav-right').style.display === 'none'
    ));
    await page.locator('.da-card').last().getByRole('button', { name: 'Build My Briefing' }).click();
    assert.equal(
      await page.evaluate(() => window.discoveryMessages.at(-1)),
      'Build my briefing for Adventure 15',
    );
    const fits = await page.evaluate(() => (
      document.documentElement.scrollWidth <= window.innerWidth
    ));
    assert(fits, `Widget must not overflow the page at ${width}px`);
    if (screenshots) {
      await page.screenshot({ path: path.join(screenshots, `discovery-${width}.png`) });
    }
  }

  await render({ adventures: adventures.slice(0, 2), ranked: true });
  assert.equal(await page.locator('.da-ribbon').count(), 1);
  await render({ adventures: adventures.slice(0, 2) });
  assert.equal(await page.locator('.da-ribbon').count(), 1, 'Legacy results preserve ranking UI');
  await render({ adventures: [], ranked: false });
  assert.equal(await page.locator('.da-card').count(), 0);
  assert.equal(await page.locator('.da-empty').textContent(), 'No matching adventures were found.');
  assert.deepEqual(errors, []);
  // eslint-disable-next-line no-console
  console.log('Discovery widget: full catalog, final-card actions, responsive carousel, ranking and empty results passed.');
} finally {
  await browser.close();
}
