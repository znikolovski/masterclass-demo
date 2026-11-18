#!/usr/bin/env node
/**
 * Create WKND Adventures DAM folder structure on AEM author via Assets HTTP API.
 *
 * Auth (pick one):
 *   AEM_ACCESS_TOKEN  — Bearer token from AEM author IMS session
 *   AEM_USER + AEM_PASSWORD — local/dev only; Cloud Service often blocks basic auth
 *
 * Usage:
 *   node tools/aem-assets/setup-wknd-dam.mjs
 *   node tools/aem-assets/setup-wknd-dam.mjs --dry-run
 *   AEM_ACCESS_TOKEN=… node tools/aem-assets/setup-wknd-dam.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureFolderTree as ensureTree } from './dam-upload.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(join(__dirname, 'wknd-adventures-metadata-form.spec.json'), 'utf8'));

const DEFAULT_AUTHOR = `https://${SPEC.authorUrl}`;
const DRY_RUN = process.argv.includes('--dry-run');
const ensureFolderTree = (authorUrl, damPath, title, headers) => ensureTree(authorUrl, damPath, title, headers, { dryRun: DRY_RUN });

function getAuthHeaders() {
  const token = process.env.AEM_ACCESS_TOKEN?.trim();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  const user = process.env.AEM_USER?.trim();
  const pass = process.env.AEM_PASSWORD ?? '';
  if (user) {
    const basic = Buffer.from(`${user}:${pass}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }
  return null;
}

async function main() {
  const authorUrl = (process.env.AEM_AUTHOR_URL || DEFAULT_AUTHOR).replace(/\/$/, '');

  console.log(`AEM author: ${authorUrl}`);
  if (DRY_RUN) {
    console.log('Mode: dry-run (no API calls)\n');
    const { root, subfolders } = SPEC.folderMetadata;
    console.log(`Would create: ${root}`);
    for (const folder of subfolders) {
      console.log(`Would create: ${folder.path} (${folder.title})`);
    }
    console.log('\nMetadata form: see docs/AEM-ASSETS-METADATA-SETUP.md');
    return;
  }

  if (!getAuthHeaders()) {
    console.error(`
No AEM author credentials found.

Set one of:
  export AEM_ACCESS_TOKEN="<IMS bearer from AEM author session>"
  export AEM_USER="..." AEM_PASSWORD="..."

Author URL (optional):
  export AEM_AUTHOR_URL="${DEFAULT_AUTHOR}"

Then run:
  node tools/aem-assets/setup-wknd-dam.mjs
`);
    process.exit(1);
  }

  const authHeaders = getAuthHeaders();

  // Verify API access
  const probe = await fetch(`${authorUrl}/api/assets.json`, { headers: authHeaders });
  if (probe.status === 401 || probe.status === 403) {
    console.error(`Assets API returned ${probe.status}. Refresh AEM_ACCESS_TOKEN or check permissions.`);
    process.exit(1);
  }
  if (!probe.ok && probe.status !== 404) {
    const text = await probe.text();
    console.error(`Assets API probe failed: ${probe.status} ${text.slice(0, 200)}`);
    process.exit(1);
  }

  const { root, subfolders } = SPEC.folderMetadata;
  const rootTitle = 'WKND Adventures';

  console.log('\nCreating root folder…');
  await ensureFolderTree(authorUrl, root, rootTitle, authHeaders);

  console.log('\nCreating subfolders…');
  for (const folder of subfolders) {
    await ensureFolderTree(authorUrl, folder.path, folder.title, authHeaders);
  }

  console.log('\nDone. Next: create the metadata form in Assets View (see docs/AEM-ASSETS-METADATA-SETUP.md).');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
