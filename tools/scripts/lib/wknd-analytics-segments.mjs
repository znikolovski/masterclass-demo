/**
 * WKND + EDS Analytics segment definitions for report suite ags050wknd.
 * Workspace-compatible (oberon); uses Page not Page URL per ANALYTICS-LAUNCH-PLAN.md.
 * @see docs/ANALYTICS-LAUNCH-PLAN.md Phase 4
 */

export const RSID = 'ags050wknd';
export const REPORT_SUITE_NAME = 'WKND Adventures Demo';

/** Dimension paths used across segments */
const D = {
  page: 'variables/page',
  evar2: 'variables/evar2',
  evar4: 'variables/evar4',
  prop3: 'variables/prop3',
  prop1: 'variables/prop1',
  evar1: 'variables/evar1',
  prop9: 'variables/prop9',
  marketingChannel: 'variables/marketingchannel',
  campaign: 'variables/campaign',
};

/** Quiz result categories — keep in sync with blocks/adventure-quiz/quiz-data.js */
const QUIZ_RESULT_CATEGORIES = [
  { id: 'climbing', label: 'Climbing' },
  { id: 'trekking', label: 'Trekking' },
  { id: 'water', label: 'Water' },
  { id: 'cycling', label: 'Cycling' },
  { id: 'winter-alpine', label: 'Winter & Alpine' },
  { id: 'desert', label: 'Desert' },
  { id: 'photography', label: 'Photography' },
  { id: 'general-outdoor', label: 'General Outdoor' },
];

function attr(name) {
  return { func: 'attr', name };
}

function streqDim(dim, str, description) {
  return {
    func: 'streq',
    val: attr(dim),
    str,
    description,
  };
}

function containsDim(dim, str, description) {
  return {
    func: 'contains',
    val: attr(dim),
    str,
    description,
  };
}

function existsDim(dim, description) {
  return {
    func: 'exists',
    val: attr(dim),
    description,
  };
}

function orPreds(preds) {
  return { func: 'or', preds };
}

function andPreds(preds) {
  return { func: 'and', preds };
}

function withoutPred(pred) {
  return { func: 'without', pred };
}

function eventExists(eventNum, description) {
  return {
    func: 'event-exists',
    evt: { func: 'event', name: `metrics/event${eventNum}` },
    description: description || `event${eventNum} exists`,
  };
}

function visitsGt(num, description) {
  return {
    func: 'gt',
    val: {
      func: 'total',
      evt: { func: 'event', name: 'metrics/visits' },
    },
    num,
    description: description || `Visits greater than ${num}`,
  };
}

function buildSegment(name, description, context, pred, schemaDims) {
  const schema = [
    ...schemaDims.map((dim) => `attribute_${dim}`),
    `container_${context}`,
  ];
  return {
    name,
    description,
    rsid: RSID,
    report_suite: RSID,
    reportSuiteName: REPORT_SUITE_NAME,
    definition: {
      func: 'segment',
      version: [1, 0, 0],
      container: {
        func: 'container',
        context,
        pred,
      },
    },
    compatibility: {
      schema,
      validator_version: '1.1.19',
      supported_products: ['oberon'],
      supported_schema: ['schema_oberon'],
    },
  };
}

function hitSegment(name, description, pred, schemaDims) {
  return buildSegment(name, description, 'hits', pred, schemaDims);
}

function visitSegment(name, description, pred, schemaDims) {
  return buildSegment(name, description, 'visits', pred, schemaDims);
}

function visitorSegment(name, description, pred, schemaDims) {
  return buildSegment(name, description, 'visitors', pred, schemaDims);
}

function interestVisitSegment(name, category, pageTerms, description) {
  const preds = [
    streqDim(D.evar4, category, `eVar4 equals ${category}`),
    ...pageTerms.map((term) => containsDim(D.page, term, `Page contains ${term}`)),
  ];
  return visitSegment(
    name,
    description || `Visit includes ${category} adventure interest (metadata or URL).`,
    orPreds(preds),
    [D.evar4, D.page],
  );
}

function journeyVisitSegment(name, stage, pageTerms, description) {
  const preds = [
    streqDim(D.prop3, stage, `Journey stage equals ${stage}`),
    ...pageTerms.map((term) => containsDim(D.page, term, `Page contains ${term}`)),
  ];
  return visitSegment(
    name,
    description || `Visit includes ${stage} journey content.`,
    orPreds(preds),
    [D.prop3, D.page],
  );
}

/** @type {Record<string, object>} */
export const INTEREST_SEGMENTS = {
  climbing: interestVisitSegment(
    'WKND - Climbing Seekers',
    'climbing',
    ['climbing', 'yosemite', 'ice-climbing'],
  ),
  trekking: interestVisitSegment(
    'WKND - Trekking & Hiking',
    'trekking',
    ['trek', 'backpacking', 'patagonia', 'hiking'],
  ),
  winter: interestVisitSegment(
    'WKND - Winter & Alpine',
    'winter-alpine',
    ['winter', 'mountaineering', 'alpine'],
  ),
  cycling: interestVisitSegment(
    'WKND - Cycling Adventurers',
    'cycling',
    ['cycling', 'alpine-cycling'],
  ),
  water: interestVisitSegment(
    'WKND - Water Adventurers',
    'water',
    ['kayak', 'surfing', 'swimming', 'norway'],
  ),
  desert: interestVisitSegment(
    'WKND - Desert Explorers',
    'desert',
    ['desert', 'survival'],
  ),
  photography: interestVisitSegment(
    'WKND - Photography & Story',
    'photography',
    ['photography', 'field-notes'],
  ),
};

export const WKND_SEGMENTS = [
  // Tier 1 — operational
  hitSegment(
    'EDS - Live Traffic',
    'Production traffic on *.aem.live (prop1 = live).',
    streqDim(D.prop1, 'live', 'Environment equals live'),
    [D.prop1],
  ),
  hitSegment(
    'EDS - Preview Traffic',
    'Preview traffic on *.aem.page (prop1 = preview).',
    streqDim(D.prop1, 'preview', 'Environment equals preview'),
    [D.prop1],
  ),
  hitSegment(
    'EDS - Non-Production (exclude)',
    'Exclude preview and local environments from exec reporting.',
    orPreds([
      streqDim(D.prop1, 'preview', 'Environment equals preview'),
      streqDim(D.prop1, 'local', 'Environment equals local'),
    ]),
    [D.prop1],
  ),

  // Tier 2 — adventure interest
  ...Object.values(INTEREST_SEGMENTS),
  visitSegment(
    'WKND - Broad Outdoor Browse',
    'General outdoor interest or top-of-funnel browse (/adventures, homepage).',
    orPreds([
      streqDim(D.evar4, 'general-outdoor', 'eVar4 equals general-outdoor'),
      containsDim(D.page, '/adventures', 'Page contains /adventures'),
      streqDim(D.page, '/', 'Homepage entry'),
    ]),
    [D.evar4, D.page],
  ),

  // Tier 3 — journey stage
  journeyVisitSegment(
    'WKND - Inspiration Readers',
    'inspiration',
    ['/blog', '/field-notes'],
    'Editorial and inspiration content in the visit.',
  ),
  journeyVisitSegment(
    'WKND - Discovery Browsers',
    'discovery',
    ['/adventures', '/destinations'],
    'Adventure and destination discovery in the visit.',
  ),
  journeyVisitSegment(
    'WKND - Planners & Prep',
    'planning',
    ['/expeditions', '/gear', '/faq', '/basecamp'],
    'Trip planning and preparation content in the visit.',
  ),
  journeyVisitSegment(
    'WKND - Community & Values',
    'community',
    ['/community', '/sustainability', '/about'],
    'Community and values content in the visit.',
  ),
  visitSegment(
    'WKND - Inspired → Planning',
    'Same visit includes inspiration and planning content.',
    andPreds([
      orPreds([
        streqDim(D.prop3, 'inspiration', 'Journey stage inspiration'),
        containsDim(D.page, '/blog', 'Page contains /blog'),
        containsDim(D.page, '/field-notes', 'Page contains /field-notes'),
      ]),
      orPreds([
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
        containsDim(D.page, '/gear', 'Page contains /gear'),
        containsDim(D.page, '/faq', 'Page contains /faq'),
        containsDim(D.page, '/basecamp', 'Page contains /basecamp'),
      ]),
    ]),
    [D.prop3, D.page],
  ),
  visitSegment(
    'WKND - Discovery → Planning',
    'Same visit includes discovery and planning content.',
    andPreds([
      orPreds([
        streqDim(D.prop3, 'discovery', 'Journey stage discovery'),
        containsDim(D.page, '/adventures', 'Page contains /adventures'),
        containsDim(D.page, '/destinations', 'Page contains /destinations'),
      ]),
      orPreds([
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
        containsDim(D.page, '/gear', 'Page contains /gear'),
      ]),
    ]),
    [D.prop3, D.page],
  ),
  visitSegment(
    'WKND - Gear-Focused Planners',
    'Planning visit with gear page engagement.',
    andPreds([
      orPreds([
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
        containsDim(D.page, '/gear', 'Page contains /gear'),
      ]),
      containsDim(D.page, '/gear', 'Page contains /gear'),
    ]),
    [D.prop3, D.page],
  ),
  visitSegment(
    'WKND - Destination Researchers',
    'Visitors comparing destinations or expeditions.',
    orPreds([
      containsDim(D.page, '/destinations', 'Page contains /destinations'),
      containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
    ]),
    [D.page],
  ),

  // Tier 4 — archetypes
  visitSegment(
    'WKND - Aspiring Climber',
    'Climbing interest with inspiration or discovery (not yet deep planning).',
    andPreds([
      INTEREST_SEGMENTS.climbing.definition.container.pred,
      orPreds([
        streqDim(D.prop3, 'inspiration', 'Journey stage inspiration'),
        streqDim(D.prop3, 'discovery', 'Journey stage discovery'),
        containsDim(D.page, '/blog', 'Page contains /blog'),
        containsDim(D.page, '/adventures', 'Page contains /adventures'),
      ]),
    ]),
    [D.evar4, D.page, D.prop3],
  ),
  visitSegment(
    'WKND - Climber Ready to Book',
    'Climbing interest plus planning content in the same visit.',
    andPreds([
      INTEREST_SEGMENTS.climbing.definition.container.pred,
      orPreds([
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
        containsDim(D.page, '/gear', 'Page contains /gear'),
        containsDim(D.page, '/faq', 'Page contains /faq'),
      ]),
    ]),
    [D.evar4, D.page, D.prop3],
  ),
  visitSegment(
    'WKND - Trekker Planner',
    'Trekking interest with planning content.',
    andPreds([
      INTEREST_SEGMENTS.trekking.definition.container.pred,
      orPreds([
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
        containsDim(D.page, '/gear', 'Page contains /gear'),
      ]),
    ]),
    [D.evar4, D.page, D.prop3],
  ),
  visitSegment(
    'WKND - Water Trip Planner',
    'Water adventure interest with discovery or planning.',
    andPreds([
      INTEREST_SEGMENTS.water.definition.container.pred,
      orPreds([
        streqDim(D.prop3, 'discovery', 'Journey stage discovery'),
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/destinations', 'Page contains /destinations'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
      ]),
    ]),
    [D.evar4, D.page, D.prop3],
  ),
  visitSegment(
    'WKND - Winter Expedition Interest',
    'Winter/alpine interest with discovery or planning.',
    andPreds([
      INTEREST_SEGMENTS.winter.definition.container.pred,
      orPreds([
        streqDim(D.prop3, 'discovery', 'Journey stage discovery'),
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
      ]),
    ]),
    [D.evar4, D.page, D.prop3],
  ),
  visitSegment(
    'WKND - Weekend Browser',
    'Broad browse + inspiration without planning (top-of-funnel).',
    andPreds([
      orPreds([
        streqDim(D.evar4, 'general-outdoor', 'eVar4 general-outdoor'),
        containsDim(D.page, '/adventures', 'Page contains /adventures'),
      ]),
      orPreds([
        streqDim(D.prop3, 'inspiration', 'Journey stage inspiration'),
        containsDim(D.page, '/blog', 'Page contains /blog'),
        containsDim(D.page, '/field-notes', 'Page contains /field-notes'),
      ]),
      withoutPred(orPreds([
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
        containsDim(D.page, '/gear', 'Page contains /gear'),
      ])),
    ]),
    [D.evar4, D.page, D.prop3],
  ),
  visitorSegment(
    'WKND - Returning Adventure Reader',
    'Repeat visitor with inspiration content in any visit.',
    andPreds([
      visitsGt(1, 'More than one visit'),
      orPreds([
        streqDim(D.prop3, 'inspiration', 'Journey stage inspiration'),
        containsDim(D.page, '/blog', 'Page contains /blog'),
        containsDim(D.page, '/field-notes', 'Page contains /field-notes'),
      ]),
    ]),
    [D.prop3, D.page, 'metrics/visits'],
  ),
  visitorSegment(
    'WKND - Returning Planner',
    'Repeat visitor with planning content.',
    andPreds([
      visitsGt(1, 'More than one visit'),
      orPreds([
        streqDim(D.prop3, 'planning', 'Journey stage planning'),
        containsDim(D.page, '/expeditions', 'Page contains /expeditions'),
        containsDim(D.page, '/gear', 'Page contains /gear'),
      ]),
    ]),
    [D.prop3, D.page, 'metrics/visits'],
  ),

  // Tier 5 — acquisition
  visitSegment(
    'WKND - Search-Driven Adventurers',
    'Natural search entry with any adventure interest signal.',
    andPreds([
      containsDim(D.marketingChannel, 'Natural Search', 'Marketing channel natural search'),
      orPreds([
        existsDim(D.evar4, 'Adventure category set'),
        containsDim(D.page, '/blog', 'Page contains /blog'),
        containsDim(D.page, '/adventures', 'Page contains /adventures'),
      ]),
    ]),
    [D.marketingChannel, D.evar4, D.page],
  ),
  visitSegment(
    'WKND - Social Inspiration Traffic',
    'Social network referral with inspiration content.',
    andPreds([
      containsDim(D.marketingChannel, 'Social', 'Marketing channel social'),
      orPreds([
        streqDim(D.prop3, 'inspiration', 'Journey stage inspiration'),
        containsDim(D.page, '/blog', 'Page contains /blog'),
        containsDim(D.page, '/field-notes', 'Page contains /field-notes'),
      ]),
    ]),
    [D.marketingChannel, D.prop3, D.page],
  ),
  visitSegment(
    'WKND - Direct Loyal Audience',
    'Direct entry from a returning visitor.',
    andPreds([
      containsDim(D.marketingChannel, 'Direct', 'Marketing channel direct'),
      visitsGt(1, 'More than one visit in visitor history'),
    ]),
    [D.marketingChannel, 'metrics/visits'],
  ),
  visitSegment(
    'WKND - Campaign-Driven Visit',
    'Visit with internal campaign or tracking code.',
    orPreds([
      existsDim(D.evar1, 'Internal campaign eVar1'),
      existsDim(D.campaign, 'Campaign exists'),
    ]),
    [D.evar1, D.campaign],
  ),

  // Tier 6 — Target QA
  visitSegment(
    'WKND - Target Test Audience',
    'Pages with Target personalization enabled (prop9 = target-on).',
    streqDim(D.prop9, 'target-on', 'Target enabled on page'),
    [D.prop9],
  ),
  visitSegment(
    'WKND - Climbing + Preview',
    'Climbing interest on preview environment for activity QA.',
    andPreds([
      INTEREST_SEGMENTS.climbing.definition.container.pred,
      streqDim(D.prop1, 'preview', 'Environment equals preview'),
    ]),
    [D.evar4, D.page, D.prop1],
  ),

  // Appendix — behavioral
  visitSegment(
    'EDS - CTA Clickers',
    'Visit includes a primary CTA click (event1).',
    eventExists(1, 'CTA click event1'),
    ['metrics/event1'],
  ),
  visitSegment(
    'EDS - Video Starters',
    'Visit includes video start (event3).',
    eventExists(3, 'Video start event3'),
    ['metrics/event3'],
  ),
  visitSegment(
    'EDS - Carousel Engaged',
    'Visit includes carousel interaction (event2).',
    eventExists(2, 'Carousel event2'),
    ['metrics/event2'],
  ),

  // Quiz funnel — see docs/QUIZ-ANALYTICS-PLAN.md
  visitSegment(
    'WKND - Quiz Page Visitor',
    'Visit includes find-your-adventure quiz page (URL fallback until event16 Launch rule is live).',
    andPreds([
      containsDim(D.page, '/find-your-adventure', 'Page contains quiz path'),
      withoutPred(containsDim(D.page, '/find-your-adventure/results', 'Exclude results page')),
    ]),
    [D.page],
  ),
  visitSegment(
    'WKND - Quiz Results Visitor',
    'Visit includes quiz results page (URL fallback until event19 Launch rule is live).',
    containsDim(D.page, '/find-your-adventure/results', 'Page contains quiz results path'),
    [D.page],
  ),
  visitSegment(
    'WKND - Quiz Starter',
    'Visit includes find-your-adventure quiz start (event16).',
    eventExists(16, 'Quiz Start event16'),
    ['metrics/event16'],
  ),
  visitSegment(
    'WKND - Quiz Completer',
    'Visit includes quiz completion (event18).',
    eventExists(18, 'Quiz Complete event18'),
    ['metrics/event18'],
  ),
  ...QUIZ_RESULT_CATEGORIES.map(({ id, label }) => visitSegment(
    `WKND - Quiz Result: ${label}`,
    `Completed find-your-adventure quiz with result category ${id} (event18 + eVar2).`,
    andPreds([
      eventExists(18, 'Quiz Complete event18'),
      streqDim(D.evar2, id, `eVar2 equals ${id}`),
    ]),
    [D.evar2, 'metrics/event18'],
  )),
];
