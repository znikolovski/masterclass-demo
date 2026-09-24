#!/usr/bin/env node
/**
 * Simulate AI crawler/bot traffic against production (.aem.live) for LLM-visibility demos.
 *
 * AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) do NOT execute JavaScript, so the
 * Web SDK never fires and these hits do NOT appear in Adobe Analytics. This script drives
 * plain HTTP requests (no browser) with AI-bot User-Agents to generate realistic
 * CDN/edge access-log traffic — the only place crawler activity is observable.
 * See docs/LLM-TRAFFIC-TRACKING-PLAN.md for how to report on it (edge logs / LLM Optimizer).
 *
 * Each run visits a sample of query-index pages plus /robots.txt and /llms.txt per bot.
 *
 * Examples:
 *   node tools/scripts/simulate-ai-crawler-traffic.mjs --dry-run
 *   node tools/scripts/simulate-ai-crawler-traffic.mjs --pages=40 --concurrency=4
 *   node tools/scripts/simulate-ai-crawler-traffic.mjs --bots=GPTBot,ClaudeBot,PerplexityBot
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchQueryIndex } from './lib/site-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_BASE = 'https://main--masterclass-demo--znikolovski.aem.live';
const DEFAULT_PAGES = 30;
const DEFAULT_CONCURRENCY = 3;

/** Representative AI-crawler User-Agent strings (as sent by each vendor's bot). */
const AI_BOTS = {
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  ClaudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com',
  PerplexityBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot',
  'Google-Extended': 'Mozilla/5.0 (compatible; Google-Extended/1.0; +https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)',
  CCBot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  'meta-externalagent': 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  'Applebot-Extended': 'Mozilla/5.0 (compatible; Applebot-Extended/0.1; +http://www.apple.com/go/applebot)',
};

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = {
    base: DEFAULT_BASE,
    pages: DEFAULT_PAGES,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    bots: Object.keys(AI_BOTS),
    outDir: join(__dirname, 'output'),
  };
  argv.forEach((arg) => {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--base=')) opts.base = arg.slice(7);
    else if (arg.startsWith('--pages=')) opts.pages = Math.max(1, parseInt(arg.slice(8), 10) || DEFAULT_PAGES);
    else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = Math.min(8, Math.max(1, parseInt(arg.slice(14), 10) || DEFAULT_CONCURRENCY));
    } else if (arg.startsWith('--out-dir=')) opts.outDir = arg.slice(10);
    else if (arg.startsWith('--bots=')) {
      const requested = arg.slice(7).split(',').map((b) => b.trim());
      const valid = requested.filter((b) => AI_BOTS[b]);
      if (valid.length) opts.bots = valid;
    }
  });
  return opts;
}

/** @param {string} base */
function assertLiveOrigin(base) {
  const url = new URL(base);
  if (!url.hostname.endsWith('.aem.live') && !url.hostname.endsWith('.aem.network')) {
    throw new Error(`Refusing non-production host "${url.hostname}". Use an *.aem.live or *.aem.network URL.`);
  }
  return url.origin;
}

/**
 * @param {string} origin
 * @param {string} path
 * @param {string} botName
 * @param {string} userAgent
 */
async function crawl(origin, path, botName, userAgent) {
  const url = `${origin}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,text/plain,*/*' },
      redirect: 'follow',
    });
    // Drain the body so the request completes like a real crawl fetch.
    await res.text();
    return {
      bot: botName, path, status: res.status, ms: Date.now() - started,
    };
  } catch (err) {
    return {
      bot: botName, path, status: 0, error: err.message, ms: Date.now() - started,
    };
  }
}

/**
 * @param {{ bot: string, path: string }[]} queue
 * @param {string} origin
 * @param {number} concurrency
 * @param {(result: object) => void} onResult
 */
async function runQueue(queue, origin, concurrency, onResult) {
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= queue.length) break;
      const { bot, path } = queue[index];
      onResult(await crawl(origin, path, bot, AI_BOTS[bot]));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const origin = assertLiveOrigin(opts.base);
  mkdirSync(opts.outDir, { recursive: true });

  const index = await fetchQueryIndex(origin);
  const pagePaths = index.paths.slice(0, opts.pages);
  // Every crawler also pulls the AI-discovery files.
  const commonPaths = ['/robots.txt', '/llms.txt'];

  const queue = [];
  opts.bots.forEach((bot) => {
    [...commonPaths, ...pagePaths].forEach((path) => queue.push({ bot, path }));
  });

  console.log('WKND AI crawler traffic simulator');
  console.log(`  Origin:       ${origin}`);
  console.log(`  Site index:   ${index.pathCount} paths (crawling first ${pagePaths.length})`);
  console.log(`  Bots:         ${opts.bots.join(', ')}`);
  console.log(`  Requests:     ${queue.length} (${opts.bots.length} bots × ${commonPaths.length + pagePaths.length} paths)`);
  console.log(`  Concurrency:  ${opts.concurrency}`);
  console.log('  NOTE: crawler hits are edge-log only — they do NOT appear in Adobe Analytics.');

  if (opts.dryRun) {
    console.log('\nDry run — no requests sent.');
    return;
  }

  const results = [];
  const started = Date.now();
  const perBot = {};
  await runQueue(queue, origin, opts.concurrency, (result) => {
    results.push(result);
    perBot[result.bot] = perBot[result.bot] || { requests: 0, ok: 0, errors: 0 };
    perBot[result.bot].requests += 1;
    if (result.status >= 200 && result.status < 400) perBot[result.bot].ok += 1;
    else perBot[result.bot].errors += 1;
    if (results.length % 25 === 0) {
      console.log(`  Progress: ${results.length}/${queue.length} requests`);
    }
  });

  const summary = {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    origin,
    bots: opts.bots,
    pagesCrawled: pagePaths.length,
    commonPaths,
    totalRequests: results.length,
    perBot,
    durationSec: Math.round((Date.now() - started) / 1000),
  };
  const summaryPath = join(opts.outDir, `ai-crawler-run-${started}.json`);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\nDone.');
  Object.entries(perBot).forEach(([bot, stats]) => {
    console.log(`  ${bot.padEnd(20)} ${stats.ok}/${stats.requests} ok, ${stats.errors} errors`);
  });
  console.log(`  Duration: ${summary.durationSec}s`);
  console.log(`  Summary:  ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
