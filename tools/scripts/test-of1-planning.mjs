#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3000';
const screenshots = process.argv[3];
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const errors = [];
  const sourceErrors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('adventure planning')) {
      sourceErrors.push(message.text());
    }
  });
  const templates = await Promise.all(['comparison', 'recommendation', 'discovery', 'budget', 'deep-dive']
    .map(async (intent) => {
      const response = await page.request.get(`${base}/templates/of1/${intent}.plain.html`);
      assert(response.ok());
      return response.text();
    }));
  const response = await page.request.get(`${base}/of1/config/knowledge.json`);
  const entities = await response.json();
  const entries = entities.filter((entry) => entry.id.startsWith('planning-'));
  assert.equal(entries.length, 5);
  let template = templates[0];
  let headings = ['No curated destination'];
  await page.route('**/api/generate*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const html = await page.evaluate(({ source, titles }) => {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      [...doc.querySelectorAll('.hero-adventure h1, .cards h2, .cards h3')]
        .forEach((heading, index) => { heading.textContent = titles[index % titles.length]; });
      return [...doc.body.children].map((section) => section.innerHTML);
    }, { source: template, titles: headings });
    const events = html.map((section, index) => ({
      type: 'section', format: 'html', index, html: section, stylesheet: null,
    }));
    events.push(
      { type: 'suggestions', suggestions: [{ label: 'An Arctic escape', query: 'Lofoten surf gear' }] },
      { type: 'done', template: 'comparison', title: 'Planning regression' },
    );
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    });
    return undefined;
  });
  const ready = async () => {
    await page.locator('.generative-suggestions:not(.dimmed)').last().waitFor();
  };
  const verify = async (expected, previous = 0) => {
    await ready();
    const panels = page.locator('.adventure-planning:visible');
    assert.equal(await panels.count(), previous + (expected.length ? 1 : 0));
    if (!expected.length) return;
    const panel = panels.last();
    assert.equal(await panel.locator('h2').textContent(), 'Plan your adventure');
    assert.equal(await panel.locator('.adventure-planning-list > li').count(), expected.length);
    const items = panel.locator('.adventure-planning-list > li');
    await Promise.all(expected.map(async (entry, index) => {
      const item = items.nth(index);
      const text = await item.textContent();
      ['gear', 'route', 'access'].forEach((key) => {
        entry.planning[key].forEach((point) => assert(text.includes(point)));
      });
      assert(text.includes(entry.planning.caveat));
      assert.deepEqual(await item.locator('.adventure-planning-sources a').evaluateAll(
        (links) => links.map((link) => link.href),
      ), entry.planning.sources.map((source) => source.url));
      assert.equal(await item.locator('details').count(), 3);
      assert.equal(await item.locator('details[open]').count(), 1);
    }));
    assert(await panel.evaluate((block) => (
      block.closest('.section').previousElementSibling.querySelector('.adventure-facts')
      && block.closest('.section').nextElementSibling.querySelector('.aero-options')
      && !block.closest('.cards')
    )));
    assert((await panel.textContent()).includes('not a complete safety checklist'));
  };
  await entries.reduce(async (previous, entry, index) => {
    await previous;
    template = templates[index];
    await page.goto(`${base}/of1?llm_app_ctx=${encodeURIComponent(entry.planning.destinationTerms[0])}`);
    await verify([entry]);
  }, Promise.resolve());
  process.stdout.write('PASS five destinations and templates, exact source-backed points, links and placement\n');

  [template] = templates;
  await page.goto(`${base}/of1?q=Compare%20Patagonia%20and%20Yosemite`);
  await verify([entries[0], entries[1]]);
  const panel = page.locator('.adventure-planning:visible');
  const gear = panel.locator('summary').filter({ hasText: 'Gear checklist' }).first();
  await gear.focus();
  await gear.press('Enter');
  assert.equal(await gear.evaluate((summary) => summary.parentElement.open), true);
  await gear.press('Space');
  assert.equal(await gear.evaluate((summary) => summary.parentElement.open), false);
  await [375, 768, 900, 1200].reduce(async (previous, width) => {
    await previous;
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await panel.locator('.adventure-planning-list').evaluate((list) => (
      getComputedStyle(list).gridTemplateColumns.split(' ').length
    )), width < 600 ? 1 : 2);
    assert(await panel.locator('summary, a').evaluateAll((controls) => controls.every((control) => {
      const rect = control.getBoundingClientRect();
      return rect.height >= 44 && rect.left >= 0 && rect.right <= window.innerWidth;
    })));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert(await page.locator('main > .section.generated-section:not(.hero-adventure-container)')
      .evaluateAll((sections) => sections.every((section) => (
        getComputedStyle(section).paddingTop === '24px'
        && getComputedStyle(section).paddingBottom === '24px'
      ))));
    assert.equal(await page.locator('.generated-section.hero-adventure-container')
      .evaluate((section) => getComputedStyle(section).paddingBlock), '0px');
    if (screenshots) await panel.screenshot({ path: path.join(screenshots, `of1-planning-${width}.png`) });
  }, Promise.resolve());
  if (screenshots) {
    await page.screenshot({ path: path.join(screenshots, 'of1-spacing-after.png'), fullPage: true });
  }
  process.stdout.write('PASS accessible controls, responsive layout and compact section spacing at 375/768/900/1200px\n');

  const followUp = page.locator('.generative-suggestions:not(.dimmed) .suggestion-input');
  await followUp.fill('Ladakh permits and gear');
  await followUp.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 2);
  await verify([entries[4]], 1);
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 3);
  await verify([entries[2]], 2);
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-input').fill('Costa Rica');
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-submit').click();
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 4);
  await verify([], 3);
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-restart').click();
  await page.waitForURL(`${base}/of1`);
  assert.equal(await page.locator('.adventure-planning').count(), 0);
  await page.locator('.of1-input').fill('Ohrid');
  await page.locator('.of1-submit').click();
  await verify([entries[3]]);
  headings = ['Ladakh trekking', 'Patagonia trekking'];
  await page.goto(`${base}/of1?q=Recommend%20trekking`);
  await verify([entries[0], entries[4]]);
  headings = ['Patagonia trekking'];
  await page.goto(`${base}/of1?q=Yosemite`);
  await verify([entries[1]]);
  headings = ['No curated destination'];
  await page.goto(`${base}/of1?q=Yosemitesque`);
  await verify([]);
  await page.goto(`${base}/templates/of1/comparison`);
  await page.locator('.cards[data-block-status="loaded"]').waitFor();
  assert.equal(await page.locator('.adventure-planning').count(), 0);
  await [375, 900, 1200].reduce(async (previous, width) => {
    await previous;
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('.section.cards-container')
      .evaluate((section) => getComputedStyle(section).paddingBlock), width < 900 ? '80px' : '100px');
  }, Promise.resolve());
  assert.deepEqual(errors, []);
  assert.deepEqual(sourceErrors, []);
  process.stdout.write('PASS follow-ups, chips, restart, heading fallback, query priority and authored isolation\n');

  await page.route('**/of1/config/knowledge.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(`${base}/of1?q=Ohrid`);
  await ready();
  await page.locator('.adventure-planning [role="status"]').waitFor();
  assert.equal(await page.locator('.adventure-planning a').count(), 0);
  await page.unroute('**/of1/config/knowledge.json');
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-input').fill('Yosemite');
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-submit').click();
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 2);
  await verify([entries[1]], 1);
  const invalid = JSON.parse(JSON.stringify(entities));
  invalid.find((entry) => entry.id === 'planning-ohrid-macedonia').planning.sources[0].url = 'http://example.invalid/source';
  await page.route('**/of1/config/knowledge.json', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(invalid),
  }));
  await page.goto(`${base}/of1?q=Ohrid`);
  await ready();
  await page.locator('.adventure-planning [role="status"]').waitFor();
  assert.equal(await page.locator('.adventure-planning a').count(), 0);
  assert(sourceErrors.some((message) => message.includes('Invalid source-backed planning')));
  process.stdout.write('PASS explicit source failure, next-turn recovery and invalid-source rejection\n');
} finally {
  await browser.close();
}
