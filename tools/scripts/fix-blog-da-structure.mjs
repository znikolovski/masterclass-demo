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

/**
 * Rebuilds a hero-adventure block when h1/author were split out by a bad migration.
 * @param {string} html
 */
function isHeroBlockSplit(html) {
  return /<div class="hero-adventure">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div>\s*<h1/i.test(html);
}

function repairHeroBlock(html) {
  if (!html.includes('class="hero-adventure"')) return html;
  if (!isHeroBlockSplit(html)) {
    return removeMetadataInsideHero(html);
  }

  const heroPos = html.indexOf('class="hero-adventure"');
  const hrPos = html.indexOf('<hr>', heroPos);
  if (hrPos === -1) return html;

  const sectionStart = html.lastIndexOf('<div>', Math.max(0, heroPos - 10));
  const chunk = html.slice(sectionStart, hrPos);

  const bgPicture = chunk.match(
    /<div class="hero-adventure">\s*<div>[\s\S]*?(<picture>[\s\S]*?<\/picture>)/i,
  )?.[1];
  const h1Match = chunk.match(/<h1[\s\S]*?<\/h1>/i)?.[0];
  if (!bgPicture || !h1Match) return html;

  const tagMatch = chunk.match(
    /<div class="hero-adventure">[\s\S]*?<\/div>\s*<\/div>\s*<div>\s*<div>([^<]+)<\/div>/i,
  );
  const tag = tagMatch?.[1]?.trim() || '';
  const afterH1 = chunk.slice(chunk.indexOf(h1Match) + h1Match.length);
  const authorMatch = afterH1.match(
    /<div>\s*(<picture>[\s\S]*?<\/picture>)\s*<\/div>\s*<div>([^<]+)<\/div>\s*<div>([^<]+)<\/div>/i,
  );

  const authorRows = authorMatch
    ? `<div>${authorMatch[1]}</div>
      <div>${authorMatch[2]}</div>
      <div>${authorMatch[3]}</div>`
    : '';

  const rebuilt = `<div>
  <div class="hero-adventure">
    <div>
      <div>${bgPicture}</div>
    </div>
    <div>
      <div>${tag}</div>
      <div>${h1Match}</div>
      ${authorRows}
    </div>
  </div>
${sectionMetadataBlock('hero-adventure-container')}
</div>
`;

  const tail = html.slice(hrPos).replace(/^<hr>\s*/i, '');
  return `${html.slice(0, sectionStart)}${rebuilt}\n${tail}`;
}

/**
 * Wraps loose article paragraphs in a DA section div (EDS ignores bare nodes after <hr>).
 * @param {string} html
 */
function wrapArticleBodyInSection(html) {
  let out = html.replace(/<hr>\s*/gi, '\n');

  const heroMeta = out.search(
    /<div class="section-metadata">[\s\S]*?hero-adventure-container[\s\S]*?<\/div>\s*<\/div>/i,
  );
  if (heroMeta === -1) return out;

  let start = out.indexOf('</div>', heroMeta);
  while (start !== -1) {
    start += 6;
    const ws = out.slice(start).match(/^\s*/)[0];
    start += ws.length;
    if (/^<p[\s>]/i.test(out.slice(start))) break;
    if (/^<div class="(?:secondary|inverse)">/i.test(out.slice(start))) return out;
    if (/^<div>[\s\S]*?<div class="(?:secondary|inverse)">/i.test(out.slice(start, start + 80))) {
      return out;
    }
    const nextClose = out.indexOf('</div>', start);
    if (nextClose === -1) return out;
    start = nextClose;
  }
  if (start === -1 || !/^<p[\s>]/i.test(out.slice(start))) return out;

  const rest = out.slice(start);
  const endMatch = rest.search(/<div class="(?:secondary|inverse)">/i);
  const body = (endMatch === -1 ? rest : rest.slice(0, endMatch)).trim();
  if (!body || /^<div[\s>]/i.test(body)) return out;

  if (body.includes('class="section-metadata"') && body.includes('>narrow<')) {
    return out;
  }

  const wrapped = `<div>\n${body}\n${sectionMetadataBlock('narrow')}\n</div>\n`;
  const end = endMatch === -1 ? out.length : start + endMatch;
  return out.slice(0, start) + wrapped + out.slice(end);
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

function findHeroBlockEnd(html) {
  const marker = 'class="hero-adventure"';
  const start = html.indexOf(marker);
  if (start === -1) return -1;

  const open = html.lastIndexOf('<div', start);
  let depth = 0;
  let i = open;
  while (i < html.length) {
    if (html.startsWith('<div', i)) depth += 1;
    if (html.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) return i + 6;
    }
    i += 1;
  }
  return -1;
}

function removeMetadataInsideHero(html) {
  const marker = 'class="hero-adventure"';
  const start = html.indexOf(marker);
  if (start === -1) return html;

  const open = html.lastIndexOf('<div', start);
  const end = findHeroBlockEnd(html);
  if (end === -1) return html;

  const block = html.slice(open, end);
  const cleaned = block
    .replace(/\s*<div class="section-metadata">[\s\S]*?<\/div>\s*/gi, '')
    .replace(/\s*<div>\s*<div>style<\/div>\s*<div>hero-adventure-container<\/div>\s*<\/div>\s*/gi, '');
  return html.slice(0, open) + cleaned + html.slice(end);
}

function ensureHeroSectionMetadata(html) {
  if (!html.includes('class="hero-adventure"')) return html;

  let out = removeMetadataInsideHero(html);
  if (out.includes('hero-adventure-container')) return out;

  const insertAt = findHeroBlockEnd(out);
  if (insertAt === -1) return out;

  const meta = `\n${sectionMetadataBlock('hero-adventure-container')}`;
  return `${out.slice(0, insertAt)}${meta}${out.slice(insertAt)}`;
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
  out = repairHeroBlock(out);
  out = normalizeStyledSections(out);
  if (!out.includes('hero-adventure-container')) {
    out = ensureHeroSectionMetadata(out);
  }
  out = wrapArticleBodyInSection(out);
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
