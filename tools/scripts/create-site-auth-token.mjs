#!/usr/bin/env node
/**
 * Create a site authentication token (Config Service secret).
 * @see https://www.aem.live/docs/authentication-setup-site
 *
 * Usage:
 *   export HLX_AUTH_TOKEN="<x-auth-token from admin.hlx.page Network tab>"
 *   node tools/scripts/create-site-auth-token.mjs
 *   node tools/scripts/create-site-auth-token.mjs --org=znikolovski --site=masterclass-demo
 *
 * Optional — enable token on preview + live (step 3 in docs):
 *   node tools/scripts/create-site-auth-token.mjs --apply-access --allow="*@adobe.com"
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ADMIN = 'https://admin.hlx.page';

function parseArgs(argv) {
  const allowArg = argv.find((a) => a.startsWith('--allow='))?.slice(8);
  return {
    org: argv.find((a) => a.startsWith('--org='))?.slice(6) || 'znikolovski',
    site: argv.find((a) => a.startsWith('--site='))?.slice(7) || 'masterclass-demo',
    applyAccess: argv.includes('--apply-access'),
    allow: allowArg ? allowArg.split(',').map((s) => s.trim()).filter(Boolean) : ['*@adobe.com'],
  };
}

function normalizeAuthToken(token) {
  return token.replace(/^Bearer\s+/i, '').trim();
}

function getAuthToken() {
  const envToken = process.env.HLX_AUTH_TOKEN
    || process.env.IMS_TOKEN
    || process.env.AEM_ACCESS_TOKEN;
  if (envToken?.trim()) return normalizeAuthToken(envToken);

  const paths = [
    join(ROOT, '.claude-plugin/project-config.json'),
    `${process.env.HOME}/.aem/ims-token.json`,
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const token = raw.imsToken || raw.access_token || raw.token;
      const expiry = raw.imsTokenExpiry || raw.expires_at;
      if (token && (!expiry || expiry > Date.now() + 60_000)) return token;
    } catch {
      // continue
    }
  }
  return null;
}

function buildAuthHeaders(token) {
  let imsToken = null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (typeof payload.imsToken === 'string') imsToken = payload.imsToken;
  } catch {
    // plain IMS token
  }
  if (imsToken) {
    return { 'x-auth-token': token, Authorization: `Bearer ${imsToken}` };
  }
  if (process.env.HLX_USE_BEARER === '1') {
    return { Authorization: `Bearer ${token}` };
  }
  return { 'x-auth-token': token };
}

/**
 * @param {string} method
 * @param {string} path
 * @param {string} token
 * @param {object|null} [body]
 */
async function adminRequest(method, path, token, body = null) {
  const headers = { ...buildAuthHeaders(token) };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${ADMIN}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, body: json };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = getAuthToken();
  if (!token) {
    console.error('No admin auth token found.');
    console.error('');
    console.error('Set HLX_AUTH_TOKEN from admin.hlx.page (Network tab → x-auth-token header):');
    console.error('  export HLX_AUTH_TOKEN="<your-token>"');
    console.error('  node tools/scripts/create-site-auth-token.mjs');
    console.error('');
    console.error('Or authenticate via IMS Bearer:');
    console.error('  aem login  # or auth skill');
    console.error('  export HLX_USE_BEARER=1');
    console.error('  export HLX_AUTH_TOKEN="<ims-access-token>"');
    process.exit(1);
  }

  const secretsPath = `/config/${opts.org}/sites/${opts.site}/secrets.json`;
  console.log(`POST ${secretsPath}`);

  const create = await adminRequest('POST', secretsPath, token, {});
  if (!create.ok) {
    console.error(`Failed to create site secret (HTTP ${create.status})`);
    console.error(JSON.stringify(create.body, null, 2));
    process.exit(1);
  }

  const { id, value, created } = create.body;
  console.log('\nSite authentication token created:\n');
  console.log(`  secret id:    ${id}`);
  console.log(`  secret value: ${value}`);
  if (created) console.log(`  created:      ${created}`);
  console.log('\nUse in requests:');
  console.log(`  curl https://main--${opts.site}--${opts.org}.aem.live \\`);
  console.log(`    -H 'authorization: token ${value}'`);
  console.log('\nStore the value securely. This is the site token (not your admin API token).');

  if (!opts.applyAccess) {
    console.log('\nTo enable site authentication (step 3), run:');
    console.log(`  node tools/scripts/create-site-auth-token.mjs --apply-access --allow="*@yourdomain.com"`);
    console.log(`  (re-run after setting HLX_AUTH_TOKEN; a new secret is created each POST)`);
    return;
  }

  const accessPath = `/config/${opts.org}/sites/${opts.site}/access/site.json`;
  console.log(`\nPOST ${accessPath}`);
  const access = await adminRequest('POST', accessPath, token, {
    allow: opts.allow,
    secretId: [id],
  });
  if (!access.ok) {
    console.error(`Failed to enable site access (HTTP ${access.status})`);
    console.error(JSON.stringify(access.body, null, 2));
    process.exit(1);
  }
  console.log('\nSite access configured:');
  console.log(JSON.stringify(access.body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
