import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only browser checks
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
// eslint-disable-next-line import/no-unresolved -- legacy resolver cannot read Stylelint exports
const stylelint = require('stylelint');

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'deliverables/genstudio-wknd');
const fixture = JSON.parse(await readFile(path.join(directory, 'sample-content.json'), 'utf8'));
const templates = fixture.templates.flatMap((template) => [
  template,
  { ...template, ...template.alternate },
]);
assert.equal(new Set(templates.map((template) => template.file)).size, 6);
const screenshots = process.argv[2];
if (screenshots) await mkdir(screenshots, { recursive: true });

const escapeHTML = (text) => text.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const browser = await chromium.launch();
try {
  await Promise.all(templates.map(async (template) => {
    const source = await readFile(path.join(directory, template.file), 'utf8');
    assert.deepEqual(
      [...source.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort(),
      ['brand_logo', 'defaultLogo', 'image', 'imageDescription', 'on_image_text'].sort(),
    );
    assert.equal((source.match(/<img\b/g) || []).length, 2);
    assert.equal((source.match(/src="\{\{image\}\}"/g) || []).length, 1);
    assert(source.includes('src="{{brand_logo}}" style="{{defaultLogo}}"'));
    assert(!/<svg|data:image|<script|name=["']viewport|background-image|transform:/i.test(source));
    assert(!/font-size:\s*[\d.]+(?:em|rem|%|vw)/i.test(source));
    assert.equal(template.canvas.width, 1080, 'Artboard must fill the 1080px media area');
    assert.deepEqual(template.canvas, template.export);

    const inlineStyles = [...source.matchAll(/style="([^"]*)"/g)]
      .filter((match) => match[1] !== '{{defaultLogo}}').map((match, index) => (
        `.element-${index} {\n${match[1].replaceAll('; ', ';\n')}\n}`
      )).join('\n\n');
    const styleBlocks = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)]
      .map((match) => match[1]).join('\n\n');
    const code = `${styleBlocks}\n\n${inlineStyles}`;
    const lint = await stylelint.lint({
      code,
      codeFilename: path.join(root, 'styles/genstudio-validation.css'),
      config: { extends: ['stylelint-config-standard'] },
      configBasedir: root,
    });
    assert(!lint.errored, JSON.stringify(lint.results[0].warnings));

    const page = await browser.newPage({
      viewport: template.export,
      deviceScaleFactor: 1,
    });
    const logoURL = `https://wknd-template-assets.invalid/logo-on-${template.theme}.png`;
    const logoPNG = await readFile(path.join(directory, fixture.logos[template.theme]));
    assert.equal(logoPNG.readUInt32BE(16), 540);
    assert.equal(logoPNG.readUInt32BE(20), 540);
    await page.route(logoURL, (route) => route.fulfill({
      contentType: 'image/png',
      body: logoPNG,
    }));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await [
      template.fields.on_image_text,
      'WILD MOUNTAINS. UNFORGETTABLE WEEKENDS.',
      'W'.repeat(40),
      'Go.',
    ].reduce((previous, copy) => previous.then(async () => {
      const fields = {
        ...template.fields,
        on_image_text: copy,
        brand_logo: logoURL,
        defaultLogo: '',
      };
      const rendered = source.replace(/\{\{([^}]+)\}\}/g, (_, key) => escapeHTML(fields[key]));
      await page.setContent(rendered, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
      });
      const layout = await page.evaluate(({ safeArea, expectedLogoURL }) => {
        const box = (selector) => {
          const {
            x, y, width, height, right, bottom,
          } = document.querySelector(selector).getBoundingClientRect();
          return {
            x, y, width, height, right, bottom,
          };
        };
        const ad = box('.wknd-ad');
        const heading = box('.wknd-headline');
        const brand = box('.wknd-brand');
        const copyBox = box('.wknd-copy');
        const logo = document.querySelector('.wknd-logo');
        const foreground = getComputedStyle(document.querySelector('.wknd-headline')).color;
        const signoff = document.querySelector('.wknd-signoff') ? box('.wknd-signoff') : null;
        return {
          ad,
          body: box('body'),
          heading,
          copyBox,
          signoff,
          foreground,
          background: getComputedStyle(document.querySelector('.wknd-ad')).backgroundColor,
          logoLoaded: logo.src === expectedLogoURL && logo.naturalWidth === 540,
          logoFits: box('.wknd-logo').width === 96 && box('.wknd-logo').height === 96
            && box('.wknd-logo').right <= brand.right && brand.right <= ad.right,
          logoObjectFit: getComputedStyle(logo).objectFit,
          fonts: document.fonts.check('700 72px Syncopate')
            && document.fonts.check('600 30px "Instrument Sans"'),
          imageLoaded: document.querySelector('img').naturalWidth > 0,
          safe: !safeArea || [heading, brand, copyBox].every((item) => (
            item.x >= safeArea.left && item.right <= ad.width - safeArea.right
            && item.y >= safeArea.top && item.bottom <= ad.height - safeArea.bottom
          )),
        };
      }, { safeArea: template.safeArea, expectedLogoURL: logoURL });
      const label = `${template.file} / ${copy}`;
      [layout.ad, layout.body].forEach((element) => {
        assert.equal(element.x, 0, label);
        assert.equal(element.y, 0, label);
        assert.equal(element.width, template.export.width, label);
        assert.equal(element.height, template.export.height, label);
      });
      assert(layout.fonts && layout.imageLoaded, `${label}: missing image or font`);
      const foreground = template.theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(15, 26, 20)';
      const background = template.theme === 'dark' ? 'rgb(15, 26, 20)' : 'rgb(244, 242, 239)';
      assert.equal(layout.foreground, foreground, `${label}: incorrect text theme`);
      assert.equal(layout.background, background, `${label}: incorrect background theme`);
      assert.equal(layout.logoObjectFit, 'contain', `${label}: logo would be cropped`);
      assert(layout.logoLoaded && layout.logoFits, `${label}: logo missing or outside brand area`);
      assert(layout.heading.right <= layout.ad.right, `${label}: horizontal overflow`);
      assert(
        layout.heading.bottom <= (layout.signoff?.y ?? layout.copyBox.bottom),
        `${label}: copy overlaps footer/card`,
      );
      assert(layout.safe, `${label}: outside Stories safe area`);
      if (screenshots && copy === template.fields.on_image_text) {
        const png = await page.screenshot({
          path: path.join(screenshots, template.file.replace('.html', '.png')),
        });
        assert.equal(png.readUInt32BE(16), template.export.width);
        assert.equal(png.readUInt32BE(20), template.export.height);
      }
    }), Promise.resolve());
    assert.deepEqual(errors, [], `${template.file}: browser errors`);
    await page.close();
    process.stdout.write(`PASS ${template.file}: native size, fields, inline CSS and text fit\n`);
  }));
} finally {
  await browser.close();
}
