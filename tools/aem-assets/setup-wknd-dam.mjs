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

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(join(__dirname, 'wknd-adventures-metadata-form.spec.json'), 'utf8'));

const DEFAULT_AUTHOR = `https://${SPEC.authorUrl}`;
const DRY_RUN = process.argv.includes('--dry-run');

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

/**
 * AEM Assets API paths omit /content/dam prefix.
 * @param {string} damPath e.g. /content/dam/wknd-adventures/heroes
 */
function toApiPath(damPath) {
  const prefix = '/content/dam/';
  if (!damPath.startsWith(prefix)) {
    throw new Error(`Invalid DAM path: ${damPath}`);
  }
  return damPath.slice(prefix.length);
}

async function folderExists(authorUrl, apiPath, headers) {
  const res = await fetch(`${authorUrl}/api/assets/${apiPath}.json`, { headers });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  const body = await res.text();
  throw new Error(`GET /api/assets/${apiPath}.json → ${res.status}: ${body.slice(0, 200)}`);
}

async function createFolder(authorUrl, parentApiPath, folderName, title, headers) {
  const url = parentApiPath
    ? `${authorUrl}/api/assets/${parentApiPath}/${folderName}`
    : `${authorUrl}/api/assets/${folderName}`;

  if (DRY_RUN) {
    console.log(`[dry-run] POST ${url} (title: ${title})`);
    return { status: 201, dryRun: true };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      class: 'assetFolder',
      properties: { 'jcr:title': title, title },
    }),
  });

  const body = await res.text();
  if (res.status === 201) {
    console.log(`✓ Created ${folderName} (${res.status})`);
    return { status: res.status };
  }
  if (res.status === 409) {
    console.log(`· Exists  ${folderName} (409)`);
    return { status: res.status };
  }
  throw new Error(`POST ${url} → ${res.status}: ${body.slice(0, 300)}`);
}

async function ensureFolderTree(authorUrl, damPath, title, headers) {
  const segments = toApiPath(damPath).split('/');
  let parent = '';
  for (let i = 0; i < segments.length; i += 1) {
    const name = segments[i];
    const apiPath = segments.slice(0, i + 1).join('/');
    const exists = await folderExists(authorUrl, apiPath, headers);
    if (exists) {
      console.log(`· Exists  /content/dam/${apiPath}`);
    } else {
      const segmentTitle = i === segments.length - 1 ? title : name;
      await createFolder(authorUrl, parent || null, name, segmentTitle, headers);
    }
    parent = apiPath;
  }
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
