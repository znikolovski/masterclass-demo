#!/usr/bin/env node
/**
 * Vendors the pinned Adobe Commerce storefront drop-ins into scripts/__dropins__
 * (Edge Delivery serves code straight from git — there is no runtime build step).
 * Mirrors hlxsites/aem-boilerplate-commerce postinstall.js, minus types/source maps.
 *
 *   npm run install:dropins
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { dependencies } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const target = path.join(root, 'scripts', '__dropins__');
const source = path.join(root, 'node_modules', '@dropins');

const pinned = Object.keys(dependencies).filter((d) => d.startsWith('@dropins/'));
const mismatches = pinned.map((pkg) => {
  const installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  const expected = lock.packages[`node_modules/${pkg}`]?.version;
  return installed !== expected ? `${pkg}: installed ${installed}, lock ${expected}` : null;
}).filter(Boolean);
if (mismatches.length) {
  console.error(`Drop-in version mismatch — run "npm ci":\n  ${mismatches.join('\n  ')}`);
  process.exit(1);
}

const skip = (src) => /\.d\.ts$|\.map$|package\.json$|CHANGELOG\.md$|README\.md$/.test(src);
fs.rmSync(target, { recursive: true, force: true });
pinned.forEach((pkg) => {
  const name = pkg.replace('@dropins/', '');
  fs.cpSync(path.join(source, name), path.join(target, name), {
    recursive: true,
    filter: (src) => fs.statSync(src).isDirectory() || !skip(src),
  });
});

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`Vendored ${pinned.length} drop-ins → scripts/__dropins__ (${(size(target) / 1048576).toFixed(1)} MB)`);
