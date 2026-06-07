#!/usr/bin/env node
/**
 * Remove visitor site authentication (Config Service access.site / preview / live).
 * @see https://www.aem.live/docs/authentication-setup-site
 *
 * Usage:
 *   export HLX_AUTH_TOKEN="<x-auth-token from admin.hlx.page>"
 *   node tools/scripts/remove-site-auth.mjs
 *   node tools/scripts/remove-site-auth.mjs --site=wknd-business
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
    dryRun: argv.includes('--dry-run'),
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

const ACCESS_KEYS = ['site', 'preview', 'live'];

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = getAuthToken();
  if (!token) {
    console.error('No admin auth token. Export HLX_AUTH_TOKEN from admin.hlx.page (x-auth-token header).');
    process.exit(1);
  }

  console.log(`Removing site authentication for ${opts.org}/${opts.site}…\n`);

  for (const key of ACCESS_KEYS) {
    const path = `/config/${opts.org}/sites/${opts.site}/access/${key}.json`;
    const current = await adminRequest('GET', path, token);
    if (current.status === 404) {
      console.log(`  ${key}: not configured (404)`);
      continue;
    }
    if (!current.ok) {
      console.error(`  ${key}: GET failed (${current.status})`, current.body);
      continue;
    }

    const hasSecret = current.body?.secretId?.length > 0;
    const hasAllow = current.body?.allow?.length > 0;
    if (!hasSecret && !hasAllow) {
      console.log(`  ${key}: already open`, current.body);
      continue;
    }

    console.log(`  ${key}: clearing`, current.body);
    if (opts.dryRun) continue;

    const cleared = await adminRequest('POST', path, token, {});
    if (!cleared.ok) {
      console.error(`  ${key}: POST clear failed (${cleared.status})`, cleared.body);
      process.exit(1);
    }
    console.log(`  ${key}: cleared →`, cleared.body);
  }

  const verifyUrl = `https://main--${opts.site}--${opts.org}.aem.page/paths.json`;
  console.log(`\nVerify (should be HTTP 200, not 401):`);
  console.log(`  curl -sI ${verifyUrl} | head -1`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
