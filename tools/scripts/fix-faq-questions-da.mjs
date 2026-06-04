#!/usr/bin/env node
/**
 * Restore FAQ question text in DA (first accordion cell was empty after import).
 * Source: https://wknd-adventures.com/faq.html
 * Usage: node tools/scripts/fix-faq-questions-da.mjs [--dry-run]
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'znikolovski';
const SITE = 'masterclass-demo';
const SOURCE_URL = 'https://wknd-adventures.com/faq.html';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DRY_RUN = process.argv.includes('--dry-run');

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
 * @param {string} html
 */
async function scrapeFaqPairs(html) {
  const pairs = [];
  const itemRegex = /<div class="faq-item">[\s\S]*?<button class="faq-question"[^>]*>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<div class="faq-answer">([\s\S]*?)<\/div>/gi;
  let match = itemRegex.exec(html);
  while (match) {
    pairs.push({
      question: match[1].replace(/\s+/g, ' ').trim(),
      answer: match[2].replace(/\s+/g, ' ').trim(),
    });
    match = itemRegex.exec(html);
  }
  return pairs;
}

/**
 * @param {string} text
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} html
 * @param {{ question: string, answer: string }[]} pairs
 */
function repairFaqHtml(html, pairs) {
  let index = 0;
  return html.replace(
    /<div>\s*<div>\s*<\/div>\s*<div>/g,
    () => {
      const question = pairs[index]?.question;
      index += 1;
      if (!question) return '<div>\n      <div></div>\n      <div>';
      return `<div>\n      <div>${escapeHtml(question)}</div>\n      <div>`;
    },
  );
}

async function getSource(token, path) {
  const file = path === '/' ? 'index.html' : `${path.replace(/^\//, '')}.html`;
  const res = await fetch(`https://admin.da.live/source/${ORG}/${SITE}/${file}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

async function putSource(token, path, body) {
  const file = path === '/' ? 'index.html' : `${path.replace(/^\//, '')}.html`;
  const form = new FormData();
  form.append('data', new Blob([body], { type: 'text/html' }), basename(file));
  const res = await fetch(`https://admin.da.live/source/${ORG}/${SITE}/${file}`, {
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
  console.error('No valid DA token. Run: aem login');
  process.exit(1);
}

const sourceRes = await fetch(SOURCE_URL);
const sourceHtml = await sourceRes.text();
const pairs = await scrapeFaqPairs(sourceHtml);
console.log(`Scraped ${pairs.length} FAQ Q&A pairs from ${SOURCE_URL}`);

const before = await getSource(token, '/faq');
const after = repairFaqHtml(before, pairs);

if (before === after) {
  console.log('FAQ source unchanged (questions may already be present).');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('Dry run: would update /faq in DA.');
  process.exit(0);
}

await putSource(token, '/faq', after);
console.log('✓ Updated /faq with question labels in accordion rows.');
console.log('Preview https://main--masterclass-demo--znikolovski.aem.page/faq and publish when ready.');
