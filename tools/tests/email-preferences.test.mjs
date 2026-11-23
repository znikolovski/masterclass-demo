import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { test } from 'node:test';
// eslint-disable-next-line import/no-extraneous-dependencies -- real-browser regression tests
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

test('cart reminder copy and consent evidence reflect the inactivity-period limit', async (t) => {
  const source = await readFile(resolve(root, 'blocks/commerce-account/commerce-account.js'), 'utf8');
  const section = source.match(/<section id="preferences"[\s\S]*?<\/section>/)[0];
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><html><body>${section}</body></html>`);
      return;
    }
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end();
      return;
    }
    try {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(await readFile(file));
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise((done) => { server.listen(0, '127.0.0.1', done); });
  t.after(() => new Promise((done) => { server.close(done); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route('**/*', (route) => (route.request().url().startsWith(origin)
    ? route.continue() : route.abort()));
  await page.route(`${origin}/scripts/commerce.js`, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.preferenceCalls = [];
      export const CORE_FETCH_GRAPHQL = {
        async fetchGraphQl(query, { variables }) {
          window.preferenceCalls.push({ query, variables });
          if (!variables) return { data: { customer: {
            wknd_recovery_email_opt_in: false, wknd_marketing_email_opt_in: false,
          } } };
          return { data: { setWkndRecoveryEmailOptIn: variables.optIn } };
        },
      };`,
  }));
  await page.goto(origin);
  await page.evaluate(async () => {
    const moduleUrl = '/blocks/commerce-account/email-preferences.js';
    const { default: initEmailPreferences } = await import(moduleUrl);
    await initEmailPreferences(document.querySelector('#preferences'));
  });
  const recovery = page.locator('[data-purpose="recovery"]');
  assert.match(await recovery.innerText(), /24 hours to 7 days.*one per period of inactivity/);
  assert.equal(await recovery.locator('input').isChecked(), false);
  assert.equal(await page.locator('[data-purpose="audience"] input').isChecked(), false);
  assert.equal((await page.evaluate(() => window.preferenceCalls)).length, 1);
  await recovery.locator('input').check();
  await page.getByRole('status').filter({ hasText: 'Cart reminders are on' }).waitFor();
  assert.match(await page.getByRole('status').innerText(), /one per period of inactivity/);
  const calls = await page.evaluate(() => window.preferenceCalls);
  assert.deepEqual(calls[1].variables, {
    optIn: true, wording: 'recovery-2026-11-23',
  });
  assert.match(calls[1].query, /setWkndRecoveryEmailOptIn.*source: WEB/);
  assert.equal(await page.locator('[data-purpose="audience"] input').isChecked(), false);
  await recovery.locator('input').uncheck();
  await page.getByRole('status').filter({ hasText: 'Cart reminders are off.' }).waitFor();
  assert.equal((await page.evaluate(() => window.preferenceCalls)).at(-1).variables.optIn, false);
});
