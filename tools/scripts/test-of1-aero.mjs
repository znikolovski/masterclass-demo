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
    if (message.type() === 'error' && /Aero|aero-options/.test(message.text())) {
      sourceErrors.push(message.text());
      process.stderr.write(`${message.text()}\n`);
    }
  });
  const templates = await Promise.all(['comparison', 'recommendation', 'discovery', 'budget', 'deep-dive']
    .map(async (intent) => {
      const response = await page.request.get(`${base}/templates/of1/${intent}.plain.html`);
      assert(response.ok());
      return response.text();
    }));
  const catalogResponse = await page.request.get(`${base}/of1/config/knowledge.json`);
  const entries = (await catalogResponse.json()).filter((entry) => entry.id.startsWith('aero-'));
  let template = templates[0];
  let headings = ['No curated destination'];
  await page.route('**/api/generate', async (route) => {
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
      { type: 'suggestions', suggestions: [{ label: 'An Arctic escape', query: 'Lofoten surfing' }] },
      { type: 'done', template: 'comparison', title: 'Aero regression' },
    );
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    });
  });

  const ready = async () => {
    await page.locator('.generative-suggestions:not(.dimmed)').last().waitFor();
  };

  const verify = async (expected, turn = 0) => {
    await ready();
    const panels = page.locator('.aero-options:visible');
    assert.equal(
      await panels.count(),
      turn + (expected.length ? 1 : 0),
      await page.locator('.aero-options').evaluateAll((blocks) => blocks.map((block) => (
        `${block.dataset.blockStatus}: ${block.textContent}`
      )).join('\n')),
    );
    if (!expected.length) return;
    const panel = panels.last();
    assert.equal(await panel.locator('h2').textContent(), 'WKND Aero flight options');
    assert.equal(await panel.locator('li').count(), expected.length);
    const content = await panel.textContent();
    assert(content.includes('not full-trip quotes'));
    assert(!/July|August|London|Zurich|Amsterdam/.test(content));
    await Promise.all(expected.map(async (entry, index) => {
      const item = panel.locator('li').nth(index);
      assert((await item.textContent()).includes(`Destination airport: ${entry.flightOptions.airport}`));
      assert((await item.textContent()).includes(`Flights from ${entry.flightOptions.startingFare}`));
      assert.equal(await item.locator('a.secondary').getAttribute('href'), entry.url);
      assert.equal(await item.locator('a.primary').getAttribute('href'), entry.flightOptions.bookingUrl);
    }));
    assert(await panel.evaluate((block) => (
      !block.closest('.cards')
      && block.closest('.section').previousElementSibling.querySelector('.adventure-facts')
      && block.closest('.section').nextElementSibling.classList.contains('generative-suggestions')
    )));
  };

  await entries.reduce(async (previous, entry, index) => {
    await previous;
    template = templates[index];
    headings = ['No curated destination'];
    await page.goto(`${base}/of1?q=${encodeURIComponent(entry.flightOptions.destinationTerms[0])}`);
    await verify([entry]);
  }, Promise.resolve());
  process.stdout.write('PASS all five destinations across all templates, exact source facts and full Aero URLs\n');

  [template] = templates;
  await page.goto(`${base}/of1?q=Compare%20Patagonia%20and%20Yosemite`);
  await verify([entries[1], entries[3]]);
  await [375, 768, 1200, 1774].reduce(async (previous, width) => {
    await previous;
    await page.setViewportSize({ width, height: 900 });
    const panel = page.locator('.aero-options:visible');
    assert.equal(await panel.locator('ul').evaluate((list) => (
      getComputedStyle(list).gridTemplateColumns.split(' ').length
    )), width < 600 ? 1 : 2);
    const measurements = await panel.locator('.button').evaluateAll((links) => links.map((link) => {
      const rect = link.getBoundingClientRect();
      return {
        width: rect.width, height: rect.height, left: rect.left, right: rect.right,
      };
    }));
    measurements.forEach((rect) => assert(
      rect.height >= 44 && rect.left >= 0 && rect.right <= width,
    ));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (screenshots) await panel.screenshot({ path: path.join(screenshots, `of1-aero-${width}.png`) });
  }, Promise.resolve());
  process.stdout.write('PASS comparison, separate section placement, source caveats and responsive layout\n');

  headings = ['No curated destination'];
  const followUp = page.locator('.generative-suggestions:not(.dimmed) .suggestion-input');
  await followUp.fill('Ladakh');
  await followUp.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 2);
  await verify([entries[4]], 1);
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 3);
  await verify([entries[2]], 2);
  const latest = page.locator('.generative-suggestions:not(.dimmed) .suggestion-input');
  await latest.fill('Costa Rica');
  await latest.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 4);
  await verify([], 3);
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-restart').click();
  await page.waitForURL(`${base}/of1`);
  assert.equal(await page.locator('.aero-options').count(), 0);
  process.stdout.write('PASS current-turn follow-ups, actual chip query rather than label, unrelated query and restart\n');

  await page.locator('.of1-input').fill('Ohrid');
  await page.locator('.of1-submit').click();
  await verify([entries[0]]);
  await page.goto(`${base}/of1`);
  await page.locator('.of1-input').fill('Yosemite');
  await page.locator('.of1-input').press('Enter');
  await verify([entries[1]]);
  headings = ['Patagonia trekking', 'Ladakh trekking'];
  await page.goto(`${base}/of1?q=Recommend%20trekking`);
  await verify([entries[3], entries[4]]);
  headings = ['No curated destination'];
  await page.goto(`${base}/of1?q=Yosemitesque`);
  await verify([]);
  await page.goto(`${base}/templates/of1/comparison`);
  await page.locator('.cards[data-block-status="loaded"]').waitFor();
  assert.equal(await page.locator('.aero-options').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(sourceErrors, []);
  process.stdout.write('PASS manual search, Enter, heading-based discovery, word boundaries and authored isolation\n');

  await page.route('**/of1/config/knowledge.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(`${base}/of1?q=Ohrid`);
  await ready();
  await page.locator('.aero-options [role="status"]').waitFor();
  assert((await page.locator('.aero-options').textContent()).includes('unavailable'));
  assert.equal(await page.locator('.aero-options a').count(), 0);
  process.stdout.write('PASS unavailable source catalog gives explicit error and no fabricated flight options\n');
  await page.unroute('**/of1/config/knowledge.json');
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-input').fill('Yosemite');
  await page.locator('.generative-suggestions:not(.dimmed) .suggestion-submit').click();
  await page.waitForFunction(() => document.querySelectorAll('.generative-suggestions').length === 2);
  await verify([entries[1]], 1);
  const invalid = JSON.parse(JSON.stringify(entries));
  invalid[0].flightOptions.airport = 'XXX';
  await page.route('**/of1/config/knowledge.json', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(invalid),
  }));
  await page.goto(`${base}/of1?q=Ohrid`);
  await ready();
  await page.locator('.aero-options [role="status"]').waitFor();
  assert.equal(await page.locator('.aero-options a').count(), 0);
  assert(sourceErrors.some((message) => message.includes('Invalid verified Aero information')));
  process.stdout.write('PASS source recovery on the next turn and inconsistent airport/booking data rejected\n');
} finally {
  await browser.close();
}
