#!/usr/bin/env node
/**
 * Local/repo maintenance CLI only — not used from Experience Workspace.
 * EW authors use the Library → Send to Adobe Target extension (see skills/ew-send-to-adobe-target).
 *
 * CLI: preview a DA page/fragment and create or update an Adobe Target HTML offer.
 * Uses DA ETC CORS proxy for IMS + Target (same as tools/adobe-target/target-api.js).
 *
 * Usage:
 *   node tools/adobe-target/send-to-target.mjs --path /fragments/columns-featured --name "Columns Featured"
 *   node tools/adobe-target/send-to-target.mjs --path /index --name "Homepage" --delete
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DA_ETC_ORIGIN = 'https://da-etc.adobeaem.workers.dev';
const TARGET_CONFIG_PATH = '/.da/adobe-target.json';
const ROOT = join(fileURLToPath(import.meta.url), '../..');

const DEFAULTS = {
  org: 'znikolovski',
  site: 'masterclass-demo',
  branch: 'main',
};

function etcFetch(href, options) {
  const url = `${DA_ETC_ORIGIN}/cors?url=${encodeURIComponent(href)}`;
  return fetch(url, options);
}

function getToken() {
  const paths = [
    join(ROOT, '.hlx/.da-token.json'),
    `${process.env.HOME}/.aem/da-token.json`,
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const token = raw.access_token || raw.imsToken;
      const expires = raw.expires_at || (raw.imsTokenExpiry && raw.imsTokenExpiry * 1000);
      if (token && (!expires || expires > Date.now() + 60_000)) return token;
    } catch {
      /* try next */
    }
  }
  return null;
}

function parseArgs(argv) {
  const out = { ...DEFAULTS, path: '', name: '', delete: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--path') out.path = argv[++i] || '';
    else if (a === '--name') out.name = argv[++i] || '';
    else if (a === '--org') out.org = argv[++i] || DEFAULTS.org;
    else if (a === '--site') out.site = argv[++i] || DEFAULTS.site;
    else if (a === '--branch') out.branch = argv[++i] || DEFAULTS.branch;
    else if (a === '--delete') out.delete = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  if (out.path && !out.path.startsWith('/')) out.path = `/${out.path}`;
  return out;
}

function sheetRows(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json)) return json;
  return [];
}

async function fetchTargetConfig(org, site, token) {
  const resp = await fetch(`https://admin.da.live/source/${org}/${site}${TARGET_CONFIG_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error('Could not load /.da/adobe-target.json from DA.');
  const rows = sheetRows(await resp.json()).reduce((acc, row) => {
    if (row.key) acc[row.key] = row.value;
    return acc;
  }, {});
  const { tenant, clientId, clientSecret } = rows;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error('Missing tenant, clientId, or clientSecret in /.da/adobe-target.json.');
  }
  const ims = await etcFetch('https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid,AdobeID,target_sdk,additional_info.projectedProductContext,read_organizations,additional_info.roles',
    }),
  });
  if (!ims.ok) throw new Error(`IMS token failed: ${ims.status} ${await ims.text()}`);
  const data = await ims.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return { tenant, clientId, token: data.access_token };
}

async function savePreview(org, site, branch, sourcePath, token) {
  const resp = await fetch(`https://admin.hlx.page/preview/${org}/${site}/${branch}${sourcePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Preview failed: ${resp.status}`);
  const json = await resp.json();
  const url = json?.preview?.url || json?.url;
  if (!url) throw new Error('Preview did not return a URL.');
  return url;
}

function extractMainInner(html) {
  const match = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!match) throw new Error('Preview HTML has no <main> element.');
  return match[1];
}

function parseOfferId(html) {
  const m = html.match(/adobe\.target\.offerId[\s\S]*?<td[^>]*>\s*<p>([^<]+)<\/p>/i)
    || html.match(/adobe\.target\.offerId<\/td>\s*<td[^>]*>([^<]+)/i);
  return m?.[1]?.trim() || null;
}

async function readSource(org, site, sourcePath, token) {
  const resp = await fetch(`https://admin.da.live/source/${org}/${site}${sourcePath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Could not read source ${sourcePath}: ${resp.status}`);
  return resp.text();
}

async function writeOfferId(org, site, sourcePath, offerId, token) {
  let html = await readSource(org, site, sourcePath, token);
  const table = `<table><tbody><tr><td colspan="2">metadata</td></tr><tr><td>adobe.target.offerId</td><td>${offerId}</td></tr></tbody></table>`;
  const mainClose = html.indexOf('</main>');
  if (html.includes('adobe.target.offerId')) {
    html = html.replace(
      /(<td[^>]*>\s*<p>\s*adobe\.target\.offerId\s*<\/p>\s*<\/td>\s*<td[^>]*>)([\s\S]*?)(<\/td>)/i,
      `$1<p>${offerId}</p>$3`,
    );
  } else if (mainClose !== -1) {
    html = `${html.slice(0, mainClose)}\n${table}\n${html.slice(mainClose)}`;
  } else {
    html = `${html}\n${table}`;
  }
  const form = new FormData();
  form.append('data', new Blob([html], { type: 'text/html' }), basename(sourcePath) || 'index.html');
  const put = await fetch(`https://admin.da.live/source/${org}/${site}${sourcePath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!put.ok) throw new Error(`Could not save offer metadata: ${put.status}`);
}

function getEditUrl(aemUrl) {
  const parsed = new URL(aemUrl);
  const [, repo, org] = parsed.hostname.split('.')[0].split('--');
  return `https://da.live/edit#/${org}/${repo}${parsed.pathname}`;
}

async function saveOffer(config, name, content, aemUrl, offerId) {
  const isUpdate = Boolean(offerId);
  const href = isUpdate
    ? `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}?includeMarketingCloudMetadata=true`
    : `https://mc.adobe.io/${config.tenant}/target/offers/content?includeMarketingCloudMetadata=true`;
  const resp = await etcFetch(href, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-api-key': config.clientId,
      'Content-Type': 'application/vnd.adobe.target.v1+json',
      Accept: 'application/vnd.adobe.target.v1+json',
    },
    body: JSON.stringify({
      name,
      content,
      marketingCloudMetadata: {
        editURL: getEditUrl(aemUrl),
        'aem.lastUpdatedTime': new Date().toISOString(),
        'aem.offerType': 'xf',
        'aem.offerURL': aemUrl,
        sourceProductName: 'Adobe Experience Manager',
        'aem.lastUpdatedBy': 'DA Agent',
      },
    }),
  });
  if (!resp.ok) throw new Error(`Target API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.id;
}

async function deleteOffer(config, offerId) {
  const resp = await etcFetch(
    `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'x-api-key': config.clientId,
        Accept: 'application/vnd.adobe.target.v1+json',
      },
    },
  );
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Target delete ${resp.status}: ${await resp.text()}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/adobe-target/send-to-target.mjs --path <source-path> --name <offer-name>
       node tools/adobe-target/send-to-target.mjs --path /fragments/foo --delete

  --path   DA source path (e.g. /index, /fragments/columns-featured)
  --name   Target offer name (required unless --delete)
  --org    DA org (default: ${DEFAULTS.org})
  --site   DA site (default: ${DEFAULTS.site})
  --delete Delete linked offer using adobe.target.offerId in page metadata`);
    process.exit(0);
  }

  if (!args.path) {
    console.error('Missing --path');
    process.exit(1);
  }

  const token = getToken();
  if (!token) {
    console.error('No DA token. Run da-auth or save token to .hlx/.da-token.json');
    process.exit(1);
  }

  const sourceHtml = await readSource(args.org, args.site, args.path, token);
  const existingOfferId = parseOfferId(sourceHtml);

  if (args.delete) {
    if (!existingOfferId) {
      console.log('No adobe.target.offerId in source; nothing to delete.');
      process.exit(0);
    }
    const config = await fetchTargetConfig(args.org, args.site, token);
    await deleteOffer(config, existingOfferId);
    console.log(`Deleted Target offer ${existingOfferId}`);
    process.exit(0);
  }

  if (!args.name) {
    console.error('Missing --name for create/update');
    process.exit(1);
  }

  const previewUrl = await savePreview(args.org, args.site, args.branch, args.path, token);
  const pageHtml = await fetch(`${previewUrl}?nocache=${Date.now()}`);
  if (!pageHtml.ok) throw new Error(`Could not fetch preview HTML: ${pageHtml.status}`);
  const mainHtml = extractMainInner(await pageHtml.text());

  const config = await fetchTargetConfig(args.org, args.site, token);
  const offerId = await saveOffer(config, args.name, mainHtml, previewUrl, existingOfferId);
  await writeOfferId(args.org, args.site, args.path, offerId, token);

  console.log(JSON.stringify({
    success: true,
    offerId,
    offerName: args.name,
    previewUrl,
    sourcePath: args.path,
    action: existingOfferId ? 'updated' : 'created',
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
