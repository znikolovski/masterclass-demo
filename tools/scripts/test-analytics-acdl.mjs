#!/usr/bin/env node
/**
 * Browser validation for ACDL page context + interaction events.
 * Run: node tools/scripts/test-analytics-acdl.mjs [--base=https://...]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1]
  || 'https://main--masterclass-demo--znikolovski.aem.page';
const SESSION = 'eds1';
const MARTECH_WAIT_MS = 10000;

const results = [];

function cli(args) {
  const r = spawnSync('playwright-cli', ['-s', SESSION, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function evalPage(body) {
  const wrapped = `async () => { ${body} }`;
  const { code: exit, stdout, stderr } = cli(['eval', '--raw', wrapped]);
  const text = (stdout + stderr).trim();
  const jsonLine = text.split('\n').find((line) => line.startsWith('{') || line.startsWith('['));
  try {
    let parsed = JSON.parse(jsonLine || text);
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        /* keep string */
      }
    }
    return parsed;
  } catch {
    return { parseError: true, raw: text.slice(0, 800), exit };
  }
}

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}`);
  if (detail) console.log(`       ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}

function closeAll() {
  spawnSync('playwright-cli', ['close-all'], { encoding: 'utf8' });
}

async function waitMartech() {
  return evalPage(`await new Promise((r) => setTimeout(r, ${MARTECH_WAIT_MS})); return JSON.stringify('ok');`);
}

function readPageState() {
  return evalPage(`
    const dl = window.adobeDataLayer;
    const page = dl?.getState ? dl.getState('page') : (Array.isArray(dl) ? dl.filter((x) => x.page).pop()?.page : null);
    return JSON.stringify(page || null);
  `);
}

async function run() {
closeAll();
const open = cli(['open', `${BASE}/`]);
if (open.code !== 0) {
  console.error('Failed to open browser:', open.stderr || open.stdout);
  process.exit(1);
}

// --- Page context (homepage) ---
await waitMartech();
const page = readPageState();
const pageOk = page
  && String(page.adventureCategory).trim() === 'general-outdoor'
  && String(page.journeyStage).trim() === 'inspiration';
record('Page context on homepage', pageOk, page);

if (BASE.includes('aem.page') || BASE.includes('aem.live') || BASE.includes('aem.network')) {
  const launch = evalPage(`
    const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
    const launchScript = scripts.find((src) => src.includes('adobedtm.com') && src.includes('launch'));
    const satellite = typeof window._satellite !== 'undefined';
    return JSON.stringify({
      launchLoaded: satellite || !!launchScript,
      satellite,
      launchScript: launchScript || null,
    });
  `);
  record('Launch embed loaded (delayed)', launch?.launchLoaded === true, launch);
}

// --- Carousel (homepage or first page with hero carousel) ---
cli(['goto', `${BASE}/`]);
await waitMartech();
let carouselEvents = [];
let lastCarouselAttempt = null;
const carouselPaths = ['/', '/destinations', '/adventures', '/field-notes', '/blog/yosemite-rock-climbing'];
for (const path of carouselPaths) {
  if (carouselEvents.length) break;
  cli(['goto', `${BASE}${path === '/' ? '' : path}`]);
  await waitMartech();
  const carouselClick = evalPage(`
    await new Promise((r) => setTimeout(r, 1500));
    const btn = document.querySelector('.carousel-hero .slide-next, .carousel-blog .slide-next');
    if (!btn) return JSON.stringify({ error: 'no carousel control', path: '${path}' });
    const lenBefore = (window.adobeDataLayer || []).length;
    btn.click();
    await new Promise((r) => setTimeout(r, 2500));
    const dl = window.adobeDataLayer || [];
    const newItems = dl.slice(lenBefore).filter((x) => x.event === 'carouselChange');
    return JSON.stringify({ path: '${path}', newItems });
  `);
  lastCarouselAttempt = carouselClick;
  if (carouselClick?.newItems?.length) carouselEvents = carouselClick.newItems;
}
if (!carouselEvents.length) {
  cli(['goto', 'http://localhost:3000/drafts/carousel-blog-test']);
  await waitMartech();
  const localCarousel = evalPage(`
    await new Promise((r) => setTimeout(r, 1500));
    const btn = document.querySelector('.carousel-blog .slide-next');
    if (!btn) return JSON.stringify({ error: 'no carousel on local draft' });
    const lenBefore = (window.adobeDataLayer || []).length;
    btn.click();
    await new Promise((r) => setTimeout(r, 2500));
    const dl = window.adobeDataLayer || [];
    return JSON.stringify(dl.slice(lenBefore).filter((x) => x.event === 'carouselChange'));
  `);
  if (Array.isArray(localCarousel) && localCarousel.length) {
    carouselEvents = localCarousel;
    lastCarouselAttempt = { path: '/drafts/carousel-blog-test (local)', newItems: localCarousel };
  }
}
record(
  'carouselChange event',
  carouselEvents.length > 0 && carouselEvents[0]?.interaction?.label === 'carousel-change',
  carouselEvents[0] || lastCarouselAttempt,
);

// --- FAQ ---
cli(['goto', `${BASE}/faq`]);
await waitMartech();
const faqResult = evalPage(`
  const summary = document.querySelector('.accordion-faq-item summary, summary.accordion-faq-item-label');
  if (!summary) return JSON.stringify({ error: 'no faq summary' });
  const lenBefore = (window.adobeDataLayer || []).length;
  summary.click();
  await new Promise((r) => setTimeout(r, 500));
  const dl = window.adobeDataLayer || [];
  const items = dl.slice(lenBefore).filter((x) => x.event === 'faqExpand');
  return JSON.stringify(items);
`);
record(
  'faqExpand event',
  Array.isArray(faqResult) && faqResult.length > 0 && faqResult[0]?.interaction?.block === 'accordion-faq',
  faqResult?.[0] || faqResult,
);

// --- Tabs ---
cli(['goto', `${BASE}/blog/yosemite-rock-climbing`]);
await waitMartech();
const tabResult = evalPage(`
  const tabs = [...document.querySelectorAll('.tabs-activity-tab')];
  if (!tabs.length) return JSON.stringify({ error: 'no tabs', count: 0 });
  const lenBefore = (window.adobeDataLayer || []).length;
  tabs[tabs.length > 1 ? 1 : 0].click();
  await new Promise((r) => setTimeout(r, 500));
  const dl = window.adobeDataLayer || [];
  const items = dl.slice(lenBefore).filter((x) => x.event === 'tabSelect');
  return JSON.stringify(items);
`);
record(
  'tabSelect event',
  Array.isArray(tabResult) && tabResult.length > 0 && tabResult[0]?.interaction?.block === 'tabs-activity',
  tabResult?.[0] || tabResult,
);

// --- YouTube (local draft; code is local, content path is stable) ---
const ytBase = 'http://localhost:3000';
cli(['goto', `${ytBase}/drafts/youtube-video-test`]);
await waitMartech();
const ytResult = evalPage(`
  const player = document.querySelector('.youtube-video-player iframe, .youtube-video-embed iframe');
  if (!player) return JSON.stringify({ error: 'no youtube player', hasBlock: !!document.querySelector('.youtube-video') });
  return JSON.stringify({ hasPlayer: true, playerId: player.id || player.parentElement?.id });
`);
record(
  'youtube-video block renders player',
  ytResult?.hasPlayer === true || ytResult?.playerId?.includes('youtube-video-player'),
  ytResult,
);

const consoleOut = cli(['console', 'error']);
const errorLines = (consoleOut.stdout || '').split('\n').filter((l) => {
  if (!l.includes('[ERROR]')) return false;
  if (l.includes('404') || l.includes('nav.plain') || l.includes('footer.plain')) return false;
  if (l.includes('Content Security Policy') && l.includes('martech')) return false;
  if (l.includes('compute-pressure') && l.includes('youtube')) return false;
  if (l.includes('Permissions policy violation') && l.includes('youtube')) return false;
  return true;
});
record(
  'No critical console errors (excluding 404 nav/footer/CSP preload)',
  errorLines.length === 0,
  errorLines.slice(0, 3).join(' | ') || 'none',
);

// --- Quiz ACDL (local draft) ---
const localBase = 'http://localhost:3000';
cli(['goto', `${localBase}/drafts/find-your-adventure`]);
await waitMartech();
const quizStart = evalPage(`
  await new Promise((r) => setTimeout(r, 2000));
  const dl = window.adobeDataLayer || [];
  const startEvents = dl.filter((x) => x.event === 'quizStart');
  const quizState = window.adobeDataLayer?.getState?.('quiz');
  const opt = document.querySelector('.adventure-quiz-option');
  if (!opt) return JSON.stringify({ error: 'no quiz option', startEvents, quizState });
  opt.click();
  await new Promise((r) => setTimeout(r, 300));
  const nextBtn = document.querySelector('.adventure-quiz-next');
  if (!nextBtn || nextBtn.disabled) {
    return JSON.stringify({ error: 'next disabled after option select', startEvents, quizState });
  }
  const lenBefore = dl.length;
  nextBtn.click();
  await new Promise((r) => setTimeout(r, 500));
  const stepEvents = (window.adobeDataLayer || []).slice(lenBefore).filter((x) => x.event === 'quizStepComplete');
  const quizStateAfter = window.adobeDataLayer?.getState?.('quiz');
  return JSON.stringify({ startEvents, stepEvents, quizState: quizStateAfter });
`);
const quizStartOk = Array.isArray(quizStart?.startEvents)
  && quizStart.startEvents.some((e) => e.event === 'quizStart')
  && quizStart?.quizState?.quizId
  && Array.isArray(quizStart?.stepEvents)
  && quizStart.stepEvents.some((e) => e.event === 'quizStepComplete' && e.quiz?.answerId);
record('quizStart ACDL + quiz state', quizStartOk, quizStart);

// --- Asset impression (homepage scroll) ---
cli(['goto', `${BASE}/`]);
await waitMartech();
const assetResult = evalPage(`
  await new Promise((r) => setTimeout(r, 1500));
  const img = document.querySelector('main img');
  if (!img) return JSON.stringify({ error: 'no main image' });
  img.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 2000));
  const state = window.adobeDataLayer?.getState?.('asset');
  const dl = window.adobeDataLayer || [];
  const impressions = dl.filter((x) => x.event === 'assetImpression');
  return JSON.stringify({ assetState: state, impressionCount: impressions.length });
`);
record(
  'assetImpression / asset state',
  Boolean(assetResult?.assetState?.assetId) || (assetResult?.impressionCount > 0),
  assetResult,
);

// --- CTA click ACDL ---
cli(['goto', `${BASE}/`]);
await waitMartech();
const ctaResult = evalPage(`
  await new Promise((r) => setTimeout(r, 1500));
  const cta = document.querySelector('main a.button, main a.button-ghost, main .button-container a');
  if (!cta) return JSON.stringify({ error: 'no CTA link' });
  const lenBefore = (window.adobeDataLayer || []).length;
  cta.addEventListener('click', (e) => e.preventDefault(), { once: true, capture: true });
  cta.click();
  await new Promise((r) => setTimeout(r, 1200));
  const dl = window.adobeDataLayer || [];
  const items = dl.slice(lenBefore).filter((x) => x.event === 'ctaClick');
  return JSON.stringify(items[0] || { error: 'no ctaClick event' });
`);
record(
  'ctaClick event',
  ctaResult?.event === 'ctaClick' && Boolean(ctaResult?.interaction?.label),
  ctaResult,
);

// --- 404 pageError (local 404.html) ---
cli(['goto', `${localBase}/this-path-does-not-exist-404-test`]);
await waitMartech();
const errorResult = evalPage(`
  const dl = window.adobeDataLayer || [];
  const pageError = dl.filter((x) => x.event === 'pageError');
  const page = window.adobeDataLayer?.getState?.('page');
  return JSON.stringify({ pageError: pageError[pageError.length - 1], pageState: page });
`);
record(
  'pageError + errorUrl on 404',
  errorResult?.pageState?.pageType === 'error' && Boolean(errorResult?.pageState?.errorUrl),
  errorResult,
);

closeAll();

const failed = results.filter((r) => !r.pass);
writeFileSync(
  'tools/scripts/test-analytics-acdl-results.json',
  JSON.stringify({ base: BASE, results, failed: failed.length }, null, 2),
);
console.log(`\n${results.length - failed.length}/${results.length} passed (base: ${BASE})`);
process.exit(failed.length ? 1 : 0);
}

run();
