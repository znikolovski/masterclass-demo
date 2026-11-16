#!/usr/bin/env node
/* eslint-disable no-await-in-loop, no-restricted-syntax -- scenarios share one browser */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies

const base = process.argv[2] || 'http://localhost:3000';
const content = await readFile(new URL('../../drafts/columns-gallery-youtube-test.plain.html', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route(`${base}/__gallery-test`, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><link rel="stylesheet" href="/styles/styles.css"></head><body class="appear"><main>${content}</main></body></html>`,
  }));
  await page.goto(`${base}/__gallery-test`);
  await page.evaluate(async () => {
    window.hlx = { codeBasePath: '', suppressLoadPage: true };
    window.galleryPlayers = [];
    window.YT = {
      PlayerState: { PLAYING: 1, ENDED: 0 },
      Player: function Player(id, config) {
        const iframe = document.createElement('iframe');
        iframe.title = 'YouTube video player';
        iframe.dataset.videoId = config.videoId;
        document.getElementById(id).replaceWith(iframe);
        window.galleryPlayers.push(config);
      },
    };
    // Exercise orphan adoption on bare authored markup before section wrapping.
    // eslint-disable-next-line import/no-unresolved, import/no-absolute-path -- browser module
    const { default: decorateGallery } = await import('/blocks/columns-gallery/columns-gallery.js');
    await decorateGallery(document.querySelectorAll('.columns-gallery')[1]);
    // eslint-disable-next-line import/no-unresolved, import/no-absolute-path -- browser module
    const { decorateMain } = await import('/scripts/scripts.js');
    decorateMain(document.querySelector('main'));
  });
  assert.equal(await page.locator('.columns-gallery.block').count(), 3, 'Nested videos must not hide gallery roots from discovery');
  await page.evaluate(async () => {
    // eslint-disable-next-line import/no-unresolved, import/no-absolute-path -- browser module
    const { loadBlock } = await import('/scripts/aem.js');
    await Promise.all([...document.querySelectorAll('.columns-gallery')].map(loadBlock));
    document.querySelectorAll('.section').forEach((section) => {
      section.style.display = '';
      section.dataset.sectionStatus = 'loaded';
    });
  });
  assert.equal(await page.locator('.columns-gallery iframe').count(), 3);
  assert.equal(await page.locator('.youtube-video[data-block-status="loaded"]').count(), 4);
  assert.equal(await page.locator('.youtube-video-caption').textContent(), 'Gallery field recap');
  assert.equal(await page.locator('.youtube-video-error').count(), 1);
  assert.equal(await page.locator('.columns-gallery').first().locator('p > .youtube-video').count(), 0, 'Media-only paragraph wrappers must not add spacing');
  assert.match(await page.locator('.columns-gallery').nth(2).textContent(), /Keep this supporting copy\./);
  assert.equal(await page.locator('.columns-gallery').nth(1).locator(':scope > div').count(), 2, 'Orphan image is adopted');
  assert.equal(await page.locator('img[alt="Orphan wide image"]').count(), 1);
  await page.locator('img').evaluateAll((images) => {
    images.forEach((image) => { image.loading = 'eager'; });
  });
  await page.waitForFunction(() => [...document.querySelectorAll('img')].every((image) => image.complete && image.naturalWidth > 0));
  assert.equal(await page.locator('.columns-gallery').nth(1).locator('.columns-gallery-img-col').count(), 3);
  for (const width of [375, 768, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.columns-gallery').first().evaluate((gallery) => {
      const row = gallery.firstElementChild;
      const image = row.querySelector('img').getBoundingClientRect();
      const video = row.querySelector('iframe').getBoundingClientRect();
      const wide = gallery.children[1].querySelector('iframe').getBoundingClientRect();
      return {
        columns: getComputedStyle(row).gridTemplateColumns.split(' ').length,
        imageRatio: image.width / image.height,
        videoRatio: video.width / video.height,
        wideHeight: wide.height,
        overflows: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    assert.equal(layout.columns, width >= 900 ? 3 : 1);
    assert.ok(Math.abs(layout.imageRatio - 4 / 3) < 0.02, JSON.stringify({ width, ...layout }));
    assert.ok(Math.abs(layout.videoRatio - 4 / 3) < 0.02, 'Grid video matches image slot');
    assert.equal(layout.wideHeight, 360);
    assert.equal(layout.overflows, false);
    if (process.env.GALLERY_SCREENSHOT_DIR) {
      await page.locator('.columns-gallery').first().screenshot({
        path: `${process.env.GALLERY_SCREENSHOT_DIR}/gallery-${width}.png`,
      });
    }
  }
  await page.evaluate(async () => {
    window.adobeDataLayer = [];
    const config = window.galleryPlayers[0];
    config.events.onStateChange({ data: 1 });
    config.events.onStateChange({ data: 0 });
    // eslint-disable-next-line import/no-unresolved, import/no-absolute-path -- browser module
    const { loadBlock } = await import('/scripts/aem.js');
    await Promise.all([...document.querySelectorAll('.youtube-video')].map(loadBlock));
  });
  assert.equal(await page.evaluate(() => window.galleryPlayers.length), 3, 'Players initialize only once');
  assert.deepEqual(await page.evaluate(() => window.adobeDataLayer.map(({ event }) => event)), ['videoStart', 'videoComplete']);
  assert.deepEqual(errors, []);
  // eslint-disable-next-line no-console
  console.log('Gallery: nested block discovery/loading, grid/wide videos, captions, analytics, invalid URLs, empty cells, orphan images and responsive layout passed.');
} finally {
  await browser.close();
}
