import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/no-extraneous-dependencies -- development-only image export
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'deliverables/genstudio-wknd/assets');
const svg = await readFile(path.join(root, 'icons/wknd-adventures-logo.svg'), 'utf8');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  await Promise.all([
    { theme: 'dark', color: '#fff' },
    { theme: 'light', color: '#0f1a14' },
  ].map(async ({ theme, color }) => {
    const page = await browser.newPage({
      viewport: { width: 540, height: 540 },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<body style="width:540px;height:540px;margin:0;color:${color}">${svg}</body>`,
    );
    const png = await page.screenshot({
      path: path.join(output, `wknd-compass-on-${theme}.png`),
      omitBackground: true,
    });
    assert.equal(png.readUInt32BE(16), 540);
    assert.equal(png.readUInt32BE(20), 540);
    assert(png.length < 20000, 'Logo must remain a small reusable asset');
    await page.close();
    process.stdout.write(`Exported wknd-compass-on-${theme}.png (${png.length} bytes)\n`);
  }));
} finally {
  await browser.close();
}
