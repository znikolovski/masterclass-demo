#!/usr/bin/env node
/**
 * Upload Sidekick library snippets and DA project config to Document Authoring.
 * Requires a cached IMS token (run `aem content clone --path /` once to authenticate).
 *
 * Usage: node tools/sidekick/sync-library-to-da.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function getToken() {
  const paths = [
    join(ROOT, '.hlx/.da-token.json'),
    `${process.env.HOME}/.aem/da-token.json`,
    `${process.env.HOME}/.aem/ims-token.json`,
  ];
  for (const p of paths) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const token = raw.access_token || raw.imsToken;
      const expires = raw.expires_at || (raw.imsTokenExpiry && raw.imsTokenExpiry * 1000);
      if (token && (!expires || expires > Date.now() + 60_000)) return token;
    } catch {
      /* try next path */
    }
  }
  return null;
}

async function putHtml(token, daPath, html) {
  const form = new FormData();
  form.append('data', new Blob([html], { type: 'text/html' }), basename(daPath));
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${daPath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT ${daPath} → ${res.status}: ${body.slice(0, 200)}`);
  }
}

function walkPlainHtml(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkPlainHtml(abs, files);
    else if (name.endsWith('.plain.html')) files.push(abs);
  }
  return files;
}

const token = getToken();
if (!token) {
  console.error('No DA/IMS token found. Run: aem content clone --path /');
  process.exit(1);
}

const sidekickRoot = join(ROOT, 'tools/sidekick');
const uploads = walkPlainHtml(sidekickRoot).map((abs) => {
  const rel = relative(sidekickRoot, abs);
  const daPath = rel.replace(/\.plain\.html$/, '.html');
  return { abs, daPath };
});

uploads.push({
  abs: join(ROOT, '.migration/project.json'),
  daPath: '.migration/project.json',
});

console.log(`Uploading ${uploads.length} files to ${ORG}/${SITE}…`);

for (const { abs, daPath } of uploads) {
  const body = readFileSync(abs, 'utf8');
  const html = daPath.endsWith('.json') ? body : body;
  await putHtml(token, daPath, html);
  console.log(`  ✓ ${daPath}`);
}

console.log('Done. Preview library: https://da.live/edit#/znikolovski/masterclass-demo/index');
