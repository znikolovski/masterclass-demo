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
    input.className = 'chat-input';
    input.setAttribute('aria-label', 'Type your message');
    window.testInputEvents = 0;
    window.testSubmissions = 0;
    window.testSentQuestions = [];
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'action-button--send';
    send.setAttribute('aria-label', 'Send message');
    send.setAttribute('aria-disabled', 'true');
    container.addEventListener('input', (event) => {
      window.testInputEvents += 1;
      send.setAttribute('aria-disabled', String(!event.target.value.trim()));
    });
    send.addEventListener('click', () => {
      if (send.getAttribute('aria-disabled') === 'true') return;
      window.testSubmissions += 1;
      const active = container.querySelector('.chat-input:not([disabled])');
      window.testSentQuestions.push(active.value);
      active.value = '';
    });
    container.addEventListener('submit', () => { window.testSubmissions += 1; });
    container.append(input, send);
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

  const question = 'Help me plan a hike & pack + snacks #WKND <b>please</b>';
  const hash = `#sherpa?prompt=${encodeURIComponent(question)}`;
  await Promise.all([[1440, 900], [768, 1024], [375, 667]].map(async ([width, height]) => {
    const test = await createPage();
    await test.page.setViewportSize({ width, height });
    await test.page.goto(`${base}/adventures${hash}`);
    await waitFor(test.page, () => document.querySelector('.wknd-sherpa-frame')
      ?.contentDocument?.querySelector('.chat-input')?.value.startsWith('Help me plan'));
    const textbox = test.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox');
    assert.equal(await textbox.inputValue(), question);
    assert.equal(await textbox.evaluate((element) => element === document.activeElement), true);
    assert.equal(await textbox.evaluate(() => window.testInputEvents), 1);
    assert.equal(await textbox.evaluate(() => window.testSubmissions), 0);
    const bounds = await test.page.locator('.wknd-sherpa-panel').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0);
    assert(bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    await test.page.close();
  }));
  process.stdout.write('PASS shareable deep links, exact encoded text, focus and no submission across viewports\n');

  await Promise.all([
    {
      width: 1440, height: 900, send: 'true', count: 1,
    },
    {
      width: 768, height: 1024, send: 'true', count: 1,
    },
    {
      width: 375, height: 667, send: 'true', count: 1,
    },
    {
      width: 1440, height: 900, send: 'false', count: 0,
    },
    {
      width: 1440, height: 900, send: 'TRUE', count: 0,
    },
  ].map(async ({
    width, height, send, count,
  }) => {
    const test = await createPage();
    await test.page.setViewportSize({ width, height });
    await test.page.goto(`${base}/adventures${hash}&send=${send}`);
    await waitFor(test.page, () => document.querySelector('.wknd-sherpa-frame')
      ?.contentWindow?.testInputEvents === 1);
    const textbox = test.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox');
    assert.equal(await textbox.evaluate(() => window.testSubmissions), count);
    assert.equal(await textbox.inputValue(), count ? '' : question);
    assert.deepEqual(
      await textbox.evaluate(() => window.testSentQuestions),
      count ? [question] : [],
    );
    await textbox.press('Escape');
    await waitFor(test.page, () => !document.querySelector('.wknd-sherpa-panel').open);
    await test.page.getByRole('button', { name: 'Chat with WKND Sherpa' }).click();
    await test.page.waitForTimeout(100);
    assert.equal(await textbox.evaluate(() => window.testSubmissions), count);
    assert.equal(test.clientRequests(), 1);
    await test.page.close();
  }));
  process.stdout.write('PASS explicit send=true, prefill-only alternatives, single submission and reopen across viewports\n');

  const sending = await createPage();
  await sending.page.goto(`${base}/adventures${hash}&send=true`);
  await waitFor(sending.page, () => document.querySelector('.wknd-sherpa-frame')
    ?.contentWindow?.testSubmissions === 1);
  const sendingInput = sending.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox');
  await sendingInput.press('Escape');
  await waitFor(sending.page, () => !document.querySelector('.wknd-sherpa-panel').open);
  await sending.page.evaluate((href) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = 'Send another Sherpa question';
    document.querySelector('main').prepend(anchor);
  }, `${hash}&send=true`);
  await sending.page.getByRole('link', { name: 'Send another Sherpa question' }).click();
  await waitFor(sending.page, () => document.querySelector('.wknd-sherpa-frame')
    .contentWindow.testSubmissions === 2);
  assert.equal(await sendingInput.evaluate(() => window.testBootstrapCount), 1);
  await sendingInput.evaluate(() => {
    const send = document.querySelector('button.action-button--send');
    send.disabled = true;
  });
  await sending.page.evaluate(() => { window.location.hash = '#sherpa?prompt=Not%20sent&send=true'; });
  await sending.page.getByText('WKND Sherpa could not send this question automatically. The question is ready to edit or send when Sherpa is available.').waitFor();
  assert.equal(await sendingInput.inputValue(), 'Not sent');
  assert.equal(await sendingInput.evaluate(() => window.testSubmissions), 2);
  await sending.page.close();
  process.stdout.write('PASS repeated auto-send links, preserved conversation and explicit disabled-send error\n');

  const links = await createPage();
  await links.page.goto(`${base}/adventures`);
  await links.page.getByRole('button', { name: 'Chat with WKND Sherpa' }).waitFor({ timeout: 60000 });
  await links.page.evaluate((href) => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = 'Ask Sherpa about hiking';
    document.querySelector('main').prepend(anchor);
  }, hash);
  await links.page.getByRole('link', { name: 'Ask Sherpa about hiking' }).click();
  await waitFor(links.page, () => document.querySelector('.wknd-sherpa-frame')
    ?.contentDocument?.querySelector('.chat-input')?.value.startsWith('Help me plan'));
  const linkedInput = links.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox', { name: 'Type your message' });
  assert.equal(await linkedInput.inputValue(), question);
  assert.equal(new URL(links.page.url()).hash, hash);
  await linkedInput.fill('Existing draft');
  await linkedInput.press('Escape');
  await waitFor(links.page, () => !document.querySelector('.wknd-sherpa-panel').open);
  await links.page.getByRole('link', { name: 'Ask Sherpa about hiking' }).click();
  await waitFor(links.page, () => document.querySelector('.wknd-sherpa-frame')
    .contentDocument.querySelector('.chat-input').value.startsWith('Help me plan'));
  assert.equal(await linkedInput.inputValue(), question);
  assert.equal(links.clientRequests(), 1);
  assert.equal(await linkedInput.evaluate(() => window.testBootstrapCount), 1);
  await linkedInput.fill('Preserve this draft');
  await linkedInput.press('Escape');
  await waitFor(links.page, () => !document.querySelector('.wknd-sherpa-panel').open);
  await links.page.evaluate(() => { window.location.hash = '#sherpa'; });
  await waitFor(links.page, () => document.querySelector('.wknd-sherpa-panel').open);
  assert.equal(await linkedInput.inputValue(), 'Preserve this draft');
  await links.page.evaluate(() => { window.location.hash = '#sherpa?prompt=New%20question'; });
  await waitFor(links.page, () => document.querySelector('.wknd-sherpa-frame')
    .contentDocument.querySelector('.chat-input').value === 'New question');
  await linkedInput.evaluate((element) => {
    window.postMessage({ source: 'wknd-sherpa', type: 'prefill', prompt: 'Untrusted' }, window.location.origin);
    element.maxLength = 5;
  });
  await links.page.waitForTimeout(100);
  assert.equal(await linkedInput.inputValue(), 'New question');
  await links.page.evaluate(() => { window.location.hash = '#sherpa?prompt=Too%20long'; });
  await links.page.getByText("This question exceeds WKND Sherpa's 5-character limit. Please use a shorter question.").waitFor();
  assert.equal(await linkedInput.inputValue(), 'New question');
  await linkedInput.evaluate((element) => { element.removeAttribute('maxlength'); });
  await links.page.evaluate(() => { window.location.hash = '#sherpa?prompt=Short'; });
  await waitFor(links.page, () => document.querySelector('.wknd-sherpa-frame')
    .contentDocument.querySelector('.chat-input').value === 'Short');
  assert(await links.page.locator('.wknd-sherpa-notice').evaluate((element) => element.hidden));
  assert.equal(await linkedInput.evaluate(() => window.testSubmissions), 0);
  await linkedInput.evaluate((element) => {
    element.disabled = true;
    const textarea = document.createElement('textarea');
    textarea.className = 'chat-input';
    textarea.setAttribute('aria-label', 'Conversation message');
    element.after(textarea);
  });
  await links.page.evaluate(() => { window.location.hash = '#sherpa?prompt=Follow%20up'; });
  await waitFor(links.page, () => document.querySelector('.wknd-sherpa-frame')
    .contentDocument.querySelector('textarea').value === 'Follow up');
  assert.equal(await linkedInput.inputValue(), 'Short');
  const activeInput = links.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox', { name: 'Conversation message' });
  await activeInput.evaluate((element) => { element.readOnly = true; });
  await links.page.evaluate(() => { window.location.hash = '#sherpa?prompt=Wait'; });
  await links.page.getByText('WKND Sherpa is not ready for a new question. Please try the link again when it is ready.').waitFor();
  assert.equal(await activeInput.inputValue(), 'Follow up');
  await activeInput.press('Escape');
  await waitFor(links.page, () => !document.querySelector('.wknd-sherpa-panel').open);
  const handled = await links.page.evaluate(() => [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { target: '_blank' },
    { download: true },
    { href: '/other-page#sherpa?prompt=Other' },
    { href: 'https://example.com/#sherpa?prompt=Other' },
    { href: '#ordinary-anchor' },
  ].map(({
    target, download, href, ...options
  }) => {
    const anchor = document.createElement('a');
    anchor.href = href || '#sherpa?prompt=Ignored';
    if (target) anchor.target = target;
    if (download) anchor.download = '';
    document.body.append(anchor);
    let intercepted;
    document.addEventListener('click', (event) => {
      intercepted = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }));
    anchor.remove();
    return intercepted;
  }));
  assert(handled.every((intercepted) => intercepted === false));
  assert.equal(await links.page.locator('.wknd-sherpa-panel').evaluate((dialog) => dialog.open), false);
  await links.page.close();
  process.stdout.write('PASS authored/repeated links, conversation inputs, drafts, hash changes, source/length/busy errors and normal browser navigation\n');

  const failure = await createPage({ failClient: true });
  await failure.page.goto(`${base}/${hash}&send=true`);
  await failure.page.getByText('WKND Sherpa is unavailable right now. Please try again.').waitFor();
  await failure.page.getByRole('button', { name: 'Try again', exact: true }).click();
  await failure.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox', { name: 'Type your message' }).waitFor();
  await waitFor(failure.page, () => document.querySelector('.wknd-sherpa-frame')
    .contentWindow.testSubmissions === 1);
  assert.deepEqual(await failure.page.frameLocator('.wknd-sherpa-frame').getByRole('textbox').evaluate(() => window.testSentQuestions), [question]);
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
