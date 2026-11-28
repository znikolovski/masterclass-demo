#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const catalog = readFileSync(new URL('../commerce-catalog/commerce-catalog.js', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../sidekick/setup-da-library.mjs', import.meta.url), 'utf8');
const kitName = 'Product kit (add all)';
const sheetSource = bootstrap.slice(bootstrap.indexOf('const COMMERCE_TEMPLATES ='), bootstrap.indexOf('function orderMultiSheetConfig'));
const sheetFor = vm.runInNewContext(`${sheetSource}\ncommerceTemplatesSheet`);
const existing = {
  'commerce-templates': {
    ':type': 'sheet',
    columns: ['name', 'template'],
    total: 1,
    limit: 1,
    offset: 0,
    data: [{ name: 'Custom cards', template: '<p>{{sku}}</p>', custom: true }],
  },
};
const before = JSON.stringify(existing);
const updated = sheetFor(existing);
assert.equal(JSON.stringify(existing), before, 'registration must not mutate existing config');
assert.equal(updated.data[0], existing['commerce-templates'].data[0], 'custom formats remain unchanged');
assert.equal(updated.data[1].name, kitName);
assert.equal(updated.total, 2);
assert.equal(updated.limit, 2);
assert.equal(updated.columns, existing['commerce-templates'].columns);
assert.equal(sheetFor({ 'commerce-templates': updated }), updated, 'registration is idempotent');
const customized = { ...updated, data: updated.data.map((row) => (row.name === kitName ? { ...row, template: 'custom kit' } : row)) };
assert.equal(sheetFor({ 'commerce-templates': customized }), customized, 'existing customized kit remains unchanged');
assert(sheetFor(null).data.some(({ name }) => name === kitName), 'new configs include the kit');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(({ source, name }) => {
    const defaults = source.slice(source.indexOf('const DEFAULT_TEMPLATES ='), source.indexOf('const EMPTY_CONFIG'));
    const utilities = source.slice(source.indexOf('function el('), source.indexOf('function humanize('));
    const helpers = source.slice(source.indexOf('function escapeHtml('), source.indexOf('async function insertProducts('));
    // Evaluate the production insertion helpers without booting the SDK or catalog connection.
    // eslint-disable-next-line no-new-func -- execute production helpers in an isolated browser
    const run = new Function(`${defaults}\n${utilities}\n${helpers}\n
      const format = DEFAULT_TEMPLATES.find(t => t.name === ${JSON.stringify(name)});
      return {
        single: buildMultiOutput([{sku: 'ONE'}], format).html,
        multi: buildMultiOutput([{sku: 'ONE'}, {sku: 'TWO&<'}], format).html
      };`);
    return run();
  }, { source: catalog, name: kitName });
  const single = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('tr')].map((row) => row.textContent);
  }, result.single);
  const multi = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      tables: doc.querySelectorAll('table').length,
      rows: [...doc.querySelectorAll('tr')].map((row) => row.textContent),
      cells: [...doc.querySelectorAll('tr')].map((row) => row.children.length),
    };
  }, result.multi);
  assert.deepEqual(single, ['product-kit', 'ONE']);
  assert.deepEqual(multi, { tables: 1, rows: ['product-kit', 'ONE', 'TWO&<'], cells: [1, 1, 1] });
  process.stdout.write('PASS product-kit registration preserves formats and inserts single/multiple SKU rows\n');
} finally {
  await browser.close();
}
