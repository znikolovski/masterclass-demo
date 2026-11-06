#!/usr/bin/env node
/**
 * Export Analytics & Target presenter deck to Adobe-branded PowerPoint.
 * @see skills/adobe-deck/SKILL.md
 * @see docs/ANALYTICS-TARGET-PRESENTER-DECK.md
 */

import pptxgen from 'pptxgenjs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../../docs');
const OUT_FILE = join(OUT_DIR, 'ANALYTICS-TARGET-PRESENTER-DECK.pptx');

/** Adobe brand tokens — skills/adobe-deck/references/brand-foundations.md */
const C = {
  red: 'EB1000',
  black: '000000',
  white: 'FFFFFF',
  grayMid: '949494',
  grayDark: '616161',
  grayFill: 'F5F5F5',
  blue: '3A63F9',
};

const FONT = {
  display: 'Arial Black',
  body: 'Arial',
  mono: 'Courier New',
};

/** Content area guides (inches, 16:9) */
const G = {
  marginL: 0.55,
  marginR: 0.55,
  marginT: 0.45,
  marginB: 0.45,
  threadX: 0.45,
  threadW: 0.06,
  contentX: 0.95,
  contentW: 8.55,
  titleY: 0.42,
  bodyY: 1.05,
  bodyH: 4.35,
  wordmarkX: 8.85,
  wordmarkY: 5.05,
};

/**
 * @param {pptxgen} pptx
 * @param {pptxgen.Slide} slide
 * @param {boolean} [white=false]
 */
function addWordmark(slide, white = false) {
  slide.addText('Adobe', {
    x: G.wordmarkX,
    y: G.wordmarkY,
    w: 1.0,
    h: 0.35,
    fontFace: FONT.display,
    fontSize: 11,
    color: white ? C.white : C.red,
    align: 'right',
    charSpacing: 1.2,
  });
}

/**
 * @param {pptxgen.Slide} slide
 */
function addRedThread(slide) {
  slide.addShape('rect', {
    x: G.threadX,
    y: 1.0,
    w: G.threadW,
    h: 4.15,
    fill: { color: C.red },
    line: { color: C.red, width: 0 },
  });
}

/**
 * @param {pptxgen.Slide} slide
 * @param {string} title
 * @param {object} [opts]
 */
function addSlideTitle(slide, title, opts = {}) {
  slide.addText(title, {
    x: G.contentX,
    y: opts.y ?? G.titleY,
    w: G.contentW,
    h: 0.55,
    fontFace: FONT.display,
    fontSize: opts.fontSize ?? 22,
    color: C.black,
    valign: 'top',
  });
}

/**
 * @param {pptxgen.Slide} slide
 * @param {string} [notes]
 * @returns {pptxgen.Slide}
 */
function contentSlide(pptx, notes = '') {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addRedThread(slide);
  addWordmark(slide, false);
  if (notes) slide.addNotes(notes);
  return slide;
}

/**
 * @param {string[][]} rows
 * @param {boolean} [header=true]
 * @returns {pptxgen.TableRow[]}
 */
function tableRows(rows, header = true) {
  return rows.map((row, i) => row.map((cell) => ({
    text: String(cell),
    options: {
      fontFace: i === 0 && header ? FONT.display : FONT.body,
      fontSize: i === 0 && header ? 10 : 9,
      color: C.black,
      bold: i === 0 && header,
      border: [
        { type: 'none' },
        { type: 'none' },
        { type: i === rows.length - 1 ? 'none' : 'solid', color: C.grayMid, pt: 0.5 },
        { type: 'none' },
      ],
    },
  })));
}

/**
 * @param {pptxgen.Slide} slide
 * @param {string[][]} rows
 * @param {object} box
 */
function addAdobeTable(slide, rows, box) {
  slide.addTable(tableRows(rows), {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    colW: box.colW,
    margin: [0.04, 0.06, 0.04, 0.02],
    autoPage: false,
  });
}

/**
 * @param {pptxgen.Slide} slide
 * @param {object} box
 * @param {string} heading
 * @param {string|string[]} body
 */
function addVisualBox(slide, box, heading, body) {
  slide.addShape('rect', {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: C.grayFill },
    line: { color: C.grayMid, width: 0.75 },
  });
  slide.addText(heading, {
    x: box.x + 0.12,
    y: box.y + 0.1,
    w: box.w - 0.24,
    h: 0.28,
    fontFace: FONT.display,
    fontSize: 10,
    color: C.black,
  });
  const lines = Array.isArray(body) ? body.join('\n') : body;
  slide.addText(lines, {
    x: box.x + 0.12,
    y: box.y + 0.38,
    w: box.w - 0.24,
    h: box.h - 0.48,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.black,
    valign: 'top',
  });
}

/**
 * @param {pptxgen.Slide} slide
 * @param {number} y
 * @param {string} text
 * @param {boolean} [accent=false]
 */
function addFlowStep(slide, y, text, accent = false) {
  slide.addShape('rect', {
    x: G.contentX,
    y,
    w: G.contentW,
    h: 0.42,
    fill: { color: C.grayFill },
    line: { color: C.grayMid, width: 0.5 },
  });
  slide.addShape('rect', {
    x: G.contentX,
    y,
    w: 0.06,
    h: 0.42,
    fill: { color: accent ? C.blue : C.grayDark },
    line: { color: accent ? C.blue : C.grayDark, width: 0 },
  });
  slide.addText(text, {
    x: G.contentX + 0.14,
    y: y + 0.06,
    w: G.contentW - 0.2,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: 10,
    color: C.black,
  });
}

/**
 * Presenter notes with codebase paths for IDE navigation.
 * View → Notes in PowerPoint (Presenter View shows these alongside slides).
 */
const SPEAKER_NOTES = {
  title: [
    'SAY: Welcome — full martech stack on masterclass-demo.',
    'Replace "Presenter name | Role" on slide 1 before presenting.',
    '',
    'PREP — open in tabs:',
    '  Preview: https://main--masterclass-demo--znikolovski.aem.page',
    '  IDE: scripts/martech-config.js',
    '  IDE: scripts/scripts.js (loadPage flow)',
    '  Experience Cloud Debugger extension',
    '',
    'Report suite: ags050wknd · login company: adobeae7',
  ].join('\n'),

  agenda: [
    'SAY: Six parts, ~30 minutes. Keep IDE open beside slides.',
    '',
    'PREP — open these files before starting:',
    '  scripts/martech-config.js',
    '  scripts/scripts.js',
    '  scripts/analytics-page.js',
    '  scripts/analytics-acdl.js',
    '  scripts/target-delivery.js',
    '',
    'Have a page with Target = On + section targetlocation ready in preview.',
    'Optional test page: /faq or any page with accordion-faq block.',
  ].join('\n'),

  part1Divider: [
    'SECTION 1 — The big picture (5 min)',
    '',
    'CODE TO BOOKMARK:',
    '  docs/ANALYTICS-LAUNCH-PLAN.md §Architecture',
    '  docs/TARGET-PERSONALIZATION-PLAN.md §Architecture',
    '  docs/MARTECH.md',
  ].join('\n'),

  oneWebSdk: [
    'SAY: One Web SDK instance named alloy. Code owns first page view; Launch ~3s later.',
    '',
    'SHOW IN IDE:',
    '  scripts/martech-config.js:9-13 — WEB_SDK_CONFIG (datastream, onBeforeEventSend)',
    '  scripts/scripts.js:861-885 — loadMartech() passes launchUrls to martech plugin',
    '  plugins/martech/src/index.js — initMartech (if audience asks about plugin)',
    '',
    'KEY RULE: Never embed second Web SDK from Launch.',
    'DOCS: docs/ANALYTICS-LAUNCH-PLAN.md §Architecture',
  ].join('\n'),

  architecture: [
    'SAY: Walk the flow top-to-bottom — authoring → Target → runtime code.',
    '',
    'SHOW IN IDE (in order):',
    '  tools/adobe-target/send-to-target.mjs — CLI export to Target',
    '  tools/adobe-target/adobe-target.js — EW Send to Target extension',
    '  scripts/target-delivery.js:123-136 — buildTargetApplyMetadata() selector map',
    '  scripts/scripts.js:1000-1008 — scheduleEagerTargetDelivery()',
    '  scripts/analytics-page.js:118-123 — pushAnalyticsPageContext()',
    '  scripts/martech-config.js:12 — onBeforeEventSend → mapPageToAnalytics',
    '',
    'DOCS: docs/TARGET-PERSONALIZATION-PLAN.md · docs/ANALYTICS-LAUNCH-PLAN.md',
  ].join('\n'),

  whatLivesWhere: [
    'SAY: Split responsibilities — code vs Launch vs Admin vs Target UI.',
    '',
    'CODE REFERENCES:',
    '  scripts/martech-config.js — datastream IDs, launchUrls, first-hit mapping',
    '  scripts/analytics-page.js — ACDL page object + mapPageToAnalytics',
    '  scripts/analytics-acdl.js — block interaction events',
    '  scripts/target-delivery.js — post-injection decoration',
    '',
    'LAUNCH: Adobe Tags UI — rules in docs/ANALYTICS-LAUNCH-PLAN.md §4d',
    'ANALYTICS ADMIN: report suite ags050wknd variable labels',
    'TARGET: Activities + offers in Target UI',
  ].join('\n'),

  part2Divider: [
    'SECTION 2 — Site wiring and page load (5 min)',
    '',
    'FOCUS FILE: scripts/martech-config.js then scripts/scripts.js loadPage()',
  ].join('\n'),

  configuration: [
    'SAY: All runtime IDs and Launch embeds live in martech-config.js.',
    '',
    'SHOW IN IDE:',
    '  scripts/martech-config.js:9-13 — WEB_SDK_CONFIG + onBeforeEventSend',
    '  scripts/martech-config.js:16-21 — MARTECH_CONFIG staging/production URLs',
    '  scripts/martech-config.js:37-54 — getLaunchUrls() host logic',
    '  scripts/analytics-page.js:147-174 — mapPageToAnalytics() eVar/prop mapping',
    '',
    'POINT OUT: Preview (.aem.page) → staging Launch; live (.aem.live) → production.',
    'DOCS: docs/MARTECH.md',
  ].join('\n'),

  authorMetadata: [
    'SAY: Authors control analytics/target via page + section metadata in UE.',
    '',
    'SHOW IN IDE:',
    '  component-models.json:33 — page field "target"',
    '  component-models.json:50 — page field "analytics"',
    '  component-models.json:78 — page field "adventureCategory" → eVar4',
    '  component-models.json:303 — section field "targetlocation"',
    '  scripts/scripts.js:573-591 — applySectionMetadata() → data-targetlocation',
    '  scripts/scripts.js:849-852 — isPersonalizationEnabled() reads target meta',
    '',
    'DOCS: docs/MARTECH.md §Authoring',
  ].join('\n'),

  pageLoad: [
    'SAY: Three phases — this timing explains why Launch misses the first page view.',
    '',
    'SHOW IN IDE — scripts/scripts.js:',
    '  :1295-1298 — loadPage() → loadEager → loadLazy → loadDelayed',
    '  :1143-1148 — eager Target: scheduleEagerTargetDelivery() when target: on',
    '  :1176-1178 — loadMartech() starts in lazy phase',
    '  :1226-1241 — pushAnalyticsPageContext + martechLazy + refreshTargetZones',
    '  :1276-1292 — loadDelayed() → martechDelayed() (~3s) + initAssetAnalytics',
    '  plugins/martech/src/index.js — martechEager / martechLazy / martechDelayed',
    '',
    'CRITICAL: Launch loads in delayed phase — interaction rules need ≥5s after load.',
  ].join('\n'),

  demoConsole: [
    'DEMO: Open preview, wait 5+ seconds, then DevTools console.',
    '',
    'RUN IN CONSOLE:',
    '  adobeDataLayer.getState("page")',
    '  typeof _satellite !== "undefined"',
    '',
    'SHOW IN IDE (explain what console returns):',
    '  scripts/analytics-page.js:71-95 — buildPageContext() fields',
    '  scripts/analytics-page.js:38-43 — getAnalyticsEnvironment() → prop1',
    '  head.html:490 — preconnect edge.adobedc.net',
    '  scripts/target-delivery.js:389-395 — revealTargetZones() / target-ready class',
  ].join('\n'),

  part3Divider: [
    'SECTION 3 — Analytics in the codebase (7 min)',
    '',
    'FOCUS FILES: analytics-page.js, analytics-acdl.js, blocks/*.js',
  ].join('\n'),

  pageContext: [
    'SAY: Page context pushed to ACDL before the lazy-phase page view.',
    '',
    'SHOW IN IDE:',
    '  scripts/analytics-page.js:71-95 — buildPageContext() (all page.* fields)',
    '  scripts/analytics-page.js:118-123 — pushAnalyticsPageContext()',
    '  scripts/scripts.js:1228-1232 — called before martechLazy() in loadLazy',
    '  scripts/analytics-page.js:129-140 — pushErrorPageContext() for 404s',
    '  scripts/analytics-page.js:147-174 — mapPageToAnalytics() variable map',
    '',
    'DEMO PAGE: any preview page — console: adobeDataLayer.getState("page")',
  ].join('\n'),

  variableMap: [
    'SAY: Every slot on slide maps to code — no magic in Launch for first page view.',
    '',
    'SHOW IN IDE:',
    '  scripts/analytics-page.js:147-174 — mapPageToAnalytics()',
    '    eVar5 ← page.template · eVar3 ← contentType · eVar4 ← adventureCategory',
    '    prop1 ← environment · prop3 ← journeyStage · prop4 ← siteSection',
    '    prop9 ← targetEnabled · eVar1 ← ?cid= query param',
    '  scripts/martech-config.js:12 — onBeforeEventSend wires mapPageToAnalytics',
    '',
    'DOCS: docs/ANALYTICS-LAUNCH-PLAN.md §Report suite inventory',
  ].join('\n'),

  interactions: [
    'SAY: Blocks push ACDL events; Launch rules map them after delayed load.',
    '',
    'SHOW IN IDE:',
    '  scripts/analytics-acdl.js:10-19 — pushInteractionEvent() pattern',
    '  scripts/scripts.js:532-547 — bindCtaAnalytics() global CTA listener',
    '',
    'LAUNCH (Adobe Tags UI):',
    '  Rule EDS - CTA Click — ACDL event ctaClick → event1',
    '  Recipe: docs/ANALYTICS-LAUNCH-PLAN.md §4d-1b',
  ].join('\n'),

  blocks: [
    'SAY: Each block owns its event — table is your navigation index.',
    '',
    'SHOW IN IDE (pick 2-3 live):',
    '  scripts/scripts.js:532-547 — ctaClick (global)',
    '  blocks/carousel-hero/carousel-hero.js:1-7 — carouselChange via pushCarouselChange',
    '  blocks/carousel-blog/carousel-blog.js:2,18 — carousel-blog variant',
    '  blocks/accordion-faq/accordion-faq.js:71-75 — faqExpand',
    '  blocks/tabs-activity/tabs-activity.js:44 — tabSelect',
    '  blocks/adventure-map/adventure-map.js:480-484 — mapPinClick',
    '  blocks/youtube-video/youtube-video.js:180,187 — videoStart / videoComplete',
    '  scripts/quiz-analytics.js:44 — pushQuizEvent (blocks/adventure-quiz/)',
    '  scripts/form-analytics.js:132-150 — initFormAnalytics (blocks/form/form.js:645)',
    '  scripts/asset-analytics.js:67 — initAssetAnalytics (scripts/scripts.js:1286)',
    '',
    'DOCS: docs/QUIZ-ANALYTICS-PLAN.md · FORM-ANALYTICS-PLAN.md · ASSET-ANALYTICS-PLAN.md',
  ].join('\n'),

  demoFaq: [
    'DEMO: Page with accordion-faq block (e.g. /faq if published).',
    '',
    'STEPS:',
    '  1. Expand FAQ item',
    '  2. Console: adobeDataLayer.getState("interaction")',
    '  3. After 5s: Debugger → rule EDS - FAQ Expand',
    '',
    'SHOW IN IDE:',
    '  blocks/accordion-faq/accordion-faq.js:69-75 — pushInteractionEvent("faqExpand")',
    '  scripts/analytics-acdl.js:10-19 — shared push helper',
    '',
    'LAUNCH RULE: docs/ANALYTICS-LAUNCH-PLAN.md §4d-7 (event5, prop5=accordion-faq)',
    'RUNBOOK: docs/ANALYTICS-LAUNCH-RUNBOOK.md Part 2 — interaction rules',
  ].join('\n'),

  specializedFunnels: [
    'SAY: Quiz/form/asset use dedicated event slots — no collision with CTA/carousel.',
    '',
    'SHOW IN IDE:',
    '  scripts/quiz-analytics.js — quizStart…quizComplete (event17-21)',
    '  blocks/adventure-quiz/adventure-quiz.js:28 — imports quiz-analytics',
    '  blocks/quiz-results/quiz-results.js — quizResultView, quizExperienceClick',
    '  scripts/form-analytics.js:132-150 — form funnel events',
    '  blocks/form/form.js:645 — initFormAnalytics wiring',
    '  blocks/form/submit.js — formSubmitSuccess / formSubmitError',
    '  scripts/asset-analytics.js:67-90 — initAssetAnalytics (delayed phase)',
    '',
    'NOTE: Quiz eVar2 on quiz hits only — not page eVar4 adventureCategory.',
  ].join('\n'),

  part4Divider: [
    'SECTION 4 — Launch configuration (5 min)',
    'Switch to Adobe Tags UI — keep martech-config.js open for embed URL cross-ref.',
  ].join('\n'),

  launchProperty: [
    'SAY: Launch maps interaction hits — not the first page view.',
    '',
    'SHOW IN IDE:',
    '  scripts/martech-config.js:16-21 — embed URLs must match published library',
    '  scripts/martech-config.js:37-54 — getLaunchUrls() which library loads',
    '',
    'LAUNCH UI (Experience Platform → Data Collection → Tags):',
    '  Property: masterclass-demo-eds',
    '  Extensions: ACDL (do not inject) + Web SDK (self-hosted alloy)',
    '  DOCS: docs/ANALYTICS-LAUNCH-PLAN.md §Phase 1',
  ].join('\n'),

  dataElements: [
    'SAY: Two-layer model — ACDL sources feed Web SDK Variable container.',
    '',
    'LAUNCH UI — create data elements (docs/ANALYTICS-LAUNCH-PLAN.md §3):',
    '  EDS - Page Template → page.template',
    '  EDS - Adventure Category → page.adventureCategory',
    '  EDS - Interaction Label → interaction.label',
    '  EDS - Analytics Variable — Web SDK Variable type (required)',
    '',
    'CODE PATHS those elements read:',
    '  scripts/analytics-page.js:118-123 — page object pushed to ACDL',
    '  scripts/analytics-acdl.js:12-18 — interaction object on events',
    '',
    'AUDIT FIX: Storage duration = Page view (not None)',
    'RUNBOOK: docs/ANALYTICS-LAUNCH-RUNBOOK.md Part 1',
  ].join('\n'),

  interactionRules: [
    'SAY: Every interaction rule follows Event → Update variable → Send event.',
    '',
    'LAUNCH UI — skeleton (docs/ANALYTICS-LAUNCH-PLAN.md §4d master walkthrough):',
    '  Action 1: Web SDK Update variable → select EDS - Analytics Variable',
    '  Action 2: Web SDK Send event → Link click → same Variable',
    '',
    'CODE THAT FIRES EVENTS (pick one to demo live):',
    '  scripts/analytics-acdl.js:10-19 — pushInteractionEvent',
    '  blocks/accordion-faq/accordion-faq.js:71 — faqExpand example',
    '',
    'Skip DOM Ready page view rule — martech already sends page view.',
  ].join('\n'),

  liveExampleFaq: [
    'SAY: Walk one complete rule — FAQ expand is the cleanest ACDL example.',
    '',
    'LAUNCH UI — rule EDS - FAQ Expand:',
    '  Event: ACDL listen · faqExpand',
    '  Update variable Custom Code: s.events=event5, s.prop5=accordion-faq',
    '  Send event: Link click · EDS - Analytics Variable',
    '',
    'CODE THAT TRIGGERS IT:',
    '  blocks/accordion-faq/accordion-faq.js:69-75',
    '  scripts/analytics-acdl.js:10-19',
    '',
    'FULL RECIPE: docs/ANALYTICS-LAUNCH-PLAN.md §4d-7',
    'RUNBOOK: docs/ANALYTICS-LAUNCH-RUNBOOK.md Part 2',
  ].join('\n'),

  validateLaunch: [
    'DEMO: Preview + Debugger validation checklist.',
    '',
    'VERIFY IN IDE (embed loaded):',
    '  scripts/martech-config.js:17-18 — staging URL in Network tab',
    '  Network filter: launch-49a2d20de828-staging.min.js',
    '',
    'COMMON FIXES (code-side):',
    '  scripts/analytics-acdl.js — use getState not %EDS-% literals in Launch Custom Code',
    '  docs/ANALYTICS-LAUNCH-RUNBOOK.md — audit remediation',
    '',
    'SMOKE TEST: node tools/scripts/test-analytics-acdl.mjs',
  ].join('\n'),

  part5Divider: [
    'SECTION 5 — Analytics admin and audiences (3 min)',
    'Switch to Analytics Admin + Analysis Workspace.',
    'Segment definitions reference eVar4/prop3 from analytics-page.js metadata.',
  ].join('\n'),

  reportSuite: [
    'SAY: Label slots in Admin — code already sends to eVar1-5, prop1-5, events.',
    '',
    'CODE → ADMIN LABEL MAP:',
    '  event1 ← ctaClick (scripts/scripts.js:532-547 + Launch rule)',
    '  event2 ← carouselChange (blocks/carousel-hero/carousel-hero.js:7)',
    '  event5 ← faqExpand (blocks/accordion-faq/accordion-faq.js:71)',
    '  event17-21 ← quiz (scripts/quiz-analytics.js)',
    '  eVar4 ← page.adventureCategory (scripts/analytics-page.js:161-162)',
    '  prop3 ← page.journeyStage (scripts/analytics-page.js:163)',
    '',
    'DOCS: docs/ANALYTICS-LAUNCH-PLAN.md Phase 3',
  ].join('\n'),

  segments: [
    'SAY: Tier 4 archetypes bridge Analytics segments → Target audiences.',
    '',
    'SEGMENTS USE CODE-DRIVEN VARIABLES:',
    '  eVar4 ← scripts/analytics-page.js adventureCategory (metadata or deriveAdventureCategory)',
    '  prop3 ← scripts/analytics-page.js journeyStage',
    '  prop1 ← environment (preview/live/local) for EDS - Live Traffic filter',
    '',
    'DOCS: docs/ANALYTICS-LAUNCH-PLAN.md Phase 4 (Tier 1-4 definitions)',
    'WORKSPACE: WKND — Adventure Audiences (Phase 5 build guide)',
    '',
    'TARGET BRIDGE: Export Tier 4 segment → Target audience for hero test',
  ].join('\n'),

  demoWorkspace: [
    'DEMO: Analysis Workspace on ags050wknd.',
    '',
    'RELATE TO CODE while building panel:',
    '  Filter EDS - Live Traffic → prop1=live from mapPageToAnalytics',
    '  Breakdown eVar4 × prop3 → page metadata from buildPageContext',
    '',
    'DOCS: docs/ANALYTICS-LAUNCH-PLAN.md Phase 5 — panel-by-panel guide',
  ].join('\n'),

  part6Divider: [
    'SECTION 6 — Adobe Target end-to-end (5 min)',
    'FOCUS FILES: target-delivery.js, target-analytics.js, tools/adobe-target/',
  ].join('\n'),

  offers: [
    'SAY: Offers are HTML exports — site re-decorates after Web SDK injection.',
    '',
    'SHOW IN IDE:',
    '  tools/adobe-target/send-to-target.mjs — CLI: npm run target:send',
    '  tools/adobe-target/adobe-target.js — EW Library extension',
    '  tools/adobe-target/adobe-target.html — EW UI shell',
    '  scripts/target-delivery.js:316-365 — decorateTargetInjections / loadInjectedBlock',
    '',
    'DOCS: docs/TARGET-PERSONALIZATION-PLAN.md §Authoring → offers',
    'SKILL: skills/adobe-target-personalization/SKILL.md',
  ].join('\n'),

  targetZones: [
    'SAY: Page + section metadata define zones; code marks and decorates them.',
    '',
    'SHOW IN IDE:',
    '  component-models.json:33 — page target field',
    '  component-models.json:303 — section targetlocation field',
    '  scripts/scripts.js:573-591 — applySectionMetadata() + markTargetZone',
    '  scripts/target-delivery.js:80-88 — markTargetZone() adds class target',
    '  scripts/target-delivery.js:95-99 — getTargetZones() outermost zones only',
    '',
    'DEMO — inspect DOM on Target-enabled preview page:',
    '  section[data-targetlocation] + class target',
    '  curl preview .plain.html | grep targetlocation',
  ].join('\n'),

  targetActivity: [
    'SAY: Target activity selector must match data-targetlocation in DOM.',
    '',
    'SHOW IN IDE (selector built in code):',
    '  scripts/target-delivery.js:123-136 — buildTargetApplyMetadata()',
    '    selector: [data-targetlocation="wknd-marquee"]',
    '  scripts/target-delivery.js:107-113 — getTargetDecisionScopes() mbox names',
    '',
    'TARGET UI: Create activity with same CSS selector as code generates.',
    'DOCS: docs/TARGET-PERSONALIZATION-PLAN.md §Step 4 — Create Target activity',
  ].join('\n'),

  runtime: [
    'SAY: target-delivery.js re-runs EDS block pipeline on injected HTML.',
    '',
    'SHOW IN IDE — scripts/target-delivery.js:',
    '  :123-136 — buildTargetApplyMetadata()',
    '  :345-365 — decorateTargetZone() → decorateBlock + loadBlock',
    '  :401-414 — refreshTargetZones() after lazy sections',
    '  :476-509 — initTargetDelivery() MutationObserver + martech:propositions-applied',
    '',
    'SHOW IN IDE — scripts/scripts.js:',
    '  :1000-1008 — scheduleEagerTargetDelivery() + finalizeTargetZonesAfterApply',
    '  :1234-1240 — pushTargetPageContext + initTargetAnalytics in loadLazy',
    '',
    'ANALYTICS QA CODE:',
    '  scripts/target-analytics.js:42-59 — targetZoneReady ACDL event',
    '  scripts/analytics-page.js:166 — prop9 target-on when targetEnabled=yes',
  ].join('\n'),

  targetQa: [
    'QA CHECKLIST — verify each item in browser + code:',
    '',
    '  DOM: data-targetlocation + class target (target-delivery.js:80-88)',
    '  Meta: page target=on (scripts/scripts.js:849-852)',
    '  Decoration: blocks load after injection (target-delivery.js:316-338)',
    '  Analytics: prop9 in mapPageToAnalytics (analytics-page.js:166)',
    '  Turn off target meta when activity ends (docs/MARTECH.md)',
    '',
    'SKILL: skills/adobe-target-personalization/SKILL.md §QA',
    'PSI: PageSpeed on experiment URL before full traffic',
  ].join('\n'),

  summary: [
    'SAY: Quick ownership recap before closer.',
    '',
    'CODE INDEX (bookmark for team):',
    '  scripts/martech-config.js — IDs, Launch embed, first page view mapping',
    '  scripts/scripts.js — loadPage phases, loadMartech, Target eager path',
    '  scripts/analytics-page.js — page context + eVar/prop map',
    '  scripts/analytics-acdl.js — interaction events',
    '  scripts/target-delivery.js — Target injection + decoration',
    '  scripts/target-analytics.js — Target ACDL context',
    '  blocks/* — per-component event wiring',
    '',
    'DOCS: docs/MARTECH.md · ANALYTICS-LAUNCH-PLAN.md · ANALYTICS-LAUNCH-RUNBOOK.md · TARGET-PERSONALIZATION-PLAN.md',
  ].join('\n'),

  closer: [
    'Questions?',
    '',
    'QUICK REFERENCE FOR AUDIENCE:',
    '  Deck: docs/ANALYTICS-TARGET-PRESENTER-DECK.pptx',
    '  Regenerate: npm run deck:analytics-target',
    '  Preview: https://main--masterclass-demo--znikolovski.aem.page',
    '  ACDL smoke test: node tools/scripts/test-analytics-acdl.mjs',
    '',
    'KEY CODE ENTRY POINTS:',
    '  scripts/martech-config.js',
    '  scripts/scripts.js:1295 — loadPage()',
    '  scripts/analytics-page.js:147 — mapPageToAnalytics()',
    '  scripts/target-delivery.js:476 — initTargetDelivery()',
  ].join('\n'),
};

/**
 * @param {pptxgen} pptx
 * @param {string} title
 * @param {string} timing
 * @param {string} [notes]
 * @returns {pptxgen.Slide}
 */
function dividerSlide(pptx, title, timing, notes = '') {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addWordmark(slide, false);
  slide.addText(title, {
    x: 0.55,
    y: 2.0,
    w: 8.5,
    h: 0.9,
    fontFace: FONT.display,
    fontSize: 32,
    color: C.black,
  });
  slide.addText(timing, {
    x: 0.55,
    y: 2.95,
    w: 3,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: 12,
    color: C.grayDark,
  });
  if (notes) slide.addNotes(notes);
  return slide;
}

/**
 * @param {pptxgen} pptx
 */
function buildDeck(pptx) {
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Adobe';
  pptx.title = 'Analytics and Target on WKND Adventures';
  pptx.subject = 'WKND EDS martech walkthrough';

  // —— Title slide (red) ——
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: C.red };
  titleSlide.addText('Analytics and Target on WKND Adventures', {
    x: 0.55,
    y: 1.35,
    w: 8.8,
    h: 1.4,
    fontFace: FONT.display,
    fontSize: 34,
    color: C.white,
    valign: 'top',
  });
  titleSlide.addText('Presenter name  |  Role / team', {
    x: 0.55,
    y: 3.15,
    w: 8.0,
    h: 0.35,
    fontFace: FONT.display,
    fontSize: 14,
    color: C.white,
  });
  titleSlide.addText('30-minute walkthrough · AEM Edge Delivery Services · Web SDK · Launch · Analytics · Target', {
    x: 0.55,
    y: 3.55,
    w: 8.8,
    h: 0.45,
    fontFace: FONT.body,
    fontSize: 11,
    color: C.white,
  });
  addWordmark(titleSlide, true);
  titleSlide.addNotes(SPEAKER_NOTES.title);

  // —— Agenda ——
  let slide = contentSlide(pptx, SPEAKER_NOTES.agenda);
  addSlideTitle(slide, 'Agenda');
  addAdobeTable(slide, [
    ['Section', 'Time'],
    ['Part 1 · The big picture', '0:00 – 5:00'],
    ['Part 2 · Site wiring and page load', '5:00 – 10:00'],
    ['Part 3 · Analytics in the codebase', '10:00 – 17:00'],
    ['Part 4 · Launch configuration', '17:00 – 22:00'],
    ['Part 5 · Analytics admin and audiences', '22:00 – 25:00'],
    ['Part 6 · Adobe Target end-to-end', '25:00 – 30:00'],
  ], { x: G.contentX, y: 1.15, w: 5.2, h: 2.5, colW: [3.4, 1.8] });
  addVisualBox(slide, { x: 6.35, y: 1.15, w: 3.15, h: 1.05 }, 'Preview site', 'main--masterclass-demo--znikolovski.aem.page');
  addVisualBox(slide, { x: 6.35, y: 2.35, w: 3.15, h: 1.05 }, 'Have ready', 'One page with Target = On and a targetlocation section');

  // —— Part 1 divider ——
  dividerSlide(pptx, 'Part 1  |  The big picture', '0:00 – 5:00', SPEAKER_NOTES.part1Divider);

  slide = contentSlide(pptx, SPEAKER_NOTES.oneWebSdk);
  addSlideTitle(slide, 'One Web SDK  |  Three Adobe products');
  addAdobeTable(slide, [
    ['Layer', 'Role'],
    ['Datastream', 'Routes hits to Analytics + Target'],
    ['Martech + code', 'Load alloy, consent, phased load'],
    ['Launch', 'ACDL rules → Analytics variables'],
    ['Blocks', 'Push interaction events'],
    ['Target offers', 'HTML from authoring export'],
    ['Segments', 'Audience archetypes for Target'],
  ], { x: G.contentX, y: 1.15, w: 4.5, h: 2.8, colW: [1.5, 3.0] });
  addVisualBox(slide, { x: 5.75, y: 1.15, w: 3.75, h: 2.5 }, 'Key rule', [
    'One Web SDK instance: alloy',
    'Code sends the first page view',
    'Launch loads ~3 seconds later',
    'Target is opt-in per page',
  ]);

  slide = contentSlide(pptx, SPEAKER_NOTES.architecture);
  addSlideTitle(slide, 'Architecture  |  End-to-end flow');
  const flowY = 1.2;
  [
    ['Authoring → Send to Adobe Target → HTML offers', true],
    ['Target activity → selector + audience → Web SDK decisions', false],
    ['Martech eager → [data-targetlocation] zones → target-delivery.js', true],
    ['Page load → ACDL page → onBeforeEventSend → first page view', false],
    ['~3s later → Launch → interaction rules → link clicks', true],
  ].forEach(([text, accent], i) => addFlowStep(slide, flowY + i * 0.48, text, accent));
  slide.addText('Deep dive: docs/TARGET-PERSONALIZATION-PLAN.md · docs/ANALYTICS-LAUNCH-PLAN.md', {
    x: G.contentX,
    y: 4.55,
    w: G.contentW,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.grayDark,
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.whatLivesWhere);
  addSlideTitle(slide, 'What lives where  |  Responsibility split', { fontSize: 20 });
  addAdobeTable(slide, [
    ['Code', 'Launch', 'Analytics admin', 'Target'],
    ['Datastream IDs', 'Interaction mapping', 'Variable labels', 'Activities'],
    ['First page view', 'Data elements', 'Segments Tier 2–4', 'HTML offers'],
    ['ACDL + block events', 'Rule libraries', 'Workspace', 'Audiences'],
    ['Target zone decoration', 'Supplemental pageView', 'Event enablement', 'Traffic allocation'],
    ['launchUrls embed', '', '', ''],
  ], { x: G.contentX, y: 1.1, w: G.contentW, h: 2.6, colW: [2.0, 2.1, 2.2, 2.25] });

  // —— Part 2 ——
  dividerSlide(pptx, 'Part 2  |  Site wiring and page load', '5:00 – 10:00', SPEAKER_NOTES.part2Divider);

  slide = contentSlide(pptx, SPEAKER_NOTES.configuration);
  addSlideTitle(slide, 'Configuration  |  martech-config.js');
  addAdobeTable(slide, [
    ['Setting', 'Value'],
    ['Datastream', '56dee4fc-…'],
    ['Org ID', '28260E2056581D3B7F000101@AdobeOrg'],
    ['Staging Launch', '.aem.page + localhost'],
    ['Production Launch', '.aem.live'],
    ['First-hit mapping', 'onBeforeEventSend'],
  ], { x: G.contentX, y: 1.15, w: 4.3, h: 2.4, colW: [1.6, 2.7] });
  slide.addShape('rect', { x: 5.5, y: 1.15, w: 3.95, h: 1.35, fill: { color: C.grayFill }, line: { color: C.grayMid, width: 0.75 } });
  slide.addText('onBeforeEventSend: (content) =>\n  mapPageToAnalytics(content),', {
    x: 5.62,
    y: 1.28,
    w: 3.7,
    h: 1.1,
    fontFace: FONT.mono,
    fontSize: 9,
    color: C.black,
    valign: 'top',
  });
  slide.addText('Preview → staging embed\nLive → production embed', {
    x: 5.5,
    y: 2.65,
    w: 3.95,
    h: 0.55,
    fontFace: FONT.body,
    fontSize: 10,
    color: C.black,
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.authorMetadata);
  addSlideTitle(slide, 'Author metadata  |  Universal Editor');
  addAdobeTable(slide, [
    ['Field', 'Maps to'],
    ['analytics', 'Auto page view'],
    ['target', 'Eager personalization'],
    ['adventureCategory', 'eVar4'],
    ['journeyStage', 'prop3'],
  ], { x: G.contentX, y: 1.2, w: 3.8, h: 1.9, colW: [1.6, 2.2] });
  slide.addText('Page fields · component-models.json', { x: G.contentX, y: 1.05, w: 3.8, h: 0.2, fontFace: FONT.body, fontSize: 9, color: C.grayDark });
  addAdobeTable(slide, [
    ['Field', 'Effect'],
    ['targetlocation', 'data-targetlocation zone'],
  ], { x: 5.2, y: 1.35, w: 3.8, h: 0.75, colW: [1.5, 2.3] });
  slide.addText('Section field', { x: 5.2, y: 1.2, w: 3.8, h: 0.2, fontFace: FONT.body, fontSize: 9, color: C.grayDark });
  addVisualBox(slide, { x: 5.2, y: 2.25, w: 3.8, h: 0.75 }, 'Docs', 'docs/MARTECH.md');

  slide = contentSlide(pptx, SPEAKER_NOTES.pageLoad);
  addSlideTitle(slide, 'Page load  |  Three phases');
  addVisualBox(slide, { x: G.contentX, y: 1.2, w: 2.7, h: 1.55 }, 'Eager', 'LCP path\nTarget if target: on\nscheduleEagerTargetDelivery()');
  addVisualBox(slide, { x: 3.85, y: 1.2, w: 2.7, h: 1.55 }, 'Lazy', 'loadMartech()\nACDL page push\nmartechLazy() = page view');
  addVisualBox(slide, { x: 6.7, y: 1.2, w: 2.7, h: 1.55 }, 'Delayed', '~3 seconds\nmartechDelayed() = Launch\ninitAssetAnalytics()');
  slide.addText('Critical: Launch rules do not run on the first page view. Interaction rules need ≥5 seconds after load.', {
    x: G.contentX,
    y: 3.0,
    w: G.contentW,
    h: 0.45,
    fontFace: FONT.body,
    fontSize: 10,
    bold: true,
    color: C.black,
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.demoConsole);
  addSlideTitle(slide, 'Demo  |  Browser console');
  slide.addShape('rect', { x: G.contentX, y: 1.2, w: 4.2, h: 1.2, fill: { color: C.grayFill }, line: { color: C.grayMid, width: 0.75 } });
  slide.addText('After preview load (wait ~5s):\n\nadobeDataLayer.getState(\'page\')\ntypeof _satellite !== \'undefined\'', {
    x: G.contentX + 0.12,
    y: 1.32,
    w: 4.0,
    h: 1.0,
    fontFace: FONT.mono,
    fontSize: 9,
    color: C.black,
    valign: 'top',
  });
  addVisualBox(slide, { x: 5.45, y: 1.2, w: 3.95, h: 1.55 }, 'Performance', [
    'head.html preconnects to edge.adobedc.net',
    'Target zones hidden until target-ready in target-delivery.js',
  ]);

  // —— Part 3 ——
  dividerSlide(pptx, 'Part 3  |  Analytics in the codebase', '10:00 – 17:00', SPEAKER_NOTES.part3Divider);

  slide = contentSlide(pptx, SPEAKER_NOTES.pageContext);
  addSlideTitle(slide, 'Page context  |  analytics-page.js');
  slide.addText('Pushed before martechLazy() via pushAnalyticsPageContext().', {
    x: G.contentX,
    y: 1.05,
    w: 4.5,
    h: 0.25,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.grayDark,
  });
  slide.addShape('rect', { x: G.contentX, y: 1.35, w: 4.5, h: 1.65, fill: { color: C.grayFill }, line: { color: C.grayMid, width: 0.75 } });
  slide.addText('adobeDataLayer.push({ page: {\n  pageName, template, theme,\n  contentType, environment,\n  siteSection, adventureCategory,\n  journeyStage, targetEnabled,\n}});', {
    x: G.contentX + 0.1,
    y: 1.45,
    w: 4.3,
    h: 1.45,
    fontFace: FONT.mono,
    fontSize: 8.5,
    color: C.black,
    valign: 'top',
  });
  slide.addText('404: pushErrorPageContext() → pageError', {
    x: G.contentX,
    y: 3.1,
    w: 4.5,
    h: 0.25,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.black,
  });
  addVisualBox(slide, { x: 5.75, y: 1.35, w: 3.75, h: 1.2 }, 'Environment', 'preview · live · local\nvia prop1 on every hit');

  slide = contentSlide(pptx, SPEAKER_NOTES.variableMap);
  addSlideTitle(slide, 'Variable map  |  Report suite ags050wknd', { fontSize: 20 });
  addAdobeTable(slide, [
    ['Slot', 'Source', 'Example'],
    ['eVar5', 'page.template', 'blog-article'],
    ['eVar3', 'page.contentType', 'homepage'],
    ['eVar4', 'page.adventureCategory', 'climbing'],
    ['eVar1', '?cid=', 'Campaign ID'],
    ['prop1', 'page.environment', 'preview'],
    ['prop3', 'page.journeyStage', 'inspiration'],
    ['prop4', 'page.siteSection', 'blog'],
    ['prop5', 'interaction hits', 'Block detail'],
    ['prop9', 'targetEnabled', 'target-on'],
  ], { x: G.contentX, y: 1.1, w: G.contentW, h: 3.0, colW: [1.2, 2.5, 2.0] });
  slide.addText('Mapping: mapPageToAnalytics() ← onBeforeEventSend', {
    x: G.contentX,
    y: 4.35,
    w: G.contentW,
    h: 0.25,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.grayDark,
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.interactions);
  addSlideTitle(slide, 'Interactions  |  ACDL pattern');
  slide.addText('File: scripts/analytics-acdl.js', { x: G.contentX, y: 1.05, w: 4.5, h: 0.2, fontFace: FONT.body, fontSize: 9, color: C.grayDark });
  slide.addShape('rect', { x: G.contentX, y: 1.28, w: 4.4, h: 1.35, fill: { color: C.grayFill }, line: { color: C.grayMid, width: 0.75 } });
  slide.addText('adobeDataLayer.push({\n  event: \'ctaClick\',\n  interaction: { label, block, detail },\n});', {
    x: G.contentX + 0.1,
    y: 1.38,
    w: 4.2,
    h: 1.15,
    fontFace: FONT.mono,
    fontSize: 8.5,
    color: C.black,
    valign: 'top',
  });
  slide.addText('Launch: event → Update variable → Send event\nGlobal CTAs: bindCtaAnalytics() in scripts.js', {
    x: G.contentX,
    y: 2.75,
    w: 4.4,
    h: 0.45,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.black,
  });
  const flowX = 5.35;
  const flowW = 4.15;
  [
    ['Block fires ACDL event', true],
    ['Launch rule listens (~3s+)', false],
    ['EDS - Analytics Variable', true],
    ['Real-Time event counter', false],
  ].forEach(([text, accent], i) => {
    const y = 1.25 + i * 0.48;
    slide.addShape('rect', { x: flowX, y, w: flowW, h: 0.42, fill: { color: C.grayFill }, line: { color: C.grayMid, width: 0.5 } });
    slide.addShape('rect', { x: flowX, y, w: 0.06, h: 0.42, fill: { color: accent ? C.blue : C.grayDark }, line: { color: accent ? C.blue : C.grayDark, width: 0 } });
    slide.addText(text, { x: flowX + 0.14, y: y + 0.06, w: flowW - 0.2, h: 0.3, fontFace: FONT.body, fontSize: 10, color: C.black });
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.blocks);
  addSlideTitle(slide, 'Blocks  |  Events and Launch rules', { fontSize: 20 });
  addAdobeTable(slide, [
    ['Block', 'ACDL event', 'Analytics'],
    ['CTA', 'ctaClick', 'event1'],
    ['Carousel', 'carouselChange', 'event2'],
    ['FAQ', 'faqExpand', 'event5'],
    ['Tabs / map', 'tabSelect / mapPinClick', 'event6'],
    ['YouTube', 'videoStart / complete', 'event3 / event4'],
    ['Quiz', 'quizStart … complete', 'event17–21'],
    ['Forms', 'formImpression …', 'event9–15'],
    ['Images', 'assetImpression / click', 'event7 / event8'],
  ], { x: G.contentX, y: 1.1, w: G.contentW, h: 3.1, colW: [2.0, 3.0, 2.0] });

  slide = contentSlide(pptx, SPEAKER_NOTES.demoFaq);
  addSlideTitle(slide, 'Demo  |  FAQ expand');
  slide.addText([
    { text: '1. Open page with accordion-faq\n', options: { bullet: true, breakLine: true } },
    { text: '2. Expand one item\n', options: { bullet: true, breakLine: true } },
    { text: '3. Console: getState(\'interaction\')\n', options: { bullet: true, breakLine: true } },
    { text: '4. Debugger → EDS - FAQ Expand', options: { bullet: true } },
  ], { x: G.contentX, y: 1.15, w: 4.3, h: 1.5, fontFace: FONT.body, fontSize: 11, color: C.black });
  addVisualBox(slide, { x: 5.45, y: 1.15, w: 3.95, h: 1.45 }, 'Validate', [
    'Rule fires after Launch loads',
    'prop5 = accordion-faq',
    'event5 in Real-Time',
  ]);

  slide = contentSlide(pptx, SPEAKER_NOTES.specializedFunnels);
  addSlideTitle(slide, 'Specialized funnels  |  Plan docs');
  addAdobeTable(slide, [
    ['Feature', 'Code', 'Events'],
    ['Quiz', 'quiz-analytics.js', 'event17–21, eVar2, eVar8'],
    ['Forms', 'form-analytics.js', 'event9–15, eVar7'],
    ['Assets', 'asset-analytics.js', 'event7–8, eVar6'],
  ], { x: G.contentX, y: 1.2, w: G.contentW, h: 1.4, colW: [1.5, 2.5, 3.0] });
  slide.addText('Quiz result category → eVar2 on quiz hits only — not page eVar4.', {
    x: G.contentX,
    y: 2.85,
    w: G.contentW,
    h: 0.35,
    fontFace: FONT.body,
    fontSize: 10,
    italic: true,
    color: C.grayDark,
  });

  // —— Part 4 ——
  dividerSlide(pptx, 'Part 4  |  Launch configuration', '17:00 – 22:00', SPEAKER_NOTES.part4Divider);

  slide = contentSlide(pptx, SPEAKER_NOTES.launchProperty);
  addSlideTitle(slide, 'Launch property  |  Tags setup');
  addAdobeTable(slide, [
    ['Setting', 'Value'],
    ['Property', 'masterclass-demo-eds'],
    ['Domains', 'aem.page, aem.live'],
    ['Embed', 'martech-config.js'],
  ], { x: G.contentX, y: 1.15, w: 4.3, h: 1.5, colW: [1.5, 2.8] });
  slide.addText('ACDL extension: adobeDataLayer · do not inject\nWeb SDK: self-hosted alloy · Migrate Target off', {
    x: G.contentX,
    y: 2.75,
    w: 4.3,
    h: 0.55,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.black,
  });
  addVisualBox(slide, { x: 5.5, y: 1.15, w: 3.95, h: 1.1 }, 'Console path', 'Experience Platform → Data Collection → Tags');

  slide = contentSlide(pptx, SPEAKER_NOTES.dataElements);
  addSlideTitle(slide, 'Data elements  |  Two-layer model');
  slide.addText('Layer 1 — ACDL sources (storage: Page view)', { x: G.contentX, y: 1.05, w: 4.2, h: 0.2, fontFace: FONT.body, fontSize: 9, color: C.grayDark });
  addAdobeTable(slide, [
    ['Element', 'Path'],
    ['EDS - Page Template', 'page.template'],
    ['EDS - Adventure Category', 'page.adventureCategory'],
    ['EDS - Interaction Label', 'interaction.label'],
  ], { x: G.contentX, y: 1.28, w: 4.2, h: 1.35, colW: [2.0, 2.2] });
  slide.addText('⚠ Storage None = top audit failure', { x: G.contentX, y: 2.7, w: 4.2, h: 0.25, fontFace: FONT.body, fontSize: 9, color: C.black });
  addVisualBox(slide, { x: 5.45, y: 1.2, w: 3.95, h: 1.55 }, 'Layer 2 — Variable container', [
    'EDS - Analytics Variable',
    'Web SDK → Variable → Data + Analytics',
    'Used by every Update variable → Send event rule',
  ]);

  slide = contentSlide(pptx, SPEAKER_NOTES.interactionRules);
  addSlideTitle(slide, 'Interaction rules  |  Skeleton');
  addVisualBox(slide, { x: G.contentX, y: 1.2, w: 2.7, h: 1.45 }, '1 · Event', 'Core Click or ACDL listen\nectaClick, faqExpand, …');
  addVisualBox(slide, { x: 3.85, y: 1.2, w: 2.7, h: 1.45 }, '2 · Update variable', 'Select EDS - Analytics Variable\nSet events, linkName, prop5');
  addVisualBox(slide, { x: 6.7, y: 1.2, w: 2.7, h: 1.45 }, '3 · Send event', 'Link click\nData = Analytics Variable');
  slide.addText('Skip page view on DOM Ready — martech already sends it. Recipes: ANALYTICS-LAUNCH-PLAN.md §4d', {
    x: G.contentX,
    y: 2.85,
    w: G.contentW,
    h: 0.35,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.grayDark,
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.liveExampleFaq);
  addSlideTitle(slide, 'Live example  |  EDS - FAQ Expand');
  addAdobeTable(slide, [
    ['Step', 'Value'],
    ['Event', 'ACDL listen · faqExpand'],
    ['Update variable', 'events = event5 · prop5 = accordion-faq'],
    ['Send event', 'Link click · Analytics Variable'],
    ['Publish', 'Development → preview QA → Production'],
  ], { x: G.contentX, y: 1.15, w: G.contentW, h: 2.0, colW: [1.5, 6.0] });
  slide.addText('Runbook: docs/ANALYTICS-LAUNCH-RUNBOOK.md', { x: G.contentX, y: 3.3, w: G.contentW, h: 0.25, fontFace: FONT.body, fontSize: 9, color: C.grayDark });

  slide = contentSlide(pptx, SPEAKER_NOTES.validateLaunch);
  addSlideTitle(slide, 'Validate Launch  |  QA checklist');
  slide.addText([
    { text: 'Preview — wait ≥ 5 seconds\n', options: { bullet: true, breakLine: true } },
    { text: 'Debugger → staging launch script\n', options: { bullet: true, breakLine: true } },
    { text: 'Trigger interaction once\n', options: { bullet: true, breakLine: true } },
    { text: 'Rules tab — correct order\n', options: { bullet: true, breakLine: true } },
    { text: 'Real-Time — event increments', options: { bullet: true } },
  ], { x: G.contentX, y: 1.15, w: 4.2, h: 2.0, fontFace: FONT.body, fontSize: 11, color: C.black });
  addVisualBox(slide, { x: 5.45, y: 1.15, w: 3.95, h: 1.55 }, 'Common fixes', [
    'Literal %EDS - …% → use getVar or getState',
    'Rule never fires → wait 5s, check embed',
    'Empty props → Page view storage',
  ]);

  // —— Part 5 ——
  dividerSlide(pptx, 'Part 5  |  Analytics admin and audiences', '22:00 – 25:00', SPEAKER_NOTES.part5Divider);

  slide = contentSlide(pptx, SPEAKER_NOTES.reportSuite);
  addSlideTitle(slide, 'Report suite  |  ags050wknd labels');
  addAdobeTable(slide, [
    ['Slot', 'Admin label'],
    ['eVar4', 'Adventure category'],
    ['prop3', 'Journey stage'],
    ['event1', 'CTA Click'],
    ['event2', 'Carousel Interaction'],
    ['event17–21', 'Quiz funnel'],
    ['eVar2', 'Quiz Result Category'],
    ['eVar8', 'Quiz Adventurer Type'],
  ], { x: G.contentX, y: 1.15, w: 5.0, h: 2.5, colW: [1.5, 3.5] });
  slide.addText('Full inventory: ANALYTICS-LAUNCH-PLAN.md Phase 3', { x: G.contentX, y: 3.85, w: G.contentW, h: 0.25, fontFace: FONT.body, fontSize: 9, color: C.grayDark });

  slide = contentSlide(pptx, SPEAKER_NOTES.segments);
  addSlideTitle(slide, 'Segments  |  Built for personalization');
  addVisualBox(slide, { x: G.contentX, y: 1.2, w: 2.7, h: 1.35 }, 'Tier 1', 'Data hygiene\nEDS - Live Traffic');
  addVisualBox(slide, { x: 3.85, y: 1.2, w: 2.7, h: 1.35 }, 'Tier 2', 'Adventure interest\nWKND - Climbing Seekers');
  addVisualBox(slide, { x: 6.7, y: 1.2, w: 2.7, h: 1.35 }, 'Tier 3', 'Journey stage\nWKND - Planners and Prep');
  slide.addText('Tier 4 archetypes → Target: WKND - Aspiring Climber = Climbing Seekers AND (Inspiration OR Discovery)', {
    x: G.contentX,
    y: 2.75,
    w: G.contentW,
    h: 0.45,
    fontFace: FONT.body,
    fontSize: 10,
    bold: true,
    color: C.black,
  });
  slide.addText('Workspace: WKND — Adventure Audiences', { x: G.contentX, y: 3.25, w: G.contentW, h: 0.25, fontFace: FONT.body, fontSize: 9, color: C.grayDark });

  slide = contentSlide(pptx, SPEAKER_NOTES.demoWorkspace);
  addSlideTitle(slide, 'Demo  |  Analysis Workspace');
  slide.addText([
    { text: 'Workspace on ags050wknd\n', options: { bullet: true, breakLine: true } },
    { text: 'Panel filter EDS - Live Traffic\n', options: { bullet: true, breakLine: true } },
    { text: 'Tier 2 segments as columns\n', options: { bullet: true, breakLine: true } },
    { text: 'Rows: Visits\n', options: { bullet: true, breakLine: true } },
    { text: 'Optional: eVar4 × prop3 table', options: { bullet: true } },
  ], { x: G.contentX, y: 1.15, w: 4.2, h: 1.8, fontFace: FONT.body, fontSize: 11, color: C.black });
  addVisualBox(slide, { x: 5.45, y: 1.15, w: 3.95, h: 1.1 }, 'Bridge to Target', 'Export Tier 4 segments as Target audiences for hero tests');

  // —— Part 6 ——
  dividerSlide(pptx, 'Part 6  |  Adobe Target end-to-end', '25:00 – 30:00', SPEAKER_NOTES.part6Divider);

  slide = contentSlide(pptx, SPEAKER_NOTES.offers);
  addSlideTitle(slide, 'Offers  |  Authoring to Target');
  [
    ['Fragment variants in Experience Workspace', true],
    ['Library → Send to Adobe Target', false],
    ['Immutable HTML offer in Target', true],
    ['Referenced by activity experience', false],
  ].forEach(([text, accent], i) => addFlowStep(slide, 1.2 + i * 0.48, text, accent));
  slide.addText('CLI: npm run target:send -- --path /fragments/hero-climbing', {
    x: G.contentX,
    y: 3.25,
    w: G.contentW,
    h: 0.25,
    fontFace: FONT.mono,
    fontSize: 8.5,
    color: C.black,
  });
  slide.addText('Offers are undecorated HTML — site re-decorates after injection.', {
    x: G.contentX,
    y: 3.55,
    w: G.contentW,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: 9,
    italic: true,
    color: C.grayDark,
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.targetZones);
  addSlideTitle(slide, 'Target zones  |  Page setup');
  slide.addText([
    { text: 'Section as direct child of main\n', options: { bullet: true, breakLine: true } },
    { text: 'Section metadata → targetlocation\n', options: { bullet: true, breakLine: true } },
    { text: 'Page metadata → Target On', options: { bullet: true } },
  ], { x: G.contentX, y: 1.15, w: 4.2, h: 1.2, fontFace: FONT.body, fontSize: 11, color: C.black });
  slide.addText('Code: applySectionMetadata() → data-targetlocation + class target', {
    x: G.contentX,
    y: 2.45,
    w: 4.2,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.black,
  });
  addVisualBox(slide, { x: 5.45, y: 1.15, w: 3.95, h: 0.85 }, 'Turn off', 'Target metadata when activity ends');

  slide = contentSlide(pptx, SPEAKER_NOTES.targetActivity);
  addSlideTitle(slide, 'Target activity  |  Console setup');
  addAdobeTable(slide, [
    ['Setting', 'Value'],
    ['Type', 'A/B Test or Experience Targeting'],
    ['Location', '[data-targetlocation="wknd-marquee"]'],
    ['Experiences', 'Control + variant HTML offers'],
    ['Audience', 'e.g. WKND - Aspiring Climber'],
    ['QA', '?at_preview_token=…'],
  ], { x: G.contentX, y: 1.15, w: G.contentW, h: 2.3, colW: [1.8, 5.2] });
  slide.addText('Admin: Disable auto global mbox · Datastream includes Target', {
    x: G.contentX,
    y: 3.6,
    w: G.contentW,
    h: 0.25,
    fontFace: FONT.body,
    fontSize: 9,
    color: C.black,
    bold: true,
  });

  slide = contentSlide(pptx, SPEAKER_NOTES.runtime);
  addSlideTitle(slide, 'Runtime  |  target-delivery.js');
  addAdobeTable(slide, [
    ['Function', 'Role'],
    ['buildTargetApplyMetadata', 'Mbox → CSS selector'],
    ['decorateTargetInjections', 'decorateBlock + loadBlock'],
    ['initTargetDelivery', 'MutationObserver'],
    ['refreshTargetZones', 'Re-decorate after lazy load'],
  ], { x: G.contentX, y: 1.15, w: 4.5, h: 1.75, colW: [2.2, 2.3] });
  slide.addText('Eager: scheduleEagerTargetDelivery()', { x: G.contentX, y: 3.0, w: 4.5, h: 0.25, fontFace: FONT.body, fontSize: 9, color: C.black });
  addVisualBox(slide, { x: 5.75, y: 1.15, w: 3.75, h: 1.35 }, 'Analytics QA', 'prop9 = target-on\nACDL targetZoneReady\nscripts/target-analytics.js');

  slide = contentSlide(pptx, SPEAKER_NOTES.targetQa);
  addSlideTitle(slide, 'Target QA  |  Before go-live');
  slide.addText([
    { text: 'Section has data-targetlocation and class target\n', options: { bullet: true, breakLine: true } },
    { text: 'Page metadata Target = On\n', options: { bullet: true, breakLine: true } },
    { text: 'Injected blocks styled and interactive\n', options: { bullet: true, breakLine: true } },
    { text: 'Target reporting shows impressions\n', options: { bullet: true, breakLine: true } },
    { text: 'PageSpeed ≥ 90 on experiment URL\n', options: { bullet: true, breakLine: true } },
    { text: 'Turn Target Off when activity ends', options: { bullet: true } },
  ], { x: G.contentX, y: 1.15, w: 5.5, h: 2.5, fontFace: FONT.body, fontSize: 11, color: C.black });
  addVisualBox(slide, { x: 6.2, y: 1.15, w: 3.2, h: 0.85 }, 'Agent workflow', 'skills/adobe-target-personalization/SKILL.md');

  slide = contentSlide(pptx, SPEAKER_NOTES.summary);
  addSlideTitle(slide, 'Summary  |  Who owns what', { fontSize: 20 });
  addAdobeTable(slide, [
    ['Code', 'Launch', 'Analytics', 'Target'],
    ['Datastream + first page view', 'Interaction mapping', 'Labels + segments', 'Activities + offers'],
    ['ACDL + block events', 'Data elements + rules', 'Workspace', 'Audiences + traffic'],
    ['Target zones + decoration', 'Libraries', 'Tier 4 archetypes', 'HTML from EW'],
  ], { x: G.contentX, y: 1.1, w: G.contentW, h: 1.6, colW: [2.0, 2.1, 2.2, 2.25] });
  slide.addText('Docs: MARTECH.md · ANALYTICS-LAUNCH-PLAN.md · ANALYTICS-LAUNCH-RUNBOOK.md · TARGET-PERSONALIZATION-PLAN.md', {
    x: G.contentX,
    y: 2.9,
    w: G.contentW,
    h: 0.35,
    fontFace: FONT.body,
    fontSize: 8.5,
    color: C.grayDark,
  });

  // —— Closer (red, final) ——
  const closer = pptx.addSlide();
  closer.background = { color: C.red };
  closer.addText('Thank you', {
    x: 0.55,
    y: 2.0,
    w: 8.0,
    h: 0.9,
    fontFace: FONT.display,
    fontSize: 40,
    color: C.white,
  });
  closer.addText('Preview: main--masterclass-demo--znikolovski.aem.page\nOptional: node tools/scripts/test-analytics-acdl.mjs', {
    x: 0.55,
    y: 3.0,
    w: 8.5,
    h: 0.65,
    fontFace: FONT.body,
    fontSize: 11,
    color: C.white,
  });
  addWordmark(closer, true);
  closer.addNotes(SPEAKER_NOTES.closer);
}

/**
 * Adobe-deck skill QA checks.
 * @param {pptxgen} pptx
 */
function qaDeck(pptx) {
  const slides = pptx.slides || [];
  const issues = [];

  if (slides.length < 3) issues.push('Deck has fewer than 3 slides.');
  if (slides[0]?.background?.color !== C.red) issues.push('First slide is not red title slide.');
  if (slides[slides.length - 1]?.background?.color !== C.red) issues.push('Last slide is not red closer.');

  slides.forEach((s, i) => {
    const bg = s.background?.color || C.white;
    const isShell = i === 0 || i === slides.length - 1 || !s._name?.includes?.('content');
    if (bg !== C.white && bg !== C.red) {
      issues.push(`Slide ${i + 1}: non-brand background ${bg}`);
    }
  });

  if (issues.length) {
    console.warn('QA warnings:\n', issues.map((x) => `  - ${x}`).join('\n'));
  } else {
    console.log('Adobe-deck QA: passed (title red, closer red, backgrounds white/red only).');
  }

  console.log(`Slides: ${slides.length}`);

  const slidesWithoutNotes = slides.filter((s) => !s._notes || s._notes.length === 0);
  if (slidesWithoutNotes.length) {
    issues.push(`${slidesWithoutNotes.length} slide(s) missing speaker notes`);
  } else {
    console.log('Speaker notes: present on all slides.');
  }

  return issues;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const pptx = new pptxgen();
  buildDeck(pptx);
  qaDeck(pptx);
  await pptx.writeFile({ fileName: OUT_FILE });
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
