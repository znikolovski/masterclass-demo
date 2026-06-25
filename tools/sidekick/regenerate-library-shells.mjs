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
import { wrapLibraryPreviewPage, getPreviewOptionsForDaPath } from './wrap-library-preview.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sidekickRoot = join(ROOT, 'tools/sidekick');

/** Blocks authored in-repo (not tools/sidekick snippets) that still need library shells. */
const REPO_BLOCK_PREVIEWS = [
  'blocks/form/form.html',
  'blocks/adventure-quiz/adventure-quiz.html',
  'blocks/quiz-results/quiz-results.html',
  'blocks/embed-adaptive-form/embed-adaptive-form.html',
  'blocks/business-register/business-register.html',
  'blocks/business-login/business-login.html',
  'blocks/business-dashboard/business-dashboard.html',
];

function isFullPreviewDocument(html) {
  return /<!DOCTYPE html>/i.test(html) || /<html[\s>]/i.test(html);
}

function extractLibraryFragment(html) {
  const mainMatch = html.match(/<main>([\s\S]*)<\/main>/i);
  if (mainMatch) return mainMatch[1].trim();
  if (isFullPreviewDocument(html)) return null;
  return html.trim();
}

function writePreviewShell(daPath, fragment) {
  const label = basename(daPath, '.html').replace(/-/g, ' ');
  const title = `${label.charAt(0).toUpperCase()}${label.slice(1)} — Library preview`;
  const previewOptions = getPreviewOptionsForDaPath(daPath);
  const gitPath = join(ROOT, daPath);
  mkdirSync(dirname(gitPath), { recursive: true });
  writeFileSync(
    gitPath,
    wrapLibraryPreviewPage(title, fragment, previewOptions),
  );
  writeFileSync(`${gitPath}.plain.html`, `${fragment.trim()}\n`);
}

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
    ? { bodyClasses: ['blog-article'], stylesheets: ['/styles/blog.css'], ...getPreviewOptionsForDaPath(daPath) }
    : getPreviewOptionsForDaPath(daPath);

  const isTemplate = daPath.startsWith('templates/');
  const previewOptionsWithBlock = isTemplate
    ? previewOptions
    : previewOptions;

  const gitPath = join(ROOT, daPath);
  mkdirSync(dirname(gitPath), { recursive: true });
  writeFileSync(gitPath, wrapLibraryPreviewPage(title, fragment, previewOptionsWithBlock));
  writeFileSync(`${gitPath}.plain.html`, `${fragment.trim()}\n`);
  count += 1;
  console.log(`  ✓ ${daPath}`);
}

for (const rel of REPO_BLOCK_PREVIEWS) {
  const abs = join(ROOT, rel);
  const plainPath = `${abs}.plain.html`;
  if (!existsSync(abs) && !existsSync(plainPath)) continue;

  let fragment = null;
  if (existsSync(plainPath)) {
    fragment = readFileSync(plainPath, 'utf8').trim();
  } else if (existsSync(abs)) {
    fragment = extractLibraryFragment(readFileSync(abs, 'utf8'));
  }
  if (!fragment) continue;

  writePreviewShell(rel, fragment);
  count += 1;
  console.log(`  ✓ ${rel} (repo block)`);
}

console.log(`\nRegenerated ${count} preview shell(s).`);
