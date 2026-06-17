#!/usr/bin/env node
/**
 * Generate a standalone performance briefing HTML page from JSON data.
 *
 * Usage:
 *   node tools/scripts/generate-performance-briefing.mjs
 *   node tools/scripts/generate-performance-briefing.mjs --input path/to/briefing.json
 *   node tools/scripts/generate-performance-briefing.mjs --output tools/analytics/reports/custom.html
 *
 * Output lives under tools/analytics/reports/ — not in the EDS block library.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBriefingHtml } from '../lib/render-briefing.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DEFAULT_INPUT = join(ROOT, 'tools/analytics/data/wknd-weekly.sample.json');
const DEFAULT_OUTPUT = join(ROOT, 'tools/analytics/reports/wknd-weekly.html');

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input' && argv[i + 1]) {
      options.input = resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--output' && argv[i + 1]) {
      options.output = resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`Usage: node tools/scripts/generate-performance-briefing.mjs [options]

Options:
  --input <path>   Briefing JSON (default: tools/analytics/data/wknd-weekly.sample.json)
  --output <path>  Output HTML (default: tools/analytics/reports/wknd-weekly.html)
`);
      process.exit(0);
    }
  }
  return options;
}

function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(input, 'utf8');
  const data = JSON.parse(raw);
  const html = renderBriefingHtml(data);

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, html, 'utf8');
  console.log(`Wrote ${output}`);
}

main();
