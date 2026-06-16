#!/usr/bin/env node
/**
 * Regenerate git-hosted library preview shells from tools/sidekick snippets.
 * Does not require DA auth (unlike setup-da-library.mjs).
 */

import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import {
  basename, dirname, join, relative,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapLibraryPreviewPage } from './wrap-library-preview.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sidekickRoot = join(ROOT, 'tools/sidekick');

function walkPlainHtml(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walkPlainHtml(abs, acc);
    else if (entry.endsWith('.plain.html')) acc.push(abs);
  }
  return acc;
}

let count = 0;
for (const abs of walkPlainHtml(sidekickRoot)) {
  const rel = relative(sidekickRoot, abs);
  if (!rel.startsWith('blocks/') && !rel.startsWith('templates/')) continue;
  const daPath = rel.replace(/\.plain\.html$/, '.html');
  const fragment = readFileSync(abs, 'utf8');
  const label = basename(daPath, '.html').replace(/-/g, ' ');
  const title = `${label.charAt(0).toUpperCase()}${label.slice(1)} — Library preview`;
  const previewOptions = daPath.includes('templates/blog-article/')
    ? { bodyClasses: ['blog-article'], stylesheets: ['/styles/blog.css'] }
    : {};
  const isTemplate = daPath.startsWith('templates/');
  const blockName = !isTemplate ? basename(daPath, '.html') : undefined;
  const previewOptionsWithBlock = blockName
    ? { ...previewOptions, blockName }
    : previewOptions;

  const gitPath = join(ROOT, daPath);
  mkdirSync(dirname(gitPath), { recursive: true });
  writeFileSync(gitPath, wrapLibraryPreviewPage(title, fragment, previewOptionsWithBlock));
  writeFileSync(`${gitPath}.plain.html`, `${fragment.trim()}\n`);
  count += 1;
  console.log(`  ✓ ${daPath}`);
}

console.log(`\nRegenerated ${count} preview shell(s).`);
