#!/usr/bin/env node
/**
 * Normalize blog article HTML in DA: split hero from body, fix section style classes.
 * Prerequisites: `aem content clone --path /`
 * Usage: node tools/scripts/fix-blog-da-structure.mjs [--dry-run]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DRY_RUN = process.argv.includes('--dry-run');
const SECTION_STYLES = ['secondary', 'inverse', 'accent'];

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
      /* continue */
    }
  }
  return null;
}

function insertHrAfterHero(html) {
  const marker = 'class="hero-adventure"';
  const start = html.indexOf(marker);
  if (start === -1) return html;

  const open = html.lastIndexOf('<div', start);
  let depth = 0;
  let i = open;
  while (i < html.length) {
    if (html.startsWith('<div', i)) depth += 1;
    if (html.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) {
        i += 6;
        const ws = html.slice(i).match(/^\s*/)[0];
        i += ws.length;
        if (html.startsWith('<hr', i)) return html;
        if (/^<(p|h2|h3|ul|ol|blockquote)\b/i.test(html.slice(i))) {
          return `${html.slice(0, i)}\n<hr>\n${html.slice(i)}`;
        }
        return html;
      }
    }
    i += 1;
  }
  return html;
}

function sectionMetadataBlock(style) {
  return `  <div class="section-metadata">
    <div>
      <div>style</div>
      <div>${style}</div>
    </div>
  </div>`;
}

function normalizeStyledSections(html) {
  let out = html;
  SECTION_STYLES.forEach((style) => {
    const open = `<div class="${style}">`;
    let idx = out.indexOf(open);
    while (idx !== -1) {
      const close = out.indexOf('</div>', idx + open.length);
      if (close === -1) break;
      const inner = out.slice(idx + open.length, close);
      const replacement = `<div>\n${inner.trim()}\n${sectionMetadataBlock(style)}\n`;
      out = `${out.slice(0, idx)}${replacement}${out.slice(close)}`;
      idx = out.indexOf(open);
    }
  });
  return out;
}

function ensureHeroSectionMetadata(html) {
  if (html.includes('hero-adventure-container')) return html;
  if (!html.includes('class="hero-adventure"')) return html;

  const heroEnd = html.indexOf('class="hero-adventure"');
  const close = html.indexOf('</div>', html.indexOf('</div>', html.indexOf('</div>', heroEnd) + 6) + 6);
  if (close === -1) return html;

  const insertAt = close + 6;
  const meta = `\n${sectionMetadataBlock('hero-adventure-container')}`;
  return `${html.slice(0, insertAt)}${meta}${html.slice(insertAt)}`;
}

function ensureBodyNarrowMetadata(html) {
  if (!html.includes('<hr>')) return html;
  const parts = html.split(/<hr>\s*/i);
  if (parts.length < 2) return html;

  const body = parts[1];
  if (body.includes('class="section-metadata"') || body.includes('>narrow<')) {
    return html;
  }
  const bodyClose = body.lastIndexOf('</div>');
  if (bodyClose === -1) return html;
  const updated = `${body.slice(0, bodyClose)}\n${sectionMetadataBlock('narrow')}\n${body.slice(bodyClose)}`;
  return `${parts[0]}<hr>\n${updated}${parts.slice(2).join('<hr>\n')}`;
}

function removeEmptySections(html) {
  return html.replace(/<div>\s*<\/div>\s*/g, '');
}

function ensureTemplateMetadata(html) {
  if (html.includes('>template<') || html.includes('>blog-article<')) return html;
  if (!html.includes('class="metadata"')) return html;

  const row = `    <div>
      <div>template</div>
      <div>blog-article</div>
    </div>\n`;
  return html.replace(
    /(<div class="metadata">[\s\S]*?)(<\/div>\s*<\/div>\s*)$/m,
    `$1${row}  $2`,
  );
}

function fixBlogHtml(html) {
  let out = html.trim();
  out = insertHrAfterHero(out);
  out = normalizeStyledSections(out);
  out = ensureHeroSectionMetadata(out);
  out = ensureBodyNarrowMetadata(out);
  out = removeEmptySections(out);
  out = ensureTemplateMetadata(out);
  return out;
}

function listBlogPaths() {
  const dir = join(ROOT, 'tools/importer/reports/blog');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.report.json'))
    .map((f) => `/blog/${basename(f, '.report.json')}`);
}

function daPath(path) {
  return `${path.replace(/^\//, '')}.html`;
}

async function getSource(token, path) {
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${daPath(path)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

async function putSource(token, path, body) {
  const form = new FormData();
  const file = daPath(path);
  form.append('data', new Blob([body], { type: 'text/html' }), basename(file));
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${file}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
}

const token = getToken();
if (!token) {
  console.error('No DA token. Run: aem content clone --path /');
  process.exit(1);
}

const paths = listBlogPaths();
console.log(`${DRY_RUN ? 'Dry run' : 'Fixing'} ${paths.length} blog articles…\n`);

for (const path of paths) {
  const before = await getSource(token, path);
  const after = fixBlogHtml(before);
  if (before === after) {
    console.log(`  − ${path} (unchanged)`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`  ~ ${path} (would update)`);
    continue;
  }
  await putSource(token, path, after);
  console.log(`  ✓ ${path}`);
}

console.log('\nDone. Preview pages on .aem.page and publish when ready.');
