#!/usr/bin/env node
/* eslint-disable no-await-in-loop, no-restricted-syntax -- scenarios share one browser */
import assert from 'node:assert/strict';
import { chromium } from 'playwright'; // eslint-disable-line import/no-extraneous-dependencies

const base = process.argv[2] || 'http://localhost:3000';
const endpoint = 'https://wknd-adventures.run.place/faq-accordion';
const rendered = '<div class="accordion-faq"><div><details class="accordion-faq-item"><summary class="accordion-faq-item-label"><p>Can I go solo?</p></summary><div class="accordion-faq-item-body"><p>Check the route conditions first.</p></div></details></div></div>';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let requests = [];
  let status = 200;
  let body = rendered;
  await page.route(`${endpoint}?*`, (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      status,
      body,
      contentType: 'text/html',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  await page.route('https://workspace.example/__faq-test', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<iframe src="${base}/__faq-frame"></iframe>`,
  }));
  await page.route(`${base}/__faq-frame`, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><link rel="stylesheet" href="/blocks/accordion-faq/accordion-faq.css"></head><body><main></main></body></html>',
  }));
  await page.goto('https://workspace.example/__faq-test');
  const frame = page.frames().find((candidate) => candidate.url() === `${base}/__faq-frame`);
  assert.ok(frame, 'Workspace preview iframe loaded');
  const decorate = (markup) => frame.evaluate(async (html) => {
    document.querySelector('main').innerHTML = html;
    window.adobeDataLayer = [];
    // eslint-disable-next-line import/no-unresolved, import/no-absolute-path -- browser module
    const { default: render } = await import('/blocks/accordion-faq/accordion-faq.js');
    await render(document.querySelector('.accordion-faq'));
  }, markup);

  await decorate('<div class="accordion-faq wide" data-author-id="faq"><div><div>home & trips</div></div></div>');
  assert.equal(new URL(requests[0]).searchParams.get('tag'), 'home & trips');
  assert.equal(await frame.locator('.accordion-faq details').count(), 1);
  assert.equal(await frame.locator('.accordion-faq .accordion-faq').count(), 0, 'No nested block');
  assert.equal(await frame.locator('.accordion-faq').getAttribute('data-author-id'), 'faq');
  assert.equal(await frame.locator('.accordion-faq').getAttribute('aria-busy'), null);
  for (const width of [375, 768, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await frame.locator('summary').click();
    assert.equal(await frame.locator('details').getAttribute('open'), '');
    await frame.locator('.accordion-faq-item-body').waitFor({ state: 'visible' });
    await frame.waitForFunction(() => window.adobeDataLayer.length > 0);
    assert.equal(await frame.evaluate(() => window.adobeDataLayer.at(-1).event), 'faqExpand');
    await frame.locator('summary').click();
    assert.equal(await frame.locator('details').getAttribute('open'), null);
  }

  requests = [];
  await decorate('<div class="accordion-faq"><div><div>Authored question?</div><div><p>Read <a href="/safety">safety advice</a>.</p></div></div></div>');
  assert.equal(await frame.locator('details').count(), 1);
  assert.equal(await frame.locator('details a').getAttribute('href'), '/safety');
  await decorate(rendered);
  assert.equal(await frame.locator('details').count(), 1);
  assert.equal(requests.length, 0, 'Authored and server-rendered FAQs do not fetch');

  for (const [responseStatus, responseBody] of [[404, 'Not found'], [200, '<html>Wrong endpoint</html>'], [200, '<div class="accordion-faq"></div>']]) {
    status = responseStatus;
    body = responseBody;
    await decorate('<div class="accordion-faq"><div><div>missing</div></div></div>');
    assert.equal(await frame.locator('[role="status"]').textContent(), 'FAQs are temporarily unavailable. Please try again later.');
    assert.equal(await frame.locator('.accordion-faq').getAttribute('aria-busy'), null);
  }
  requests = [];
  await decorate('<div class="accordion-faq"><div><div> </div></div></div>');
  assert.equal(requests.length, 0, 'Empty tags do not fetch');
  assert.deepEqual(errors, []);
  // eslint-disable-next-line no-console
  console.log('FAQ iframe: cross-origin tag loading, analytics, authored/prerendered content, responsive interaction and explicit failure states passed.');
} finally {
  await browser.close();
}
