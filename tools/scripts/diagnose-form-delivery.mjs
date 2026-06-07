#!/usr/bin/env node
/**
 * Diagnose AEM Franklin form → EDS delivery for repoless DA sites.
 *
 * Usage:
 *   export HLX_AUTH_TOKEN="<x-auth-token from admin.hlx.page>"
 *   node tools/scripts/diagnose-form-delivery.mjs
 *   node tools/scripts/diagnose-form-delivery.mjs --form=wknd-adventure-registration-form
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ADMIN = 'https://admin.hlx.page';

function parseArgs(argv) {
  return {
    org: argv.find((a) => a.startsWith('--org='))?.slice(6) || 'znikolovski',
    site: argv.find((a) => a.startsWith('--site='))?.slice(7) || 'masterclass-demo',
    form: argv.find((a) => a.startsWith('--form='))?.slice(7) || 'wknd-adventure-registration-form',
    aemFolder: argv.find((a) => a.startsWith('--aem-folder='))?.slice(13) || 'wknd',
    publishHost: argv.find((a) => a.startsWith('--publish='))?.slice(10)
      || 'publish-p115476-e1135027.adobeaemcloud.com',
  };
}

function getAuthToken() {
  const envToken = process.env.HLX_AUTH_TOKEN
    || process.env.IMS_TOKEN
    || process.env.AEM_ACCESS_TOKEN;
  if (envToken?.trim()) return envToken.replace(/^Bearer\s+/i, '').trim();
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/project-config.json'), 'utf8'));
    if (raw.imsToken && raw.imsTokenExpiry > Date.now() + 60_000) return raw.imsToken;
  } catch {
    // continue
  }
  return null;
}

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return { status: res.status, error: res.headers.get('x-error') };
  } catch (err) {
    return { status: 0, error: String(err) };
  }
}

async function getJson(url, token) {
  const res = await fetch(url, {
    headers: token ? { 'x-auth-token': token } : {},
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text.slice(0, 500) };
  }
}

function printCheck(label, ok, detail) {
  const icon = ok ? '✓' : '✗';
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = getAuthToken();
  const preview = `https://main--${opts.site}--${opts.org}.aem.page`;
  const live = `https://main--${opts.site}--${opts.org}.aem.live`;
  const mappedPath = `/forms/${opts.form}`;

  console.log(`Form delivery diagnostic — ${opts.org}/${opts.site}`);
  console.log(`  AEM path:  /content/forms/af/${opts.aemFolder}/${opts.form}`);
  console.log(`  EDS path:  ${mappedPath}.model.json\n`);

  // --- EDS public endpoints ---
  console.log('EDS delivery (public):');
  const checks = [
    ['Site public', `${live}/`],
    ['paths via config.json', `${live}/config.json`],
    ['Form model (live)', `${live}${mappedPath}.model.json`],
    ['Form model (preview)', `${preview}${mappedPath}.model.json`],
  ];
  for (const [label, url] of checks) {
    const r = await head(url);
    printCheck(label, r.status === 200, `HTTP ${r.status}${r.error ? ` (${r.error})` : ''}`);
  }

  // --- AEM publish ---
  console.log('\nAEM publish tier:');
  const pub = `https://${opts.publishHost}`;
  const pubChecks = [
    ['Form infinity.json', `${pub}/content/forms/af/${opts.aemFolder}/${opts.form}.infinity.json`],
    ['Form HTML', `${pub}/content/forms/af/${opts.aemFolder}/${opts.form}.html`],
  ];
  for (const [label, url] of pubChecks) {
    const r = await head(url);
    printCheck(label, r.status === 200, `HTTP ${r.status}`);
  }

  // --- Config Service (needs token) ---
  console.log('\nConfig Service (repoless DA site — replaces AEM site-level EDS config):');
  if (!token) {
    console.log('  ⚠ Skipped — set HLX_AUTH_TOKEN to verify access.json and site config');
  } else {
    const siteCfg = await getJson(`${ADMIN}/config/${opts.org}/sites/${opts.site}.json`, token);
    const accessCfg = await getJson(`${ADMIN}/config/${opts.org}/sites/${opts.site}/access.json`, token);
    const publicCfg = await getJson(`${ADMIN}/config/${opts.org}/sites/${opts.site}/public.json`, token);

    const codeOwner = siteCfg.body?.code?.owner;
    const codeRepo = siteCfg.body?.code?.repo;
    const contentUrl = siteCfg.body?.content?.source?.url;
    printCheck('Site registered', siteCfg.status === 200, `HTTP ${siteCfg.status}`);
    printCheck('Code owner/repo', codeOwner === opts.org && codeRepo === opts.site,
      `${codeOwner}/${codeRepo}`);
    printCheck('DA content source', !!contentUrl?.includes('content.da.live'),
      contentUrl || 'missing');

    const configAdmins = accessCfg.body?.admin?.role?.config_admin || [];
    const hasTechAcct = configAdmins.some((e) => e.includes('@techacct.adobe.com'));
    printCheck('Tech account in config_admin', hasTechAcct,
      hasTechAcct ? configAdmins.join(', ') : `found: [${configAdmins.join(', ')}]`);

    const mappings = publicCfg.body?.paths?.mappings || [];
    const formMapping = `/content/forms/af/${opts.aemFolder}/`;
    const hasMapping = mappings.some((m) => m.startsWith(formMapping));
    printCheck(`Path mapping for ${formMapping}`, hasMapping,
      hasMapping ? 'present in public.json' : 'missing from public.json');
  }

  console.log(`
What cq:isDelivered means
  false on the form page = AEM could not push form HTML/model to the EDS content-bus.
  This is NOT fixed by paths.json alone — the technical account must successfully write to EDS.

AEM-side checks (author UI / CRX)
  1. /conf/forms/${opts.aemFolder}/settings/cloudconfigs/edge-delivery-service-configuration
     - owner = ${opts.org}
     - repo  = ${opts.site}   (EDS site slug, NOT the AEM folder name "${opts.aemFolder}")
     - cq:isDelivered on THIS cloud config node (not only the form page)
     - If "project type" exists → set to repoless / aem.live with repoless config setup
  2. Manage Publication → activate cloud config + form to publish tier
  3. author error.log — search for franklin, delivery, edge, techacct after re-publish

Replication smoke test (author — run after a publish attempt)
  Cloud config must replicate; if MCP/UI returns "agents failed to replicate" for
  /conf/forms/wknd/settings/cloudconfigs/edge-delivery-service-configuration
  then cq:isDelivered will stay false regardless of config_admin.

If delivery stays blocked
  npm run b2b:forms   # document-based sheet JSON → DA (no cq:isDelivered needed)
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
