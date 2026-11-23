import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { test } from 'node:test';
// eslint-disable-next-line import/no-extraneous-dependencies -- real-browser regression tests
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

test('account identity consent remains explicit and environment-isolated', async (t) => {
  const server = createServer(async (req, res) => {
    const file = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
    if (!file.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      let type = 'text/html';
      if (file.endsWith('.js')) type = 'text/javascript';
      else if (file.endsWith('.css')) type = 'text/css';
      res.setHeader('Content-Type', type);
      res.end(file.endsWith('.plain.html')
        ? `<!doctype html><html><body class="appear"><main>${body}</main></body></html>` : body);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise((done) => { server.listen(0, '127.0.0.1', done); });
  t.after(() => new Promise((done) => { server.close(done); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(() => browser.close());

  async function setup(options = {}) {
    const page = await browser.newPage({ viewport: { width: options.width || 390, height: 844 } });
    t.after(() => page.close());
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // No external request is allowed: the UI's authentication and transport are injected mocks.
    await page.route('**/*', (route) => (route.request().url().startsWith(origin)
      ? route.continue() : route.abort()));
    await page.goto(`${origin}/drafts/tmp/id-linkage-account.plain.html`);
    await page.addStyleTag({ url: `${origin}/styles/styles.css` });
    await page.addStyleTag({ url: `${origin}/styles/lazy-styles.css` });
    await page.addStyleTag({ url: `${origin}/blocks/commerce-account/commerce-account.css` });
    await page.evaluate(async (opts) => {
      const moduleUrl = '/scripts/id-linkage-consent.js';
      const { default: mountIdLinkageConsent } = await import(moduleUrl);
      const block = document.querySelector('.commerce-account');
      block.innerHTML = '<nav class="account__nav"><ul></ul></nav><div class="account__content"></div>';
      window.consentCalls = [];
      window.tokenCalls = [];
      window.replies = opts.replies || [{ status: 'ok', consent: 'absent' }];
      const config = {
        environment: 'production',
        enabled: true,
        origins: [window.location.origin],
        endpoint: 'https://28538-wkndcommerce.adobeioruntime.net/api/v1/web/commerce/target-diagnostic',
        wording: 'I allow WKND to link my signed-in account with Adobe identity for personalization.',
        wordingVersion: 'test-v1',
        ...opts.config,
      };
      window.mountConsent = () => mountIdLinkageConsent(block, {
        config,
        getToken: async (url) => {
          window.tokenCalls.push(url);
          if (opts.tokenError) throw new Error(opts.tokenError);
          return 'mock-access-token';
        },
        fetchImpl: async (url, request) => {
          window.consentCalls.push({
            url,
            body: JSON.parse(request.body),
            headers: request.headers,
            credentials: request.credentials,
            redirect: request.redirect,
          });
          const reply = window.replies.shift() || { status: 'ok', consent: 'absent' };
          return { ok: reply.http !== 503, json: async () => reply };
        },
      });
      await window.mountConsent();
    }, options);
    return { page, errors };
  }

  await t.test('disabled defaults do not render, authenticate or request consent', async () => {
    const { page, errors } = await setup({ config: { enabled: false } });
    assert.equal(await page.locator('#identity-linking').count(), 0);
    assert.deepEqual(await page.evaluate(() => [window.consentCalls, window.tokenCalls]), [[], []]);
    const selected = await page.evaluate(async () => {
      const moduleUrl = '/scripts/id-linkage-config.js';
      const { getIdLinkageConfig } = await import(moduleUrl);
      return getIdLinkageConfig('https://wknd-adventures.run.place');
    });
    assert.equal(selected, null);
    assert.deepEqual(errors, []);
  });

  await t.test('an origin outside the configured environment cannot render or request', async () => {
    const { page } = await setup({ config: { origins: ['https://wknd-adventures.run.place'] } });
    assert.equal(await page.locator('#identity-linking').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.consentCalls), []);
  });

  await t.test('Production rejects a Stage endpoint before authentication', async () => {
    const { page } = await setup({
      config: { endpoint: 'https://28538-wkndcommerce-stage.adobeioruntime.net/api/v1/web/commerce/target-diagnostic' },
    });
    assert.match(await page.getByRole('alert').innerText(), /configuration is invalid/);
    assert.deepEqual(await page.evaluate(() => window.tokenCalls), []);
    assert.deepEqual(await page.evaluate(() => window.consentCalls), []);
  });

  await t.test('Stage uses its own auth endpoint and refuses a Production endpoint', async () => {
    const stage = await setup({
      config: {
        environment: 'stage',
        endpoint: 'https://28538-wkndcommerce-stage.adobeioruntime.net/api/v1/web/commerce/target-diagnostic',
      },
    });
    assert.deepEqual(await stage.page.evaluate(() => window.tokenCalls), [
      'https://28538-wkndcommerce-stage.adobeioruntime.net/api/v1/web/commerce/auth-config',
    ]);
    const crossed = await setup({ config: { environment: 'stage' } });
    assert.match(await crossed.page.getByRole('alert').innerText(), /configuration is invalid/);
    assert.deepEqual(await crossed.page.evaluate(() => window.consentCalls), []);
  });

  await t.test('grant requires an unchecked choice and sends only consent fields', async () => {
    const { page, errors } = await setup({
      replies: [{ status: 'ok', consent: 'absent' }, { status: 'ok', consent: 'granted', changed: true }],
    });
    const grant = page.getByRole('button', { name: 'Allow identity linking' });
    assert.equal(await grant.isDisabled(), true);
    assert.equal(await page.getByRole('checkbox').isChecked(), false);
    assert.equal((await page.evaluate(() => window.consentCalls)).length, 1);
    await page.getByRole('checkbox').check();
    await grant.click();
    await page.getByRole('status').filter({ hasText: 'Identity linking is allowed.' }).waitFor();
    const calls = await page.evaluate(() => window.consentCalls);
    assert.deepEqual(calls[1].body, {
      op: 'consent', optIn: true, wordingVersion: 'test-v1', source: 'account-settings',
    });
    assert.deepEqual(calls[1].headers, {
      'Content-Type': 'application/json', Authorization: 'Bearer mock-access-token',
    });
    assert.equal(calls[1].credentials, 'omit');
    assert.equal(calls[1].redirect, 'error');
    assert.equal(await page.getByRole('checkbox').isChecked(), false);
    assert.deepEqual(errors, []);
  });

  await t.test('withdrawal needs neither enabled wording nor a checked choice', async () => {
    const { page } = await setup({
      config: { wording: '', wordingVersion: '' },
      replies: [{ status: 'ok', consent: 'granted' }, { status: 'ok', consent: 'withdrawn', changed: true }],
    });
    assert.equal(await page.getByRole('button', { name: 'Allow identity linking' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Withdraw permission' }).click();
    await page.getByRole('status').filter({ hasText: 'Identity linking is withdrawn.' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.consentCalls[1].body), {
      op: 'consent', optIn: false, source: 'account-settings',
    });
  });

  await t.test('failed mutations do not claim success and require status reload', async () => {
    const { page } = await setup({
      replies: [
        { status: 'ok', consent: 'absent' },
        { http: 503, reason: 'activation-pending', private: 'do-not-display' },
        { status: 'ok', consent: 'granted' },
      ],
    });
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Allow identity linking' }).click();
    await page.getByRole('alert').filter({ hasText: 'awaiting confirmation' }).waitFor();
    assert.match(await page.getByRole('status').innerText(), /could not be confirmed/);
    assert.equal(await page.getByRole('button', { name: 'Allow identity linking' }).isDisabled(), true);
    assert.equal(await page.locator('body').innerText().then((text) => text.includes('do-not-display')), false);
    await page.getByRole('button', { name: 'Reload status' }).click();
    await page.getByRole('status').filter({ hasText: 'Identity linking is allowed.' }).waitFor();
    assert.equal((await page.evaluate(() => window.consentCalls)).length, 3);
  });

  await t.test('unknown/malformed responses and SDK errors never reveal private details', async () => {
    const malformed = await setup({ replies: [{ status: 'ok', consent: 'yes', token: 'private-token' }] });
    assert.match(await malformed.page.getByRole('alert').innerText(), /unexpected response/);
    assert.equal(await malformed.page.getByRole('checkbox').isDisabled(), true);
    const sdk = await setup({ tokenError: 'We could not confirm private-token' });
    assert.match(await sdk.page.getByRole('alert').innerText(), /service is unavailable/);
    assert.equal((await sdk.page.locator('body').innerText()).includes('private-token'), false);
    assert.deepEqual(await sdk.page.evaluate(() => window.consentCalls), []);
  });

  await t.test('mobile and desktop wrap long wording and actions without overflow', async () => {
    // eslint-disable-next-line no-restricted-syntax -- viewports own independent browser pages
    for (const width of [390, 768, 1350]) {
      // eslint-disable-next-line no-await-in-loop -- each viewport is checked independently
      const { page, errors } = await setup({ width, config: { wording: 'Optional identity linking. '.repeat(30) } });
      // eslint-disable-next-line no-await-in-loop
      const size = await page.evaluate(() => ({
        page: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert.ok(size.content <= size.page, `Overflow at ${width}px`);
      assert.deepEqual(errors, []);
      if (process.env.ID_LINKAGE_SCREENSHOT_DIR) {
        // eslint-disable-next-line no-await-in-loop -- one visual proof per checked viewport
        await page.screenshot({
          path: `${process.env.ID_LINKAGE_SCREENSHOT_DIR}/identity-consent-mock-${width}.png`,
          fullPage: true,
        });
      }
    }
  });
});
