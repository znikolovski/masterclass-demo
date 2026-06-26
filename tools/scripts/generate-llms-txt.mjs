#!/usr/bin/env node
/**
 * Build llms.txt at the site root from the EDS query index — links to .md sources for each page.
 * Served via code sync (Config Service has no llms.txt endpoint; see robots.txt for API-managed text).
 *
 * Usage:
 *   node tools/scripts/generate-llms-txt.mjs
 *   node tools/scripts/generate-llms-txt.mjs --url=https://main--masterclass-demo--znikolovski.aem.live/query-index.json
 *   node tools/scripts/generate-llms-txt.mjs --dry-run
 *
 * @see https://llmstxt.org/
 * @see https://www.aem.live/developer/ai-coding-agents
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripWkndTitleSuffix } from '../../scripts/paths.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

const SITE_CONFIG = {
  'masterclass-demo': {
    indexUrl: 'https://main--masterclass-demo--znikolovski.aem.live/query-index.json',
    out: join(ROOT, 'llms.txt'),
    title: '# WKND Adventures',
    tagline: '> Bold Stories. Real Life. Wild Places. Structured markdown sources for WKND Adventures pages.',
    coreOrder: CORE_ORDER,
  },
  'wknd-aero': {
    indexUrl: 'https://main--wknd-aero--znikolovski.aem.live/query-index.json',
    out: join(ROOT, 'llms-aero.txt'),
    title: '# WKND Aero',
    tagline: '> Flights to adventure. Structured markdown sources for WKND Aero pages and Product Bus adventure catalog.',
    coreOrder: ['/', '/destinations', '/travel-inspiration', '/wknd-pass', '/book/flights'],
    adventurePipelineHost: 'https://main--wknd-aero--znikolovski.aem.network',
  },
};

const EXCLUDE_PREFIXES = [
  '/drafts/',
  '/fragments/',
  '/reports/',
  '/find-your-adventure/',
  '/blocks/',
  '/templates/',
  '/tools/',
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
  return stripWkndTitleSuffix(raw) || raw;
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
 * @param {object} siteCfg
 * @returns {string}
 */
function buildLlmsTxt(opts, pages, siteCfg) {
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const lines = [
    siteCfg.title,
    '',
    siteCfg.tagline,
    '',
    'Use the `.md` links below for LLM-friendly page content from Adobe Edge Delivery Services.',
    'HTML pages are available at the same paths without the `.md` suffix (homepage: `/index.md`).',
    '',
  ];

  const coreOrder = siteCfg.coreOrder || CORE_ORDER;
  const core = coreOrder
    .map((path) => byPath.get(path))
    .filter(Boolean);
  appendSection(lines, 'Core pages', core);

  if (siteCfg.adventurePipelineHost) {
    const adventures = pages
      .filter((page) => page.path.startsWith('/adventures/'))
      .map((page) => ({
        ...page,
        description: `${page.description || ''} Pipeline HTML: ${siteCfg.adventurePipelineHost}${page.path}`.trim(),
      }));
    appendSection(lines, 'Adventure catalog (Product Bus)', adventures);
  }

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
  const site = argv.find((arg) => arg.startsWith('--site='))?.slice(7) || 'masterclass-demo';
  const siteCfg = SITE_CONFIG[site] || SITE_CONFIG['masterclass-demo'];
  const url = argv.find((arg) => arg.startsWith('--url='))?.slice(6) || siteCfg.indexUrl;
  const out = argv.find((arg) => arg.startsWith('--out='))?.slice(6) || siteCfg.out;
  return { dryRun, url, out, site, siteCfg };
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

  const content = buildLlmsTxt(opts, pages, opts.siteCfg);
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
