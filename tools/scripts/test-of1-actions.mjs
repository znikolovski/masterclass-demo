#!/usr/bin/env node
/**
 * Replays published card templates through the real OF1 SDK without model calls.
 * Run: node tools/scripts/test-of1-actions.mjs [http://localhost:3000] [screenshot-directory]
 */
import assert from 'node:assert/strict';
import path from 'node:path';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3000';
const screenshots = process.argv[3];
const title = 'Ohrid & Ladakh + trails #WKND <camp> "weekend" \u2013 115 km';
const prompt = `Help me plan this adventure: ${title}. What should I prepare?`;
const corruptedImage = 'media_13959b15a585224ec329fd1f593db0e5da597b8.avif';
const canonicalImage = 'media_13959b15a585224ec329fd4f1f593db0e5da597b8.avif';
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const intents = ['comparison', 'recommendation', 'discovery', 'budget', 'deep-dive'];
  const templates = await Promise.all(intents.map(async (intent) => {
    const response = await page.request.get(`${base}/templates/of1/${intent}.plain.html`);
    assert(response.ok(), `${intent} template returned ${response.status()}`);
    return { intent, html: await response.text() };
  }));
  const fixture = await page.evaluate(({ content, edgeTitle, badImage }) => {
    const sections = [];
    const sources = [];
    content.forEach(({ intent, html }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('.cards').forEach((cards) => {
        if (intent === 'comparison') {
          const first = cards.firstElementChild;
          first.querySelector('h3').textContent = edgeTitle;
          const image = first.querySelector('img');
          image.src = `https://llm-traffic-tracking--masterclass-demo--znikolovski.aem.live/of1/knowledge/${badImage}`;
          image.alt = 'Panoramic view of Ohrid city and Lake Ohrid at dusk, North Macedonia';
          first.querySelectorAll('source').forEach((source) => {
            source.srcset = `${image.src}?width=750&format=webply`;
          });
          const link = first.querySelector('a');
          const paragraph = doc.createElement('p');
          link.replaceWith(paragraph);
          paragraph.append(link);
        }
        [...cards.children].forEach((row) => {
          sources.push(row.querySelector('a').getAttribute('href'));
        });
        if (intent === 'comparison') {
          [
            'https://main--wknd-aero--znikolovski.aem.live/adventures/yosemite-rock-climbing',
            'https://main--wknd-aero--znikolovski.aem.live/book/flights?dest=FAT&adv=yosemite-rock-climbing',
          ].forEach((href) => {
            const aero = cards.lastElementChild.cloneNode(true);
            aero.querySelector('h3').textContent = 'WKND Aero Yosemite climbing';
            aero.querySelector('a').href = href;
            sources.push(href);
            cards.append(aero);
          });
          const noTitle = cards.firstElementChild.cloneNode(true);
          noTitle.querySelector('h3').remove();
          const noSource = cards.lastElementChild.cloneNode(true);
          noSource.querySelector('a').remove();
          cards.append(noTitle, noSource);
        }
        sections.push(cards.outerHTML);
      });
    });
    return { sections, sources };
  }, { content: templates, edgeTitle: title, badImage: corruptedImage });
  assert(fixture.sections.length >= 4, 'Published templates must cover all card intents');
  const events = fixture.sections.map((html, index) => ({
    type: 'section', format: 'html', index, html, stylesheet: null,
  }));
  events.push({ type: 'done', template: 'recommendation', title: 'Adventure actions' });
  await page.route('**/api/generate', (route) => route.fulfill({
    contentType: 'application/x-ndjson',
    body: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  }));
  await page.route('https://cdn1.adoberesources.net/alloy/2.35.0/alloy.min.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `
      const queue = window.alloy.q;
      const execute = ([resolve]) => resolve({});
      queue.push = execute;
      queue.forEach(execute);
    `,
  }));
  await page.route('https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `
      window.adobe = { concierge: { bootstrap: async (options) => {
        const container = document.createElement('div');
        container.className = 'brand-concierge-container';
        const input = document.createElement('input');
        input.className = 'chat-input';
        input.setAttribute('aria-label', 'Type your message');
        window.testSubmissions = 0;
        const send = document.createElement('button');
        send.type = 'button';
        send.setAttribute('aria-label', 'Send message');
        send.addEventListener('click', () => {
          window.testSubmissions += 1;
          window.testLastSent = input.value;
          input.value = '';
        });
        container.append(input, send);
        document.querySelector(options.selector).append(container);
      } } };
    `,
  }));
  await page.goto(`${base}/of1?q=adventure-actions-regression`);
  await page.waitForFunction((count) => (
    document.querySelectorAll('.generated-section .cards-card-actions').length === count
  ), fixture.sources.length);
  const actions = page.locator('.generated-section .cards-card-actions');
  const sources = await actions.locator('a.secondary').evaluateAll((links) => (
    links.map((link) => link.pathname)
  ));
  assert.deepEqual(sources, fixture.sources.map((href) => new URL(href, base).pathname));
  assert.equal(await actions.locator('a.primary').count(), fixture.sources.length);
  const chat = actions.first().getByRole('link', { name: `Chat with WKND Sherpa about ${title}` });
  const fragment = `#sherpa?prompt=${encodeURIComponent(prompt)}&send=true`;
  assert.equal(await chat.getAttribute('href'), fragment);
  assert.equal(await chat.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(await page.getByRole('link', { name: 'View WKND Aero experience about WKND Aero Yosemite climbing' })
    .getAttribute('href'), 'https://main--wknd-aero--znikolovski.aem.live/adventures/yosemite-rock-climbing');
  assert.equal(await page.getByRole('link', { name: 'Find flights with WKND Aero about WKND Aero Yosemite climbing' })
    .getAttribute('href'), 'https://main--wknd-aero--znikolovski.aem.live/book/flights?dest=FAT&adv=yosemite-rock-climbing');
  const idempotence = await page.evaluate(async (html) => {
    const { decorateMain } = await import(new URL('/scripts/scripts.js', window.location.origin).href);
    const detached = document.createElement('main');
    detached.innerHTML = `<div>${html}</div>`;
    decorateMain(detached);
    const before = detached.querySelectorAll('.cards-card-actions').length;
    decorateMain(detached);
    const after = detached.querySelectorAll('.cards-card-actions').length;
    const attached = document.createElement('main');
    attached.innerHTML = `<div>${html}</div>`;
    document.body.append(attached);
    decorateMain(attached);
    const authored = attached.querySelectorAll('.cards-card-actions').length;
    attached.remove();
    return { before, after, authored };
  }, fixture.sections[0]);
  assert.deepEqual(idempotence, { before: 4, after: 4, authored: 0 });
  process.stdout.write('PASS all card intents, original destinations, encoding, missing fields and idempotence\n');

  await page.getByRole('button', { name: 'Chat with WKND Sherpa' }).waitFor({ timeout: 60000 });
  await chat.focus();
  await chat.press('Enter');
  const input = page.frameLocator('.wknd-sherpa-frame').getByRole('textbox', { name: 'Type your message' });
  await page.waitForFunction((expected) => (
    document.querySelector('.wknd-sherpa-frame')?.contentDocument
      ?.defaultView.testLastSent === expected
  ), prompt);
  assert.equal(await input.evaluate(() => window.testLastSent), prompt);
  assert.equal(await input.evaluate(() => window.testSubmissions), 1);
  assert.equal(await page.evaluate(() => window.location.search), '?q=adventure-actions-regression');
  assert.equal(await page.evaluate(() => window.location.hash), fragment);
  await input.fill('A different draft');
  await page.getByRole('button', { name: 'Close WKND Sherpa' }).click();
  await chat.click();
  await page.waitForFunction(() => (
    document.querySelector('.wknd-sherpa-frame').contentWindow.testSubmissions === 2
  ));
  assert.equal(await input.evaluate(() => window.testLastSent), prompt);
  await page.getByRole('button', { name: 'Close WKND Sherpa' }).click();
  process.stdout.write('PASS keyboard activation, existing popup, exact prompt and one automatic send per activation\n');

  await page.evaluate(() => document.fonts.ready);
  await [375, 768, 1200, 1774].reduce(async (previous, width) => {
    await previous;
    await page.setViewportSize({ width, height: 900 });
    const columns = await page.locator('.generated-section .cards > ul').evaluateAll((grids) => (
      grids.map((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
    ));
    columns.forEach((count) => assert.equal(count, width < 600 ? 1 : 2));
    const measurements = await actions.locator('a').evaluateAll((links) => links.map((link) => {
      const bounds = link.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(link);
      const textBounds = text.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        height: bounds.height,
        textFits: textBounds.left >= bounds.left && textBounds.right <= bounds.right
          && textBounds.top >= bounds.top && textBounds.bottom <= bounds.bottom,
        whiteSpace: getComputedStyle(link).whiteSpace,
      };
    }));
    measurements.forEach((measurement) => {
      assert(measurement.left >= 0 && measurement.right <= width, JSON.stringify(measurement));
      assert(measurement.height >= 44);
      assert(measurement.textFits, 'Action text must not be clipped');
      assert.equal(measurement.whiteSpace, 'normal');
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (screenshots) {
      const card = page.locator('.generated-section .cards > ul > li').first();
      await card.locator('img').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const image = document.querySelector('.generated-section .cards img');
        return image.complete && image.naturalWidth > 0;
      });
      await card.screenshot({ path: path.join(screenshots, `of1-sherpa-actions-${width}.png`) });
    }
  }, Promise.resolve());
  const firstImage = page.locator('.generated-section .cards img').first();
  await firstImage.scrollIntoViewIfNeeded();
  await page.waitForFunction((expected) => {
    const image = document.querySelector('.generated-section .cards img');
    return image.naturalWidth > 0 && image.currentSrc.includes(expected);
  }, canonicalImage);
  assert((await firstImage.getAttribute('src')).includes(canonicalImage));
  assert((await firstImage.locator('..').locator('source').first().getAttribute('srcset')).includes(canonicalImage));
  process.stdout.write('PASS corrupted native image ID restored through captured caption and responsive sources\n');
  const singleCard = await page.evaluate(() => {
    const grid = document.querySelector('.generated-section .cards > ul');
    [...grid.children].slice(1).forEach((card) => card.remove());
    const bounds = grid.getBoundingClientRect();
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      width: bounds.width,
      left: bounds.left,
      right: bounds.right,
      parent: grid.parentElement.getBoundingClientRect().toJSON(),
    };
  });
  assert.equal(singleCard.columns, 1);
  assert(singleCard.width <= 480);
  assert(Math.abs((singleCard.left + singleCard.right)
    - (singleCard.parent.left + singleCard.parent.right)) < 1);
  assert.deepEqual(errors, []);
  await page.goto(`${base}/templates/of1/comparison`);
  await page.locator('.cards[data-block-status="loaded"]').waitFor();
  assert.equal(await page.locator('.cards-card-actions').count(), 0);
  process.stdout.write('PASS wrapped actions and at most two columns at 375/768/1200/1774 px, authored-card isolation and no page errors\n');

  const provenance = await browser.newPage();
  await provenance.route('**/of1/config/knowledge-pages.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{
      blocks: [
        { tag: 'img', alt: 'Ambiguous caption', src: `https://example.com/${canonicalImage}` },
        { tag: 'img', alt: 'Ambiguous caption', src: 'https://example.com/media_1e4b49be43a70d306b1c312d0d78dd369b5ccce40.jpg' },
      ],
    }]),
  }));
  await provenance.goto(`${base}/templates/of1/comparison`);
  const refused = await provenance.evaluate(async (filename) => {
    const { restoreGeneratedImage } = await import(new URL('/scripts/of1-images.js', window.location.origin).href);
    return Promise.all(['', 'Unknown caption', 'Ambiguous caption'].map(async (alt) => {
      const image = document.createElement('img');
      image.src = new URL(`/of1/knowledge/${filename}`, window.location.origin).href;
      image.alt = alt;
      const original = image.src;
      return restoreGeneratedImage(image).then(
        () => ({ error: null, unchanged: image.src === original }),
        (error) => ({ error: error.message, unchanged: image.src === original }),
      );
    }));
  }, corruptedImage);
  refused.forEach((result) => assert(result.error && result.unchanged));
  assert(refused[0].error.includes('no caption'));
  assert(refused[1].error.includes('0 assets'));
  assert(refused[2].error.includes('2 assets'));
  await provenance.close();
  process.stdout.write('PASS missing, unknown and ambiguous captions refuse image substitution\n');
} finally {
  await browser.close();
}
