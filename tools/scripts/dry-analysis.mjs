#!/usr/bin/env node
/**
 * DRY analysis for pull requests — flags duplicated utilities and suggests shared modules.
 * Report is ephemeral: stdout locally, CI posts to the PR comment and job summary (not committed).
 *
 * Usage:
 *   npm run dry:analysis
 *   npm run dry:analysis -- --base=main
 *   node tools/scripts/dry-analysis.mjs --output=dry-report.md
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const ANTIPATTERN_GUIDE = [
  { id: 'local-isSafePath', severity: 'error', description: 'Block-local `function isSafePath`' },
  { id: 'inline-wknd-title-strip', severity: 'warn', description: 'Inline `— WKND Adventures` regex' },
  { id: 'local-carousel-slide-wrap', severity: 'warn', description: 'Manual carousel slide index wrap logic' },
  { id: 'duplicate-index-fetch', severity: 'warn', description: 'Inline Helix index fetch + `json.data` parsing' },
];

const SHARED_MODULES = [
  {
    path: 'scripts/paths.js',
    exports: ['isSafePath', 'stripWkndTitleSuffix', 'buildPathWithQueryParam'],
    purpose: 'Safe internal paths and WKND title normalization',
  },
  {
    path: 'scripts/index.js',
    exports: ['fetchHelixIndex', 'helixIndexPath'],
    purpose: 'Helix query index fetch helpers',
  },
  {
    path: 'scripts/carousel.js',
    exports: [
      'normalizeSlideIndex',
      'updateCarouselSlide',
      'showCarouselSlide',
      'bindCarouselNavigation',
      'bindCarouselScrollSync',
    ],
    purpose: 'Horizontal carousel slide a11y, nav, and scroll sync',
  },
  {
    path: 'scripts/adventure-links.js',
    exports: ['buildAdventureUrl', 'createAdventureCta', 'createAdventureImage'],
    purpose: 'Adventure CTAs with cid analytics attribution',
  },
  {
    path: 'scripts/analytics-acdl.js',
    exports: ['pushInteractionEvent', 'pushCarouselChange'],
    purpose: 'Adobe Client Data Layer interaction events',
  },
  {
    path: 'scripts/media.js',
    exports: ['createResponsivePicture'],
    purpose: 'Responsive images and hero media',
  },
];

const ANTIPATTERNS = [
  {
    id: 'local-isSafePath',
    label: 'Local isSafePath implementation',
    pattern: /function\s+isSafePath\s*\(/,
    fix: 'Import isSafePath from scripts/paths.js',
    severity: 'error',
  },
  {
    id: 'inline-wknd-title-strip',
    label: 'Inline WKND title suffix regex',
    pattern: /replace\(\/\\s\+—\\s\+WKND Adventures\\s\*\$\/i/,
    fix: 'Import stripWkndTitleSuffix from scripts/paths.js',
    severity: 'warn',
  },
  {
    id: 'local-carousel-slide-wrap',
    label: 'Local carousel slide index wrap logic',
    pattern: /if\s*\(\s*index\s*<\s*0\s*\)\s*index\s*=\s*slides\.length\s*-\s*1/,
    fix: 'Use normalizeSlideIndex or scripts/carousel.js helpers',
    severity: 'warn',
  },
  {
    id: 'duplicate-index-fetch',
    label: 'Inline Helix index fetch boilerplate',
    pattern: /await\s+fetch\([^)]*index\.json[^)]*\)[\s\S]{0,120}json\?\.data/,
    fix: 'Use fetchHelixIndex from scripts/index.js',
    severity: 'warn',
  },
];

/**
 * @param {string} base
 * @returns {string[]}
 */
function getChangedFiles(base) {
  try {
    const committed = execSync(`git diff --name-only --diff-filter=ACMRT ${base}...HEAD`, {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    const working = execSync(`git diff --name-only --diff-filter=ACMRT ${base}`, {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    const files = [...committed.split('\n'), ...working.split('\n')]
      .map((file) => file.trim())
      .filter(Boolean);
    return [...new Set(files)].filter((file) => /\.(js|mjs)$/.test(file));
  } catch {
    return [];
  }
}

/**
 * @param {string} file
 * @param {object} rule
 * @returns {number[]}
 */
function findPatternLines(file, rule) {
  const abs = join(ROOT, file);
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  if (rule.id === 'local-isSafePath' && content.includes("from '../../scripts/paths.js'")) {
    return [];
  }
  if (rule.id === 'local-isSafePath' && content.includes("from '../../../scripts/paths.js'")) {
    return [];
  }
  const lines = content.split('\n');
  return lines
    .map((line, idx) => (rule.pattern.test(line) ? idx + 1 : 0))
    .filter(Boolean);
}

/**
 * @param {string[]} files
 * @returns {object[]}
 */
function analyzeFiles(files) {
  const findings = [];
  files.forEach((file) => {
    ANTIPATTERNS.forEach((rule) => {
      const lines = findPatternLines(file, rule);
      if (lines.length === 0) return;
      findings.push({
        file,
        ...rule,
        lines,
      });
    });
  });
  return findings;
}

/**
 * @param {string[]} files
 * @param {object[]} findings
 * @returns {string}
 */
function renderReport(files, findings) {
  const rel = (file) => relative(ROOT, join(ROOT, file));
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warn');
  let status = 'PASS';
  if (errors.length > 0) status = 'FAIL';
  else if (warnings.length > 0) status = 'WARN';

  let md = '# DRY Analysis Report\n\n';
  md += `**Status:** ${status}\n\n`;
  md += `- Base comparison: \`${process.env.DRY_BASE || 'main'}\`\n`;
  md += `- JS files reviewed: ${files.length}\n`;
  md += `- Findings: ${findings.length} (${errors.length} error, ${warnings.length} warn)\n\n`;

  if (files.length === 0) {
    md += 'No JavaScript changes detected in this diff.\n';
    return md;
  }

  md += '## Changed files\n\n';
  files.forEach((file) => {
    md += `- \`${rel(file)}\`\n`;
  });
  md += '\n';

  if (findings.length > 0) {
    md += '## Findings\n\n';
    findings.forEach((finding) => {
      const icon = finding.severity === 'error' ? '❌' : '⚠️';
      md += `### ${icon} ${finding.label}\n\n`;
      md += `- **File:** \`${rel(finding.file)}\`\n`;
      md += `- **Lines:** ${finding.lines.join(', ')}\n`;
      md += `- **Fix:** ${finding.fix}\n\n`;
    });
  } else {
    md += '## Findings\n\nNo known duplication anti-patterns detected.\n\n';
  }

  md += '## Shared utilities catalog\n\n';
  md += 'Prefer these modules before adding block-local copies:\n\n';
  SHARED_MODULES.forEach((mod) => {
    md += `- \`${mod.path}\` — ${mod.purpose}\n`;
    md += `  - exports: ${mod.exports.join(', ')}\n`;
  });

  md += '\n## PR checklist\n\n';
  md += '- [ ] Data has a single source of truth (metadata/index, not duplicated in blocks)\n';
  md += '- [ ] Path validation uses `scripts/paths.js`\n';
  md += '- [ ] Index fetch uses `scripts/index.js`\n';
  md += '- [ ] Carousel behavior uses `scripts/carousel.js` when applicable\n';
  md += '- [ ] Analytics uses `scripts/analytics-acdl.js`\n';
  md += '- [ ] Block-specific UI duplication is justified in PR notes\n\n';

  md += '## Anti-patterns checked\n\n';
  md += '| ID | Severity | Description |\n';
  md += '|----|----------|-------------|\n';
  ANTIPATTERN_GUIDE.forEach(({ id, severity, description }) => {
    md += `| \`${id}\` | ${severity} | ${description} |\n`;
  });
  md += '\n**Errors fail CI.** Warnings are advisory — note intentional duplication in the PR.\n\n';

  md += '## Data-layer DRY (manual review)\n\n';
  md += '- Geo coordinates: page metadata → `helix-query.yaml` index → blocks (never duplicate pins in block content)\n';
  md += '- Analytics `cid`: shared URL helpers → eVar1 via existing page analytics\n';
  md += '- Seed scripts may duplicate metadata until authors own production content\n\n';

  md += '## Workflow\n\n';
  md += '1. Run `npm run dry:analysis` locally and fix **error** findings\n';
  md += '2. Open a PR — CI posts this report to the PR (updated on each push)\n';
  md += '3. Copy status + notes into the **DRY analysis** section if needed\n';
  md += '4. When adding shared utilities: extract to `scripts/`, update catalog in `tools/scripts/dry-analysis.mjs`\n\n';
  md += '_This report is generated at PR time and is not stored in the repository._\n';

  return md;
}

/**
 * @param {string} arg
 * @returns {string|null}
 */
function readArg(arg) {
  const idx = process.argv.indexOf(arg);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function main() {
  const base = readArg('--base') || 'main';
  const output = readArg('--output');
  process.env.DRY_BASE = base;

  let files = getChangedFiles(base);
  if (files.length === 0) {
    files = ['blocks', 'scripts']
      .flatMap((dir) => {
        try {
          const out = execSync(`git ls-files '${dir}/**/*.{js,mjs}'`, {
            cwd: ROOT,
            encoding: 'utf8',
          }).trim();
          return out ? out.split('\n') : [];
        } catch {
          return [];
        }
      });
  }

  const scoped = files.filter((file) => (
    file.startsWith('blocks/')
    || file.startsWith('scripts/')
    || file.startsWith('tools/scripts/')
  ));

  const findings = analyzeFiles(scoped);
  const report = renderReport(scoped, findings);

  if (output) {
    writeFileSync(join(ROOT, output), report, 'utf8');
    console.log(`Wrote ${output}`);
  } else {
    console.log(report);
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  if (errors > 0) process.exit(1);
}

main();
