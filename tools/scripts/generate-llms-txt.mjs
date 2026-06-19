#!/usr/bin/env node
/**
 * Build config/llms.txt from the EDS query index — links to .md sources for each page.
 *
 * Usage:
 *   node tools/scripts/generate-llms-txt.mjs
 *   node tools/scripts/generate-llms-txt.mjs --url=https://main--masterclass-demo--znikolovski.aem.live/query-index.json
 *   node tools/scripts/generate-llms-txt.mjs --dry-run
 *
 * @see https://llmstxt.org/
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_INDEX_URL = 'https://main--masterclass-demo--znikolovski.aem.live/query-index.json';
const DEFAULT_OUT = join(ROOT, 'config/llms.txt');

const EXCLUDE_PREFIXES = [
  '/drafts/',
  '/fragments/',
  '/reports/',
  '/find-your-adventure/',
  '/blocks/',
  '/templates/',
  '/tools/',
];

const CORE_ORDER = [
  '/',
  '/adventures',
  '/destinations',
  '/field-notes',
  '/about',
  '/community',
  '/gear',
  '/expeditions',
  '/basecamp',
  '/sustainability',
  '/faq',
];

/**
 * @param {string} path
 * @returns {boolean}
 */
function shouldExclude(path) {
  return EXCLUDE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * @param {string} path
 * @returns {string}
 */
function toMarkdownPath(path) {
  const normalized = path.replace(/\/$/, '') || '/';
  return normalized === '/' ? '/index.md' : `${normalized}.md`;
}

/**
 * @param {string} title
 * @param {string} path
 * @returns {string}
 */
function cleanTitle(title, path) {
  const raw = (title || '').trim();
  if (!raw) return path === '/' ? 'Homepage' : path.split('/').filter(Boolean).pop() || path;
  return raw.replace(/\s*—\s*WKND Adventures\s*$/i, '').trim() || raw;
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeNote(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {{ path: string, title?: string, description?: string }} item
 * @returns {string}
 */
function formatLink(item) {
  const label = cleanTitle(item.title, item.path);
  const md = toMarkdownPath(item.path);
  const note = escapeNote(item.description);
  return note ? `- [${label}](${md}): ${note}` : `- [${label}](${md})`;
}

/**
 * @param {string[]} lines
 * @param {string} heading
 * @param {Array<{ path: string, title?: string, description?: string }>} items
 */
function appendSection(lines, heading, items) {
  if (!items.length) return;
  lines.push(`## ${heading}`, '');
  items.forEach((item) => lines.push(formatLink(item)));
  lines.push('');
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {Array<{ path: string, title?: string, description?: string }>} pages
 * @returns {string}
 */
function buildLlmsTxt(opts, pages) {
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const lines = [
    '# WKND Adventures',
    '',
    '> Bold Stories. Real Life. Wild Places. Structured markdown sources for WKND Adventures pages.',
    '',
    'Use the `.md` links below for LLM-friendly page content from Adobe Edge Delivery Services.',
    'HTML pages are available at the same paths without the `.md` suffix (homepage: `/index.md`).',
    '',
  ];

  const core = CORE_ORDER
    .map((path) => byPath.get(path))
    .filter(Boolean);
  appendSection(lines, 'Core pages', core);

  const blog = pages
    .filter((page) => page.path.startsWith('/blog/'))
    .sort((a, b) => cleanTitle(a.title, a.path).localeCompare(cleanTitle(b.title, b.path)));
  appendSection(lines, 'Blog articles', blog);

  const forms = pages
    .filter((page) => page.path.startsWith('/forms/'))
    .sort((a, b) => a.path.localeCompare(b.path));
  const optional = pages
    .filter((page) => page.path === '/nav' || page.path === '/footer')
    .concat(forms);
  appendSection(lines, 'Optional', optional);

  return `${lines.join('\n').trim()}\n`;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const url = argv.find((arg) => arg.startsWith('--url='))?.slice(6) || DEFAULT_INDEX_URL;
  const out = argv.find((arg) => arg.startsWith('--out='))?.slice(6) || DEFAULT_OUT;
  return { dryRun, url, out };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const res = await fetch(opts.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch query index (${res.status}): ${opts.url}`);
  }

  const payload = await res.json();
  const pages = (payload.data || [])
    .filter((item) => item.path && !shouldExclude(item.path))
    .map((item) => ({
      path: item.path,
      title: item.title,
      description: item.description,
    }));

  const content = buildLlmsTxt(opts, pages);
  if (opts.dryRun) {
    process.stdout.write(content);
    return;
  }

  writeFileSync(opts.out, content, 'utf8');
  console.log(`Wrote ${opts.out} (${pages.length} pages)`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
