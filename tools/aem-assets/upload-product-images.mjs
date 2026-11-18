#!/usr/bin/env node
/**
 * Uploads Firefly-generated WKND product images to AEM Assets with Adobe Commerce linking
 * metadata, and approves them so Dynamic Media with OpenAPI can deliver them.
 *
 *   export AEM_ACCESS_TOKEN="<IMS bearer from an AEM author session>"   # optional AEM_API_KEY
 *   node tools/aem-assets/upload-product-images.mjs [--dry-run] [--limit=N] [--only=WKND-JKT-001]
 *                                                   [--replace] [--allow-unknown]
 *
 * Drop folder: tools/aem-assets/product-images/drop/<PARENT-SKU>/<filename from image-prompts.json>
 * Metadata written per asset (read by the wknd-commerce asset-to-product matcher):
 *   commerce:isCommerce=yes, commerce:skus[], commerce:roles[], commerce:positions[],
 *   dc:title, dc:description (alt text), dam:status=approved
 * Report: tools/aem-assets/product-images/upload-report.json
 */
import {
  existsSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureFolderTree, uploadBinary } from './dam-upload.mjs';
import {
  applyAssetMetadata, getAuthorUrl, requireAuth, resolveAssetId, toApiPath, waitForAsset,
} from './dam-metadata.mjs';
import { authorToDeliveryBase } from './dam-delivery.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, 'product-images');
const DROP = join(ROOT, 'drop');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const opts = {
  dryRun: flag('dry-run'),
  replace: flag('replace'),
  allowUnknown: flag('allow-unknown'),
  limit: Number(opt('limit')) || Infinity,
  only: opt('only')?.toUpperCase(),
  catalog: resolve(process.cwd(), opt('catalog') || join(__dirname, '../../../wknd-commerce/data/catalog.json')),
};

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function loadPlan() {
  const promptsPath = join(ROOT, 'image-prompts.json');
  if (!existsSync(promptsPath)) throw new Error('Run product-image-prompts.mjs first');
  const { images } = JSON.parse(readFileSync(promptsPath, 'utf8'));
  return new Map(images.map((r) => [r.filename.toLowerCase(), r]));
}

function categoryTitles() {
  if (!existsSync(opts.catalog)) return {};
  const catalog = JSON.parse(readFileSync(opts.catalog, 'utf8'));
  const titles = { 'wknd-adventures/products': 'Products' };
  catalog.categories.forEach((c) => {
    titles[`wknd-adventures/products/${c.urlPath}`] = c.name;
  });
  const names = Object.fromEntries(catalog.products.map((p) => [p.sku, p.name]));
  return { titles, names };
}

function collectFiles(plan) {
  if (!existsSync(DROP)) return [];
  const files = [];
  readdirSync(DROP).forEach((dir) => {
    const folder = join(DROP, dir);
    if (!statSync(folder).isDirectory()) return;
    readdirSync(folder).filter((f) => MIME[extname(f).toLowerCase()]).forEach((file) => {
      const row = plan.get(file.toLowerCase());
      if (!row) {
        console.warn(`  ⚠ ${dir}/${file} is not in image-prompts.json${opts.allowUnknown ? ' — uploading with folder rule only' : ' — skipped'}`);
        if (!opts.allowUnknown) return;
      } else if (row.parentSku !== dir.toUpperCase()) {
        console.warn(`  ⚠ ${dir}/${file} belongs in drop/${row.parentSku}/ — skipped`);
        return;
      }
      files.push({ path: join(folder, file), file, dir: dir.toUpperCase(), row });
    });
  });
  return files
    .filter((f) => !opts.only || f.dir === opts.only)
    .slice(0, opts.limit);
}

function metadataFor({ row, dir }, names) {
  const skus = row?.skus || [dir];
  const position = row?.position || 1;
  return {
    'dc:title': `${names?.[dir] || dir}${row?.colourTitle ? ` — ${row.colourTitle}` : ''}${row?.shot === 'lifestyle' ? ' (lifestyle)' : ''}`,
    'dc:description': row?.altText || '',
    'commerce:isCommerce': 'yes',
    'commerce:skus': skus,
    'commerce:positions': skus.map(() => String(position)),
    ...(row?.roles?.length ? { 'commerce:roles': row.roles } : {}),
    'dam:status': 'approved',
  };
}

async function assetExists(authorUrl, damFolder, file, headers) {
  const res = await fetch(`${authorUrl}/api/assets/${toApiPath(damFolder, file)}.json`, { headers });
  return res.ok;
}

async function main() {
  const plan = loadPlan();
  const { titles, names } = categoryTitles();
  const files = collectFiles(plan);
  const authorUrl = getAuthorUrl();
  console.log(`${files.length} image(s) to process → ${authorUrl}${opts.dryRun ? ' (dry run)' : ''}`);
  if (!files.length) return;

  const headers = opts.dryRun ? {} : requireAuth();
  const report = [];
  const ensured = new Set();
  for (let i = 0; i < files.length; i += 1) {
    const item = files[i];
    const damFolder = item.row?.damFolder || `/content/dam/wknd-adventures/products/unsorted/${item.dir}`;
    const metadata = metadataFor(item, names);
    const entry = {
      file: `${item.dir}/${item.file}`, damPath: `${damFolder}/${item.file}`, skus: metadata['commerce:skus'],
    };
    try {
      if (opts.dryRun) {
        console.log(`  [dry-run] ${entry.damPath}`, JSON.stringify(metadata));
        entry.status = 'dry-run';
      } else {
        if (!ensured.has(damFolder)) {
          // eslint-disable-next-line no-await-in-loop
          await ensureFolderTree(authorUrl, damFolder, names?.[item.dir] || item.dir, headers, { titles, quiet: true });
          ensured.add(damFolder);
        }
        // eslint-disable-next-line no-await-in-loop
        const exists = await assetExists(authorUrl, damFolder, item.file, headers);
        if (!exists || opts.replace) {
          const ext = extname(item.file).toLowerCase();
          // eslint-disable-next-line no-await-in-loop
          await uploadBinary(authorUrl, damFolder, item.file, readFileSync(item.path), MIME[ext], headers);
          // eslint-disable-next-line no-await-in-loop
          await waitForAsset(authorUrl, toApiPath(damFolder, item.file), headers);
          entry.uploaded = true;
        }
        // eslint-disable-next-line no-await-in-loop
        await applyAssetMetadata(authorUrl, damFolder, item.file, metadata, headers);
        // eslint-disable-next-line no-await-in-loop
        entry.assetId = await resolveAssetId(authorUrl, damFolder, item.file, headers);
        if (entry.assetId?.startsWith('urn:aaid:aem:')) {
          entry.deliveryBase = `${authorToDeliveryBase(authorUrl)}/adobe/assets/${entry.assetId}`;
        }
        entry.status = 'ok';
        console.log(`  ✓ ${entry.damPath} → ${metadata['commerce:skus'].length} SKU(s)`);
      }
    } catch (e) {
      entry.status = 'failed';
      entry.error = e.message;
      console.error(`  ✕ ${entry.damPath}: ${e.message}`);
    }
    report.push(entry);
  }
  writeFileSync(join(ROOT, 'upload-report.json'), `${JSON.stringify({ at: new Date().toISOString(), authorUrl, report }, null, 1)}\n`);
  const failed = report.filter((r) => r.status === 'failed').length;
  console.log(`Done: ${report.length - failed} ok, ${failed} failed. Report: product-images/upload-report.json`);
  console.log('Approved assets are linked by the wknd-commerce asset-events action (I/O Events) or the nightly reconcile.');
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
