#!/usr/bin/env node
/**
 * Migrate WKND from document-mode config (files in Git) to Config Service (repoless/API mode).
 *
 * Pushes site, index, sidekick, and robots settings to admin.hlx.page so code and content
 * are defined in the Configuration Service instead of fstab / helix-query.yaml / etc.
 *
 * Prerequisites:
 *   - config_admin or admin on the aem.live org
 *   - Admin session token: export HLX_AUTH_TOKEN="<x-auth-token from admin.hlx.page>"
 *     (Network tab → any admin.hlx.page request → x-auth-token header; NOT the nested imsToken)
 *
 * Usage:
 *   node tools/scripts/migrate-to-repoless-config.mjs --dry-run
 *   node tools/scripts/migrate-to-repoless-config.mjs --apply
 *   node tools/scripts/migrate-to-repoless-config.mjs --apply --remove-repo-config
 *
 * @see https://www.aem.live/docs/repoless
 * @see https://www.aem.live/docs/config-service-setup
 */

import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDaToken } from './lib/da-source.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const CONFIG_DIR = join(ROOT, 'config');
const ADMIN = 'https://admin.hlx.page';

const DEFAULTS = {
  org: 'znikolovski',
  site: 'masterclass-demo',
  codeOwner: 'znikolovski',
  codeRepo: 'masterclass-demo',
  contentUrl: 'https://content.da.live/znikolovski/masterclass-demo/',
};

/** @param {string[]} argv */
function parseArgs(argv) {
  return {
    org: argv.find((a) => a.startsWith('--org='))?.slice(6) || DEFAULTS.org,
    site: argv.find((a) => a.startsWith('--site='))?.slice(7) || DEFAULTS.site,
    codeOwner: argv.find((a) => a.startsWith('--code-owner='))?.slice(13) || DEFAULTS.codeOwner,
    codeRepo: argv.find((a) => a.startsWith('--code-repo='))?.slice(12) || DEFAULTS.codeRepo,
    contentUrl: argv.find((a) => a.startsWith('--content-url='))?.slice(14) || DEFAULTS.contentUrl,
    configDir: argv.find((a) => a.startsWith('--config-dir='))?.slice(13) || CONFIG_DIR,
    dryRun: argv.includes('--dry-run'),
    apply: argv.includes('--apply'),
    removeRepoConfig: argv.includes('--remove-repo-config'),
  };
}

/**
 * @param {string} token
 */
function normalizeAuthToken(token) {
  return token.replace(/^Bearer\s+/i, '').trim();
}

/**
 * Config Service expects the Helix admin session JWT as x-auth-token.
 * Some tokens wrap a nested imsToken — we expose that for Bearer fallback only.
 *
 * @param {string} token
 */
function parseAuthToken(token) {
  const session = normalizeAuthToken(token);
  let imsToken = null;
  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(session.split('.')[1], 'base64url').toString('utf8'));
    if (typeof payload.imsToken === 'string' && payload.imsToken) {
      imsToken = payload.imsToken;
    }
  } catch {
    // not a JWT wrapper
  }
  return { session, imsToken, payload };
}

/**
 * @param {string} token
 * @returns {{ expired: boolean, expiresAt: Date|null }}
 */
function getTokenExpiry(token) {
  const { payload } = parseAuthToken(token);
  if (!payload?.exp) return { expired: false, expiresAt: null };
  const expiresAt = new Date(payload.exp * 1000);
  return { expired: expiresAt.getTime() < Date.now(), expiresAt };
}

/**
 * @param {string} token
 * @returns {'session'|'bearer'}
 */
function detectAuthMode(token) {
  if (process.env.HLX_USE_BEARER === '1') return 'bearer';
  if (process.env.IMS_TOKEN || process.env.AEM_ACCESS_TOKEN) return 'bearer';

  const { imsToken, payload } = parseAuthToken(token);
  if (imsToken) return 'session';
  if (payload?.scope || payload?.sub?.includes('@AdobeID')) return 'bearer';
  if (!payload) return 'bearer';
  return 'session';
}

function getAuthToken() {
  const envToken = process.env.HLX_AUTH_TOKEN
    || process.env.DA_TOKEN
    || process.env.IMS_TOKEN
    || process.env.AEM_ACCESS_TOKEN;
  if (envToken?.trim()) return normalizeAuthToken(envToken);

  const daToken = getDaToken(ROOT);
  if (daToken) return daToken;

  const paths = [
    join(ROOT, '.claude-plugin/project-config.json'),
    join(ROOT, '.hlx/.da-token.json'),
    `${process.env.HOME}/.aem/ims-token.json`,
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const token = raw.imsToken || raw.access_token || raw.token;
      const expiry = raw.imsTokenExpiry || raw.expires_at || (raw.imsTokenExpiry && raw.imsTokenExpiry * 1000);
      if (token && (!expiry || expiry > Date.now() + 60_000)) return token;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * @param {string} method
 * @param {string} path
 * @param {string} token
 * @param {string|object|null} body
 * @param {string} contentType
 */
/**
 * Config Service accepts either:
 * - x-auth-token: admin.hlx.page session JWT (from browser Network tab)
 * - Authorization: Bearer <imsToken> (from da-auth-helper / auth skill)
 *
 * @param {string} token
 * @param {'auto'|'session'|'bearer'} [mode]
 */
function buildAuthHeaders(token, mode = 'auto') {
  const { session, imsToken } = parseAuthToken(token);
  const useBearer = mode === 'bearer'
    || (mode === 'auto' && !imsToken && process.env.HLX_USE_BEARER === '1')
    || (mode === 'auto' && (process.env.IMS_TOKEN || process.env.AEM_ACCESS_TOKEN));

  if (useBearer) {
    return { Authorization: `Bearer ${imsToken || session}` };
  }

  const headers = { 'x-auth-token': session };
  if (imsToken) headers.Authorization = `Bearer ${imsToken}`;
  return headers;
}

/**
 * @param {string} method
 * @param {string} path
 * @param {string} token
 * @param {string|object|null} body
 * @param {string} contentType
 * @param {'auto'|'session'|'bearer'} [authMode]
 */
async function adminRequest(method, path, token, body = null, contentType = 'application/json', authMode = 'auto') {
  const headers = buildAuthHeaders(token, authMode);
  if (body != null) headers['Content-Type'] = contentType;

  const res = await fetch(`${ADMIN}${path}`, {
    method,
    headers,
    body: body == null
      ? undefined
      : (typeof body === 'string' ? body : JSON.stringify(body)),
  });

  const text = await res.text();
  let json = null;
  if (text && contentType.includes('json')) {
    try { json = JSON.parse(text); } catch { /* plain text */ }
  }

  return { status: res.status, text, json, ok: res.ok, authMode: authMode === 'auto' ? 'session' : authMode };
}

/** HTTP statuses that mean the token was accepted (resource may still be missing). */
function isAuthAccepted(status) {
  return status === 200 || status === 404 || status === 405;
}

/**
 * Pick working auth mode. Config Service often rejects GET on sub-resources (405);
 * try org sites list and fall back to detected mode without blocking writes.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} token
 */
async function resolveAuthMode(opts, token) {
  const preferred = detectAuthMode(token);
  const modes = preferred === 'bearer' ? ['bearer', 'session'] : ['session', 'bearer'];
  const probePaths = [
    `/config/${opts.org}/sites.json`,
    `/config/${opts.org}/sites/${DEFAULTS.site}.json`,
    `/config/${opts.org}/sites/${opts.site}.json`,
  ];

  for (const mode of modes) {
    for (const path of probePaths) {
      const probe = await adminRequest('GET', path, token, null, 'application/json', mode);
      if (isAuthAccepted(probe.status)) {
        return { ok: true, authMode: mode, probePath: path, status: probe.status };
      }
    }
  }

  return { ok: false, authMode: preferred, status: 401 };
}

/**
 * @param {string} filePath
 */
/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} fileName
 */
function resolveConfigPath(opts, fileName) {
  return join(opts.configDir, fileName);
}

/**
 * @param {string} filePath
 */
function readConfigFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing config file: ${filePath}`);
  }
  return readFileSync(filePath, 'utf8');
}

/**
 * PUT when missing; POST when present. If PUT returns 409 (already exists), retry POST.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} token
 * @param {string} label
 * @param {string} path
 * @param {string|object} body
 * @param {string} [contentType]
 */
async function upsertConfig(opts, token, label, path, body, contentType = 'application/json') {
  const authMode = activeAuthMode || 'session';
  const current = await adminRequest('GET', path, token, null, contentType, authMode);
  let method = current.status === 404 ? 'PUT' : 'POST';
  console.log(`  ${label}: ${method} ${path}`);
  if (opts.dryRun) return { ok: true, skipped: true };

  let result = await adminRequest(method, path, token, body, contentType, authMode);
  if (method === 'PUT' && result.status === 409) {
    console.log(`  ${label}: exists (409) — retrying POST`);
    method = 'POST';
    result = await adminRequest('POST', path, token, body, contentType, authMode);
  }

  if (result.status === 401) {
    throw new Error(`${label} ${result.status}: token rejected. Refresh HLX_AUTH_TOKEN from admin.hlx.page (Network → x-auth-token) or run: npx github:adobe-rnd/da-auth-helper token`);
  }
  if (!result.ok && result.status !== 204 && result.status !== 201) {
    throw new Error(`${label} ${result.status}: ${result.text.slice(0, 400)}`);
  }
  return result;
}

/** @type {'session'|'bearer'|null} */
let activeAuthMode = null;

/**
 * @param {'session'|'bearer'} mode
 */
function setActiveAuthMode(mode) {
  activeAuthMode = mode;
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} token
 * @param {string} label
 * @param {string} suffix
 * @param {string|object} body
 */
async function pushJsonSubconfig(opts, token, label, suffix, body) {
  const path = `/config/${opts.org}/sites/${opts.site}${suffix}`;
  return upsertConfig(opts, token, label, path, body);
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} token
 */
async function pushSiteConfig(opts, token) {
  const codeBody = { owner: opts.codeOwner, repo: opts.codeRepo };
  const contentBody = {
    source: { url: opts.contentUrl, type: 'markup' },
  };

  const siteManifest = join(CONFIG_DIR, `repoless.${opts.site}.site.json`);
  const rootSitePath = `/config/${opts.org}/sites/${opts.site}.json`;
  if (existsSync(siteManifest)) {
    const body = JSON.parse(readFileSync(siteManifest, 'utf8'));
    await upsertConfig(opts, token, 'site root', rootSitePath, body);
  } else {
    const probe = await adminRequest('GET', rootSitePath, token, null, 'application/json', activeAuthMode || 'session');
    if (probe.status === 404) {
      await upsertConfig(opts, token, 'site root', rootSitePath, {
        version: 1,
        code: codeBody,
        content: contentBody,
      });
    }
  }

  await pushJsonSubconfig(opts, token, 'code', '/code.json', codeBody);
  await pushJsonSubconfig(opts, token, 'content', '/content.json', contentBody);
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} token
 * @param {string} name
 * @param {string} endpointSuffix
 * @param {string} fileName
 * @param {string} contentType
 */
async function pushTextConfig(opts, token, name, endpointSuffix, fileName, contentType) {
  const path = `/config/${opts.org}/sites/${opts.site}${endpointSuffix}`;
  const body = readConfigFile(resolveConfigPath(opts, fileName));
  return upsertConfig(opts, token, name, path, body, contentType);
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} token
 */
async function pushSidekickConfig(opts, token) {
  const path = `/config/${opts.org}/sites/${opts.site}/sidekick.json`;
  const body = JSON.parse(readConfigFile(resolveConfigPath(opts, 'sidekick.json')));
  return upsertConfig(opts, token, 'sidekick', path, body);
}

/**
 * Path mapping for AEM-authored forms / assets → EDS (replaces legacy paths.json).
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {string} token
 */
async function pushPublicConfig(opts, token) {
  const filePath = resolveConfigPath(opts, 'public.json');
  if (!existsSync(filePath)) return null;
  const path = `/config/${opts.org}/sites/${opts.site}/public.json`;
  const body = JSON.parse(readConfigFile(filePath));
  return upsertConfig(opts, token, 'public (path mapping)', path, body);
}

function removeLegacyRepoConfig() {
  const legacyFiles = [
    join(ROOT, 'helix-query.yaml'),
    join(ROOT, 'helix-sitemap.yaml'),
    join(ROOT, 'fstab.yaml'),
    join(ROOT, 'robots.txt'),
    join(ROOT, 'tools/sidekick/config.json'),
  ];
  legacyFiles.forEach((file) => {
    if (existsSync(file)) {
      unlinkSync(file);
      console.log(`  removed ${file.replace(`${ROOT}/`, '')}`);
    }
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.apply && !opts.dryRun) {
    console.log('Pass --dry-run to preview or --apply to push config to the Config Service.');
    process.exit(1);
  }

  const token = getAuthToken();
  if (!token && !opts.dryRun) {
    console.error(`
Missing admin token. Config Service writes need config_admin or admin.

Option A — DA / IMS token (@adobe/aem-cli v16+ has no "aem login"):
  npx github:adobe-rnd/da-auth-helper token
  # token saved to ~/.aem/da-token.json — re-run npm run b2b:migrate-config
  # or: export HLX_AUTH_TOKEN="$(node -e "console.log(require('${process.env.HOME}/.aem/da-token.json').access_token)")"

Option B — admin.hlx.page session JWT (often required for Config Service writes):
  Open https://admin.hlx.page → DevTools → Network → any request → copy x-auth-token header
  export HLX_AUTH_TOKEN="<paste x-auth-token value>"

Then:
  npm run b2b:migrate-config
`);
    process.exit(1);
  }

  console.log(`Repoless Config Service migration (${opts.dryRun ? 'dry-run' : 'apply'})`);
  console.log(`  org:     ${opts.org}`);
  console.log(`  site:    ${opts.site}`);
  console.log(`  code:    ${opts.codeOwner}/${opts.codeRepo}`);
  console.log(`  content: ${opts.contentUrl}`);
  console.log(`  config:  ${opts.configDir}`);
  console.log(`  preview: https://main--${opts.site}--${opts.org}.aem.page/`);

  if (token && !opts.dryRun) {
    const { expired, expiresAt } = getTokenExpiry(token);
    if (expired) {
      console.error(`\nHLX_AUTH_TOKEN expired at ${expiresAt?.toISOString()}.`);
      console.error('Refresh it before running migrate (see instructions below).');
      process.exit(1);
    }

    const auth = await resolveAuthMode(opts, token);
    setActiveAuthMode(auth.authMode);
    console.log(`  auth:    ${auth.authMode === 'bearer' ? 'Authorization Bearer (IMS)' : 'x-auth-token (admin session)'}`);

    if (!auth.ok) {
      console.warn('  note:    could not verify token via GET (Config Service limits GET on many paths)');
      console.warn('           proceeding with detected auth mode — first write will confirm');
    } else {
      console.log(`  note:    token accepted (probe ${auth.probePath} → HTTP ${auth.status})`);
    }

    const siteProbe = await adminRequest(
      'GET',
      `/config/${opts.org}/sites/${opts.site}.json`,
      token,
      null,
      'application/json',
      auth.authMode,
    );
    if (siteProbe.status === 404 || siteProbe.status === 403) {
      console.log(`  note:    site "${opts.site}" not registered yet — will create via PUT`);
    } else if (siteProbe.ok || siteProbe.status === 405) {
      console.log(`  note:    updating existing site "${opts.site}"`);
    }
  }

  await pushSiteConfig(opts, token || '');
  await pushPublicConfig(opts, token || '');
  await pushTextConfig(opts, token || '', 'query index', '/content/query.yaml', 'query.yaml', 'text/yaml');
  await pushSidekickConfig(opts, token || '');
  await pushTextConfig(opts, token || '', 'robots.txt', '/robots.txt', 'robots.txt', 'text/plain');

  if (opts.dryRun) {
    console.log('\nDry run complete. Re-run with --apply to push to Config Service.');
    return;
  }

  console.log('\nConfig Service updated.');
  console.log('Verify:');
  console.log(`  curl -H "x-auth-token: $HLX_AUTH_TOKEN" ${ADMIN}/config/${opts.org}/sites/${opts.site}.json`);
  console.log(`  curl ${ADMIN}/config/${opts.org}/sites/${opts.site}/content/query.yaml`);
  console.log(`  open https://main--${opts.site}--${opts.org}.aem.page/query-index.json`);
  console.log(`  curl https://main--${opts.site}--${opts.org}.aem.page/config.json`);

  if (opts.removeRepoConfig) {
    console.log('\nRemoving legacy repo config files…');
    removeLegacyRepoConfig();
    console.log('Done. Commit the deletions after verifying preview still works.');
  } else {
    console.log('\nAfter verifying preview/live, remove legacy files:');
    console.log('  npm run migrate:repoless -- --apply --remove-repo-config');
    console.log('Also delete /.helix/*.xlsx from DA content if present.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
