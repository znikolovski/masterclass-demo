#!/usr/bin/env node
/**
 * Deterministic launcher/SDK-isolation checks; Adobe backend delivery is tested separately.
 * Run: node tools/scripts/test-concierge.mjs [http://localhost:3000]
 */
import assert from 'node:assert/strict';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3000';
const sdkUrl = 'https://cdn1.adoberesources.net/alloy/2.35.0/alloy.min.js';
const clientUrl = 'https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js';
const sdk = `
  const queue = window.alloy.q;
  const execute = ([resolve, reject, [command, options]]) => {
    if (command === 'configure') window.testSdkConfig = options;
    resolve({});
  };
  queue.push = execute;
  queue.forEach(execute);
`;
const client = `
  window.adobe = { concierge: { bootstrap: async (options) => {
    window.testBootstrapCount = (window.testBootstrapCount || 0) + 1;
    window.testBootstrapOptions = options;
    const mount = document.querySelector(options.selector);
    const container = document.createElement('div');
    container.className = 'brand-concierge-container';
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Type your message');
    container.append(input);
    mount.append(container);
  } } };
`;
const browser = await chromium.launch();

async function createPage({ failClient = false, emptyClient = false, hangSdk = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let clientRequests = 0;
  let sdkRequests = 0;
  await page.route(sdkUrl, async (route) => {
    sdkRequests += 1;
    if (!hangSdk) await route.fulfill({ contentType: 'text/javascript', body: sdk });
  });
  await page.route(clientUrl, async (route) => {
    clientRequests += 1;
    if (failClient && clientRequests === 1) {
      await route.abort('failed');
    } else {
      await route.fulfill({
        contentType: 'text/javascript',
        body: emptyClient ? 'window.adobe = { concierge: { bootstrap: async () => {} } };' : client,
      });
    }
  });
  return { page, clientRequests: () => clientRequests, sdkRequests: () => sdkRequests };
}

async function waitFor(page, predicate) {
  await page.waitForFunction(predicate);
}

try {
  const { page, clientRequests, sdkRequests } = await createPage();
  await page.goto(base);
  const launcher = page.getByRole('button', { name: 'Chat with WKND Sherpa' });
  await launcher.waitFor({ timeout: 60000 });
  assert.equal(clientRequests(), 0);
  assert.equal(sdkRequests(), 0);
  const launcherStyle = await launcher.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    shadow: getComputedStyle(button).boxShadow,
    font: getComputedStyle(button).fontFamily,
  }));
  assert.equal(launcherStyle.background, 'rgb(15, 26, 20)');
  assert.equal(launcherStyle.shadow, 'rgb(232, 101, 26) 3px 3px 0px 0px');
  assert.equal(launcherStyle.font, 'Syncopate, sans-serif');
  await page.waitForTimeout(4000);
  await page.evaluate(() => { window.testOriginalAlloy = window.alloy; });
  await launcher.click();
  const input = page.frameLocator('.wknd-sherpa-frame').getByRole('textbox', { name: 'Type your message' });
  await input.waitFor();
  assert(await page.evaluate(() => window.testOriginalAlloy === window.alloy));
  const frameState = await page.locator('.wknd-sherpa-frame').evaluate((frame) => ({
    config: frame.contentWindow.testSdkConfig,
    bootstrap: frame.contentWindow.testBootstrapOptions,
  }));
  assert.equal(frameState.config.datastreamId, '56dee4fc-21a9-4e37-83ab-bdd874957aba');
  assert.equal(frameState.config.defaultConsent, 'pending');
  assert.equal(frameState.config.thirdPartyCookiesEnabled, false);
  assert.equal(frameState.config.idMigrationEnabled, false);
  assert.equal(frameState.config.conversation.stickyConversationSession, false);
  assert.equal(frameState.config.conversation.region, 'aus5');
  assert.equal(frameState.bootstrap.instanceName, 'alloy');
  assert.equal(frameState.bootstrap.stylingConfigurations.text['welcome.heading'], 'Meet WKND Sherpa');
  const { theme } = frameState.bootstrap.stylingConfigurations;
  assert.equal(theme['--color-text'], '#0f1a14');
  assert.equal(theme['--button-primary-background'], '#0f1a14');
  assert.equal(theme['--prompt-pill-background'], '#0f1a14');
  assert.equal(theme['--prompt-pill-text-color'], '#ffffff');
  assert.equal(theme['--color-primary'], '#e8651a');
  assert(!JSON.stringify(frameState.bootstrap.stylingConfigurations).includes('#522752'));

  await [[1440, 900], [768, 1024], [375, 667]].reduce(async (previous, [width, height]) => {
    await previous;
    await page.setViewportSize({ width, height });
    const bounds = await page.locator('.wknd-sherpa-panel').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0);
    assert(bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
  }, Promise.resolve());
  await input.fill('Keep this draft');
  await input.press('Escape');
  await waitFor(page, () => !document.querySelector('.wknd-sherpa-panel').open);
  await waitFor(page, () => document.activeElement?.classList.contains('wknd-sherpa-launcher'));
  await waitFor(page, () => document.querySelector('.wknd-sherpa-launcher').getAttribute('aria-expanded') === 'false');
  assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
  await launcher.click();
  assert.equal(await input.inputValue(), 'Keep this draft');
  assert.equal(clientRequests(), 1);
  assert.equal(sdkRequests(), 1);
  assert.equal(await page.locator('.wknd-sherpa-frame').evaluate((frame) => frame.contentWindow.testBootstrapCount), 1);
  await page.evaluate(() => {
    window.postMessage({ source: 'wknd-sherpa', type: 'close' }, window.location.origin);
  });
  await page.waitForTimeout(100);
  assert(await page.locator('.wknd-sherpa-panel').evaluate((dialog) => dialog.open));
  await page.getByRole('button', { name: 'Close WKND Sherpa' }).click();
  await waitFor(page, () => !document.querySelector('.wknd-sherpa-panel').open);
  await page.close();
  process.stdout.write('PASS deferred loading, SDK isolation, configuration, responsive bounds, focus, Escape, reopen and message-source validation\n');

  await Promise.all(['/adventures', '/?site=wknd-business', '/?site=wknd-aero'].map(async (path) => {
    const test = await createPage();
    await test.page.goto(new URL(path, base).href);
    await test.page.getByRole('button', { name: 'Chat with WKND Sherpa' }).waitFor({ timeout: 60000 });
    assert.equal(test.sdkRequests(), 0);
    await test.page.evaluate(async () => {
      const { default: init } = await import(new URL('/scripts/concierge.js', window.location.origin).href);
      await init();
      await init();
    });
    assert.equal(await test.page.locator('.wknd-sherpa-launcher').count(), 1);
    await test.page.close();
  }));
  process.stdout.write('PASS secondary page, shared sites and idempotent initialization\n');

  const failure = await createPage({ failClient: true });
  await failure.page.goto(base);
  await failure.page.getByRole('button', { name: 'Chat with WKND Sherpa' }).click({ timeout: 60000 });
  await failure.page.getByText('WKND Sherpa is unavailable right now. Please try again.').waitFor();
  await failure.page.getByRole('button', { name: 'Try again', exact: true }).click();
  await failure.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox', { name: 'Type your message' }).waitFor();
  assert.equal(failure.clientRequests(), 2);
  await failure.page.close();
  process.stdout.write('PASS blocked client script and successful retry\n');

  const empty = await createPage({ emptyClient: true });
  await empty.page.goto(base);
  await empty.page.getByRole('button', { name: 'Chat with WKND Sherpa' }).click({ timeout: 60000 });
  await empty.page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  assert(await empty.page.locator('.wknd-sherpa-frame').evaluate((frame) => frame.hidden));
  await empty.page.close();
  process.stdout.write('PASS vendor bootstrap that resolves without rendering\n');

  const timeout = await createPage({ hangSdk: true });
  await timeout.page.goto(base);
  await timeout.page.getByRole('button', { name: 'Chat with WKND Sherpa' }).waitFor({ timeout: 60000 });
  await timeout.page.clock.install();
  await timeout.page.getByRole('button', { name: 'Chat with WKND Sherpa' }).click();
  await timeout.page.clock.fastForward(30000);
  await timeout.page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  assert.equal(await timeout.page.locator('.wknd-sherpa-frame').getAttribute('src'), 'about:blank');
  await timeout.page.close();
  process.stdout.write('PASS bounded initialization and cancellation of late bootstrap\n');
} finally {
  await browser.close();
}
