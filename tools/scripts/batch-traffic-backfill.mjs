#!/usr/bin/env node
/**
 * One-off backfill: run the live traffic simulator for each of the last N days.
 * ~10k page hits per day with a unique audience mix seed per calendar day.
 * Reuses tools/scripts/output/visitor-pool so the same virtual visitors return
 * across batch days (persisted Playwright storage / ECID).
 *
 * Note: Adobe Analytics timestamps hits at collection time. This does not
 * backdate hits into prior calendar days — it seeds segment variety and runs
 * the volume now. For true historical dates use Analytics Data Sources import.
 *
 * Usage:
 *   node tools/scripts/batch-traffic-backfill.mjs
 *   node tools/scripts/batch-traffic-backfill.mjs --days=14 --hits-per-day=10000
 *   node tools/scripts/batch-traffic-backfill.mjs --dry-run
 *   node tools/scripts/batch-traffic-backfill.mjs --skip-today-run
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIMULATOR = join(__dirname, 'simulate-live-audience-traffic.mjs');

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = {
    days: 14,
    hitsPerDay: 10000,
    concurrency: 6,
    dryRun: false,
    skipTodayRun: false,
    outDir: join(__dirname, 'output'),
  };
  argv.forEach((arg) => {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--skip-today-run') opts.skipTodayRun = true;
    else if (arg.startsWith('--days=')) opts.days = Math.max(1, parseInt(arg.slice(7), 10) || 14);
    else if (arg.startsWith('--hits-per-day=')) {
      opts.hitsPerDay = Math.max(1, parseInt(arg.slice(15), 10) || 10000);
    } else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = Math.min(8, Math.max(1, parseInt(arg.slice(14), 10) || 6));
    } else if (arg.startsWith('--out-dir=')) opts.outDir = arg.slice(10);
  });
  return opts;
}

/**
 * @param {Date} date
 */
function localDateParts(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return { y, m, d, label: `${y}-${m}-${d}` };
}

/**
 * @param {Date} date
 */
function dateSeed(date) {
  const { y, m, d } = localDateParts(date);
  return parseInt(`${y}${m}${d}`, 10);
}

/**
 * @param {string[]} args
 * @param {boolean} dryRun
 */
function runSimulator(args, dryRun) {
  const fullArgs = dryRun ? [...args, '--dry-run'] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SIMULATOR, ...fullArgs], {
      stdio: 'inherit',
      cwd: join(__dirname, '../..'),
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Simulator exited with code ${code}`));
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(opts.outDir, { recursive: true });

  const plan = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Prior N calendar days only (excludes today — today is a separate final run).
  for (let offset = opts.days; offset >= 1; offset -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    plan.push({
      label: localDateParts(day).label,
      seed: dateSeed(day),
      role: 'backfill',
    });
  }

  const visitorPoolDir = join(opts.outDir, 'visitor-pool');

  const batchMeta = {
    startedAt: new Date().toISOString(),
    days: opts.days,
    hitsPerDay: opts.hitsPerDay,
    totalHits: opts.days * opts.hitsPerDay + (opts.skipTodayRun ? 0 : opts.hitsPerDay),
    concurrency: opts.concurrency,
    dryRun: opts.dryRun,
    visitorPoolDir,
    plan,
  };

  console.log('WKND traffic backfill (batch)');
  console.log(`  Days:           ${opts.days}`);
  console.log(`  Hits per day:   ${opts.hitsPerDay}`);
  console.log(`  Backfill hits:  ${opts.days * opts.hitsPerDay}`);
  console.log(`  + today run:    ${opts.skipTodayRun ? 0 : opts.hitsPerDay}`);
  console.log(`  Total hits:     ${batchMeta.totalHits}`);
  console.log(`  Concurrency:    ${opts.concurrency}`);
  console.log(`  Visitor pool:   ${visitorPoolDir} (shared across days)`);
  console.log(`  Dry run:        ${opts.dryRun}`);
  plan.forEach(({ label, seed }) => {
    console.log(`    ${label}  seed=${seed}`);
  });

  const planPath = join(opts.outDir, `traffic-backfill-plan-${Date.now()}.json`);
  writeFileSync(planPath, JSON.stringify(batchMeta, null, 2));
  console.log(`  Plan saved:     ${planPath}\n`);

  const results = [];
  const batchStarted = Date.now();

  for (let i = 0; i < plan.length; i += 1) {
    const { label, seed } = plan[i];
    console.log(`\n========== Day ${i + 1}/${plan.length}: ${label} (seed ${seed}) ==========\n`);
    const dayStarted = Date.now();
    try {
      await runSimulator([
        `--hits=${opts.hitsPerDay}`,
        `--seed=${seed}`,
        `--concurrency=${opts.concurrency}`,
        `--out-dir=${opts.outDir}`,
        `--visitor-pool-dir=${visitorPoolDir}`,
        '--from-index',
      ], opts.dryRun);
      results.push({
        label, seed, ok: true, durationSec: Math.round((Date.now() - dayStarted) / 1000),
      });
    } catch (err) {
      results.push({
        label, seed, ok: false, error: err.message, durationSec: Math.round((Date.now() - dayStarted) / 1000),
      });
      throw err;
    }
  }

  if (!opts.skipTodayRun && !opts.dryRun) {
    const todaySeed = Date.now();
    console.log(`\n========== Final run: today (seed ${todaySeed}) ==========\n`);
    const todayStarted = Date.now();
    await runSimulator([
      `--hits=${opts.hitsPerDay}`,
      `--seed=${todaySeed}`,
      `--concurrency=${opts.concurrency}`,
      `--out-dir=${opts.outDir}`,
      `--visitor-pool-dir=${visitorPoolDir}`,
      '--from-index',
    ], false);
    results.push({
      label: localDateParts(today).label,
      seed: todaySeed,
      ok: true,
      durationSec: Math.round((Date.now() - todayStarted) / 1000),
    });
  }

  const summary = {
    ...batchMeta,
    finishedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - batchStarted) / 1000),
    results,
    extraTodayRun: !opts.skipTodayRun && !opts.dryRun,
  };
  const summaryPath = join(opts.outDir, `traffic-backfill-${Date.now()}.json`);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\nBackfill complete.');
  console.log(`  Duration: ${summary.durationSec}s`);
  console.log(`  Summary:  ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
