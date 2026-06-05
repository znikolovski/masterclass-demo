#!/usr/bin/env node
/**
 * Generate a human-readable DAM upload checklist from migration-manifest.json.
 *
 * Usage: node tools/aem-assets/generate-upload-checklist.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, 'output/migration-manifest.json'), 'utf8'));

const byFolder = new Map();
manifest.items.forEach((item) => {
  const list = byFolder.get(item.damFolder) || [];
  list.push(item);
  byFolder.set(item.damFolder, list);
});

let md = `# WKND Adventures — DAM upload checklist\n\n`;
md += `Generated: ${manifest.generatedAt}\n\n`;
md += `Upload sources are publicly reachable from the live site (\`${manifest.origin}\`) unless noted.\n\n`;
md += `After upload in **Assets View**:\n`;
md += `1. Complete metadata on the **WKND** tab\n`;
md += `2. Set **Asset status** to **Approved**\n`;
md += `3. **Publish to Dynamic Media**\n`;
md += `4. Run \`node tools/aem-assets/resolve-delivery-urls.mjs\` then \`npm run migrate:replace-da\`\n\n`;

[...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([folder, items]) => {
  md += `## ${folder}\n\n`;
  md += `| File | Source URL | Used on (pages) | Category |\n`;
  md += `|------|------------|-----------------|----------|\n`;
  items.sort((a, b) => b.count - a.count).forEach((item) => {
    const pages = item.pages?.slice(0, 3).join(', ') || '(library preview)';
    const extra = item.pages?.length > 3 ? ` +${item.pages.length - 3}` : '';
    md += `| ${item.fileName} | ${item.sourceUrl} | ${pages}${extra} | ${item.assetMetadata['wknd:adventureCategory']} |\n`;
  });
  md += `\n`;
});

const out = join(__dirname, 'output/UPLOAD-CHECKLIST.md');
writeFileSync(out, md);
console.log(`Wrote ${out} (${manifest.total} assets)`);
