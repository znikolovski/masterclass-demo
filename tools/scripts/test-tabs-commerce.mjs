#!/usr/bin/env node
/**
 * Run: node tools/scripts/test-tabs-commerce.mjs [http://localhost:3000] [screenshot-directory]
 */
import assert from 'node:assert/strict';
import path from 'node:path';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3000';
const screenshots = process.argv[3];
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /product-recommendations|failed to load module/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await page.goto(`${base}/gear`);
  const tabs = page.locator('.tabs-activity');
  await tabs.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.tabs-activity')?.dataset.blockStatus === 'loaded');
  assert.equal(await tabs.locator('table').count(), 0, 'gear insert tables become blocks');
  const buttons = tabs.getByRole('tab');
  const tabCount = await buttons.count();
  /* eslint-disable no-await-in-loop -- interactions share one page and must be sequential */
  for (let i = 0; i < tabCount; i += 1) {
    await buttons.nth(i).click();
    const panel = tabs.locator('[role="tabpanel"][aria-hidden="false"]');
    await panel.locator('a[href*="/shop/products/"]').first().waitFor({ timeout: 60000 });
    assert.equal(await panel.locator('.product-recommendations').getAttribute('data-block-status'), 'loaded');
    assert.equal(await buttons.nth(i).getAttribute('aria-selected'), 'true');
    process.stdout.write(`PASS live products in ${await buttons.nth(i).innerText()} tab\n`);
  }
  const widths = [390, 768, 1440];
  for (let i = 0; i < widths.length; i += 1) {
    const width = widths[i];
    await page.setViewportSize({ width, height: 1000 });
    await tabs.scrollIntoViewIfNeeded();
    const layout = await tabs.evaluate((block) => {
      const panel = block.querySelector('[aria-hidden="false"]');
      return {
        panelWidth: panel.getBoundingClientRect().width,
        productsWidth: panel.querySelector('.product-recommendations').getBoundingClientRect().width,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    assert(Math.abs(layout.panelWidth - layout.productsWidth) < 2, 'commerce uses the full panel width');
    assert(layout.overflow <= 1, `no page overflow at ${width}px: ${layout.overflow}`);
    if (screenshots) await tabs.screenshot({ path: path.join(screenshots, `tabs-commerce-${width}.png`) });
    process.stdout.write(`PASS responsive commerce at ${width}px\n`);
  }
  /* eslint-enable no-await-in-loop */

  // Exercise all commerce names and future custom formats through the real EDS loader,
  // with deterministic decorators instead of unrelated account/cart/backend behavior.
  const names = [
    'cards-commerce', 'product-recommendations', 'product-details', 'product-list-page',
    'commerce-cart', 'commerce-checkout', 'commerce-account', 'commerce-order', 'shop-hero',
    'custom-gear-offer',
  ];
  const fixturePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  fixturePage.on('pageerror', (error) => errors.push(error.message));
  fixturePage.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await fixturePage.route('**/blocks/*/*.js', (route) => {
    const name = new URL(route.request().url()).pathname.split('/')[2];
    if (!names.includes(name)) return route.continue();
    return route.fulfill({
      contentType: 'text/javascript',
      body: `export default function decorate(block) {
        block.dataset.authored = JSON.stringify([...block.children].map(row =>
          [...row.children].map(cell => cell.innerHTML)));
        block.innerHTML = '<h3>Rendered commerce</h3><p>Product content</p>';
      }`,
    });
  });
  await fixturePage.route('**/blocks/*/*.css', (route) => {
    const name = new URL(route.request().url()).pathname.split('/')[2];
    return names.includes(name)
      ? route.fulfill({ contentType: 'text/css', body: '' }) : route.continue();
  });
  const inserts = names.map((name, i) => `<div><div>${name}</div><div>
    <h3>Authored heading ${i}</h3>
    <div class="tableWrapper"><table><tbody>
      <tr><td colspan="2">${name}${i === 0 ? ' (compact, featured)' : ''}</td></tr>
      <tr><td>sku</td><td><strong>WKND-LGT-001</strong><a href="/shop/products/lantern">Gear</a></td></tr>
    </tbody></table></div>
    <p>After the block</p>
  </div></div>`).join('');
  await fixturePage.route('**/__tabs-commerce-test', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/styles/styles.css">
    </head><body><main><div class="section"><div><div class="tabs-activity">
      ${inserts}
      <div><div>Plain content</div><div>
        <p>WKND-LGT-001 <a href="/shop/products/lantern">Product link</a></p>
        <table><tr><th>SKU</th><th>Price</th></tr><tr><td>WKND-LGT-001</td><td>25</td></tr></table>
        <table><tr><td colspan="2">Price list</td></tr><tr><td>Lantern</td><td>25</td></tr></table>
        <table></table>
      </div></div>
      <div><div>Activity cards</div><div>
        <p><picture><img alt="Climbing" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></picture></p>
        <p>Climbing</p><h3>Original activity card</h3><p>Card description</p>
      </div></div>
    </div></div></div></main><script type="module">
      import { decorateBlock, loadBlock } from '/scripts/aem.js';
      const block = document.querySelector('.tabs-activity');
      decorateBlock(block);
      await loadBlock(block);
    </script></body></html>`,
  }));
  await fixturePage.goto(`${base}/__tabs-commerce-test`);
  await fixturePage.waitForFunction(() => document.querySelector('.tabs-activity')?.dataset.blockStatus === 'loaded');
  const fixture = fixturePage.locator('.tabs-activity');
  assert.equal(await fixture.locator('.block[data-block-status="loaded"]').count(), names.length);
  assert.equal(await fixture.locator('.tableWrapper').count(), 0, 'no leftover insert wrappers');
  assert.equal(await fixture.locator('table').count(), 3, 'ordinary and empty tables are preserved');
  assert.equal(await fixture.locator('.activity-card-grid .activity-card').count(), 1, 'flat cards still render');
  assert.equal(await fixture.getByText('After the block', { exact: true }).count(), names.length);
  assert.equal(await fixture.locator('.cards-commerce.compact.featured').count(), 1, 'variants are preserved');
  await Promise.all(names.map(async (name) => {
    const authored = JSON.parse(await fixture.locator(`.${name}`).getAttribute('data-authored'));
    assert.match(authored[0][1], /<strong>WKND-LGT-001<\/strong>/);
    assert.match(authored[0][1], /href="\/shop\/products\/lantern"/);
  }));
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  process.stdout.write('PASS all commerce names, custom formats, variants, rich content, ordinary tables, and activity cards\n');
} finally {
  await browser.close();
}
