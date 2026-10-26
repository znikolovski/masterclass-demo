import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const browser = await chromium.launch();
const errors = [];
const screenshotDirectory = process.argv[2];
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
const file = (name, datasets) => ({
  name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ datasets })),
});
const custom = (id, impactPct = -10, date = '2026-09-15') => ({
  id, name: id, events: [{ date, label: '<img src=x onerror=alert(1)>', impactPct }],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  await page.goto('http://localhost:3000/deliverables/stock-mock/');
  await page.locator('.dataset').last().waitFor();
  assert.equal(await page.locator('#price').textContent(), '$85.00');
  assert.match(await page.locator('#price-change').textContent(), /15\.00%/);
  const toggle = (id) => page.locator(`input[data-id="${id}"]`);
  assert(await toggle('new-destinations').isChecked());
  assert.equal(await page.locator('.event-row').count(), 2);
  assert.match(await page.locator('#events').textContent(), /Ladakh, India/);
  assert.match(await page.locator('#events').textContent(), /Ohrid, North Macedonia/);
  assert.equal(await page.locator('.event-point').count(), 2);
  await toggle('new-destinations').uncheck();
  assert.equal(await page.locator('#price').textContent(), '$85.00');
  await toggle('new-destinations').check();
  await toggle('booking-outage').check();
  assert.equal(await page.locator('#price').textContent(), '$80.55');
  await toggle('extreme-weather').check();
  assert.equal(await page.locator('#price').textContent(), '$72.68');
  await toggle('booking-outage').uncheck();
  await toggle('booking-outage').check();
  assert.equal(await page.locator('#price').textContent(), '$72.68');
  assert.equal(await page.locator('.event-row').count(), 6);
  await page.locator('#simulation-date').fill('2026-08-17');
  await page.locator('#simulation-date').dispatchEvent('change');
  assert.equal(await page.locator('#event-impact').textContent(), '+0.00%');
  assert.equal(await page.locator('.event-row.upcoming').count(), 6);
  await page.locator('#simulation-date').fill('2026-08-18');
  await page.locator('#simulation-date').dispatchEvent('change');
  assert.equal(await page.locator('#event-impact').textContent(), '−6.00%');
  await page.getByRole('button', { name: 'Reset all' }).click();
  assert.equal(await page.locator('#price').textContent(), '$85.00');
  await page.getByRole('button', { name: '1W', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '1W', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#price-change').textContent(), /over 1 week/);
  await page.locator('#show-baseline').uncheck();
  assert.equal(await page.locator('.baseline-path').count(), 0);
  await page.getByRole('button', { name: 'Reset all' }).click();

  await page.locator('#file-input').setInputFiles([
    file('incident.json', [custom('custom-incident')]),
    file('recovery.json', [custom('custom-recovery', 5, '2026-10-01')]),
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.dataset').length === 6);
  assert.equal(await page.locator('#price').textContent(), '$85.00');
  await toggle('custom-incident').check();
  await toggle('custom-recovery').check();
  assert.equal(await page.locator('#price').textContent(), '$80.33');
  assert.equal(await page.locator('#events img').count(), 0, 'Imported labels must remain text');
  await page.locator('#file-input').setInputFiles(file('replace.json', [custom('custom-incident', -20)]));
  await page.waitForFunction(() => !document.querySelector('input[data-id="custom-incident"]').checked);
  assert.equal(await page.locator('#price').textContent(), '$89.25');

  const before = await page.locator('.dataset').count();
  const invalidFiles = [
    file('invalid-date.json', [custom('invalid-date', -10, '2026-09-31')]),
    file('invalid-impact.json', [custom('invalid-impact', -100)]),
    file('invalid-shape.json', [null]),
    { name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{') },
  ];
  await invalidFiles.reduce(async (previous, invalid) => {
    await previous;
    await page.locator('#file-input').setInputFiles([
      file('valid.json', [custom('should-not-load')]), invalid,
    ]);
    await page.waitForFunction((name) => (
      document.querySelector('#status').classList.contains('error')
        && document.querySelector('#status').textContent.includes(name)
    ), invalid.name);
    assert.equal(await page.locator('.dataset').count(), before, 'Imports must be atomic');
    assert.equal(await page.locator('#price').textContent(), '$89.25');
  }, Promise.resolve());
  await page.locator('#file-input').setInputFiles([
    file('a.json', [custom('duplicate')]), file('b.json', [custom('duplicate')]),
  ]);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('duplicate'));
  assert.equal(await page.locator('.dataset').count(), before);
  await page.getByRole('button', { name: 'Reset all' }).click();
  await page.locator('#date-scrubber').fill('0');
  await page.locator('#date-scrubber').dispatchEvent('input');
  assert.equal(await page.locator('#price').textContent(), '$100.00');
  assert(!/NaN|Infinity/.test(await page.locator('#stock-chart').innerHTML()));
  await page.getByRole('button', { name: 'Reset all' }).click();
  await toggle('campaign-recovery').check();
  await toggle('custom-recovery').check();
  assert.equal(await page.locator('#price').textContent(), '$100.27');
  assert.equal(await page.locator('.chart-positive').count(), 1);
  await page.getByRole('button', { name: 'Reset all' }).click();
  await page.reload();
  await page.locator('.dataset').last().waitFor();

  await [
    ['desktop', 1440, 1100], ['tablet', 768, 1024], ['mobile', 390, 844],
  ].reduce(async (previous, [name, width, height]) => {
    await previous;
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => (
      document.documentElement.scrollWidth <= window.innerWidth
    )), `${name}: no horizontal overflow`);
    if (screenshotDirectory) {
      await page.screenshot({ path: path.join(screenshotDirectory, `${name}.png`), fullPage: true });
    }
  }, Promise.resolve());
  await toggle('booking-outage').check();
  const scenarioPrice = await page.locator('#price').textContent();
  await page.getByRole('link', { name: 'Ticker only' }).click();
  assert(page.url().endsWith('?view=ticker'));
  assert.equal(await page.locator('#price').textContent(), scenarioPrice);
  assert.equal(await page.locator('.scenario-card').isVisible(), false);
  await page.goBack();
  assert.equal(await page.locator('.scenario-card').isVisible(), true);
  assert(await toggle('booking-outage').isChecked());

  await page.goto('http://localhost:3000/deliverables/stock-mock/?view=ticker');
  await page.waitForFunction(() => document.querySelectorAll('.event-point').length === 2);
  assert.equal(await page.locator('#price').textContent(), '$85.00');
  assert.match(await page.locator('#price-change').textContent(), /15\.00%/);
  await [
    ['desktop', 1440, 1100], ['mobile', 390, 844],
  ].reduce(async (previous, [name, width, height]) => {
    await previous;
    await page.setViewportSize({ width, height });
    assert(await page.locator('#stock-chart').isVisible());
    assert(await page.locator('.company-header').isVisible());
    const visibleContext = await page.locator(
      '.site-header, .page-heading, .story-note, .market-badge, .chart-toolbar, figcaption, .date-explorer, .stats, .scenario-card, .events-card, .event-point, footer',
    ).evaluateAll((elements) => elements.some((element) => (
      element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
    )));
    assert.equal(visibleContext, false, 'Ticker view must contain no controls or context');
    assert(await page.evaluate(() => (
      document.documentElement.scrollWidth <= window.innerWidth
    )), `${name}: ticker has no horizontal overflow`);
    if (screenshotDirectory) {
      await page.screenshot({
        path: path.join(screenshotDirectory, `ticker-${name}.png`), fullPage: true,
      });
    }
  }, Promise.resolve());
  assert.deepEqual(errors, [], 'No browser errors');
  process.stdout.write('PASS: baseline, compounding, toggles, dated events, imports, validation, reset, ranges, and responsive layouts.\n');
} finally {
  await browser.close();
}
