/**
 * Quiz scoring weights and result content for find-your-adventure.
 * @see tools/scripts/lib/adventure-page-metadata.mjs
 */

export const QUIZ_ID = 'find-your-adventure';

export const RESULTS_PATH = '/find-your-adventure/results';

/**
 * Results URL respecting local drafts folder prefix.
 * @returns {string}
 */
export function getResultsPath() {
  if (typeof window === 'undefined') return RESULTS_PATH;
  const { pathname } = window.location;
  if (pathname.startsWith('/drafts/')) {
    return '/drafts/find-your-adventure/results';
  }
  return RESULTS_PATH;
}

/** @type {readonly string[]} */
export const ALLOWED_CATEGORIES = [
  'climbing',
  'trekking',
  'water',
  'cycling',
  'winter-alpine',
  'desert',
  'photography',
  'general-outdoor',
];

/**
 * Per-question option weights keyed by normalized option label.
 * @type {Record<number, Record<string, Partial<Record<string, number>>>>}
 */
export const OPTION_WEIGHTS = {
  0: {
    mountains: { climbing: 3, 'winter-alpine': 2, trekking: 1 },
    'coast-water': { water: 3, photography: 1 },
    'desert-canyon': { desert: 3, trekking: 1 },
    'forest-trail': { trekking: 3, photography: 1, cycling: 1 },
  },
  1: {
    foot: { trekking: 2, desert: 1, photography: 1 },
    water: { water: 3 },
    wheels: { cycling: 3, trekking: 1 },
    vertical: { climbing: 3, 'winter-alpine': 2 },
  },
  2: {
    gentle: {},
    moderate: { trekking: 1, water: 1, cycling: 1 },
    expedition: { climbing: 2, 'winter-alpine': 2, desert: 1 },
  },
  3: {
    solitude: { trekking: 1, desert: 1, photography: 2 },
    community: { 'general-outdoor': 2, water: 1 },
    moments: { photography: 3 },
    limits: { climbing: 2, 'winter-alpine': 1, cycling: 1 },
  },
};

/**
 * @typedef {object} QuizExperience
 * @property {string} title
 * @property {string} path
 * @property {string} category
 * @property {string} description
 * @property {string} image
 * @property {string} imageAlt
 */

/**
 * @typedef {object} QuizResult
 * @property {string} adventurerType
 * @property {string} resultCategory
 * @property {string} tagline
 * @property {string} blurb
 * @property {string} heroImage
 * @property {string} heroImageAlt
 * @property {string} [adventureInterest]
 * @property {QuizExperience[]} experiences
 */

/** @type {Record<string, QuizResult>} */
export const QUIZ_RESULTS = {
  climbing: {
    adventurerType: 'Summit Seeker',
    resultCategory: 'climbing',
    tagline: 'Your adventurer type',
    blurb: 'You chase vertical lines and granite exposure. Start with iconic walls and build skills on real rock.',
    heroImage: 'https://wknd-adventures.com/images/activities/sport-climbing.jpg',
    heroImageAlt: 'Rock climber on a granite wall',
    adventureInterest: 'Yosemite climbing',
    experiences: [
      {
        title: 'Yosemite Rock Climbing',
        path: '/blog/yosemite-rock-climbing',
        category: 'Climbing',
        description: 'Multi-pitch classics and valley culture for aspiring wall climbers.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
        imageAlt: 'Yosemite valley climbing',
      },
      {
        title: 'Winter Mountaineering',
        path: '/blog/winter-mountaineering',
        category: 'Alpine',
        description: 'Cold-weather skills for when the summit gets serious.',
        image: 'https://wknd-adventures.com/images/activities/ice-climbing.jpg',
        imageAlt: 'Ice climbing in winter alpine terrain',
      },
    ],
  },
  trekking: {
    adventurerType: 'Trail Wanderer',
    resultCategory: 'trekking',
    tagline: 'Your adventurer type',
    blurb: 'Long trails, big horizons, and campsites that earn their views. You belong on foot in wild country.',
    heroImage: 'https://wknd-adventures.com/images/adventures/adobestock-257541512.jpeg',
    heroImageAlt: 'Hiker on a mountain trail',
    adventureInterest: 'Patagonia trek',
    experiences: [
      {
        title: 'Patagonia Trek',
        path: '/blog/patagonia-trek',
        category: 'Trekking',
        description: 'Wind, granite, and multi-day routes where weather writes the schedule.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-257541512.jpeg',
        imageAlt: 'Patagonia mountain trail',
      },
      {
        title: 'Ultralight Backpacking',
        path: '/blog/ultralight-backpacking',
        category: 'Trekking',
        description: 'Go farther with less — systems thinking for trail efficiency.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
        imageAlt: 'Backpacker on a ridge',
      },
    ],
  },
  water: {
    adventurerType: 'Tide Runner',
    resultCategory: 'water',
    tagline: 'Your adventurer type',
    blurb: 'You read tides, currents, and coastlines. Your best days start where land meets water.',
    heroImage: 'https://wknd-adventures.com/images/activities/sport-climbing.jpg',
    heroImageAlt: 'Kayaker on open water',
    adventureInterest: 'Wild swimming',
    experiences: [
      {
        title: 'Wild Swimming Guide',
        path: '/blog/wild-swimming-guide',
        category: 'Water',
        description: 'Cold plunges, hidden pools, and the joy of swimming off the map.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
        imageAlt: 'Wild swimming in a mountain lake',
      },
      {
        title: 'Norway Kayaking',
        path: '/blog/kayaking-norway',
        category: 'Water',
        description: 'Fjords, midnight sun, and paddle-powered exploration.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-257541512.jpeg',
        imageAlt: 'Kayaking in Norway',
      },
      {
        title: 'Surfing Costa Rica',
        path: '/blog/surfing-costa-rica',
        category: 'Water',
        description: 'Warm water, consistent swell, and a laid-back surf culture.',
        image: 'https://wknd-adventures.com/images/activities/sport-climbing.jpg',
        imageAlt: 'Surfer in Costa Rica',
      },
    ],
  },
  cycling: {
    adventurerType: 'Alpine Rider',
    resultCategory: 'cycling',
    tagline: 'Your adventurer type',
    blurb: 'Elevation, switchbacks, and the hum of tires on mountain roads — speed with scenery.',
    heroImage: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
    heroImageAlt: 'Cyclist on an alpine road',
    adventureInterest: 'Alpine cycling',
    experiences: [
      {
        title: 'Alpine Cycling',
        path: '/blog/alpine-cycling',
        category: 'Cycling',
        description: 'High passes, long climbs, and descents worth every pedal stroke.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-257541512.jpeg',
        imageAlt: 'Alpine cycling route',
      },
    ],
  },
  'winter-alpine': {
    adventurerType: 'Frostline Explorer',
    resultCategory: 'winter-alpine',
    tagline: 'Your adventurer type',
    blurb: 'Snow, ice, and thin air — you thrive where conditions demand respect and preparation.',
    heroImage: 'https://wknd-adventures.com/images/activities/ice-climbing.jpg',
    heroImageAlt: 'Winter mountaineering in alpine terrain',
    adventureInterest: 'Winter mountaineering',
    experiences: [
      {
        title: 'Winter Mountaineering',
        path: '/blog/winter-mountaineering',
        category: 'Winter',
        description: 'Crampons, axes, and the discipline of cold-weather alpine travel.',
        image: 'https://wknd-adventures.com/images/activities/ice-climbing.jpg',
        imageAlt: 'Winter mountaineering',
      },
    ],
  },
  desert: {
    adventurerType: 'Desert Nomad',
    resultCategory: 'desert',
    tagline: 'Your adventurer type',
    blurb: 'Wide skies, red rock, and self-reliance in arid landscapes draw you in.',
    heroImage: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
    heroImageAlt: 'Desert canyon landscape',
    adventureInterest: 'Desert survival',
    experiences: [
      {
        title: 'Desert Survival Guide',
        path: '/blog/desert-survival-guide',
        category: 'Desert',
        description: 'Navigation, hydration, and reading the land in harsh environments.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-257541512.jpeg',
        imageAlt: 'Desert landscape',
      },
    ],
  },
  photography: {
    adventurerType: 'Lens & Landscape',
    resultCategory: 'photography',
    tagline: 'Your adventurer type',
    blurb: 'You chase light and composition as much as miles. The journey is the frame.',
    heroImage: 'https://wknd-adventures.com/images/adventures/adobestock-257541512.jpeg',
    heroImageAlt: 'Mountain landscape at golden hour',
    adventureInterest: 'Mountain photography',
    experiences: [
      {
        title: 'Mountain Photography',
        path: '/blog/mountain-photography',
        category: 'Photography',
        description: 'Gear, timing, and field craft for alpine and adventure imagery.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
        imageAlt: 'Mountain photography scene',
      },
    ],
  },
  'general-outdoor': {
    adventurerType: 'Open Horizon',
    resultCategory: 'general-outdoor',
    tagline: 'Your adventurer type',
    blurb: 'You keep options open — any landscape, any season. Explore broadly and follow what excites you.',
    heroImage: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
    heroImageAlt: 'Wide outdoor landscape',
    experiences: [
      {
        title: 'Explore Adventures',
        path: '/adventures',
        category: 'Discovery',
        description: 'Browse trips, routes, and stories across every WKND category.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-257541512.jpeg',
        imageAlt: 'Outdoor adventure landscape',
      },
      {
        title: 'Destinations',
        path: '/destinations',
        category: 'Discovery',
        description: 'Find your next region — from coastlines to high alpine.',
        image: 'https://wknd-adventures.com/images/adventures/adobestock-140634652.jpeg',
        imageAlt: 'Adventure destinations',
      },
      {
        title: 'Expeditions',
        path: '/expeditions',
        category: 'Planning',
        description: 'Go deeper with guided and self-supported expedition ideas.',
        image: 'https://wknd-adventures.com/images/activities/ice-climbing.jpg',
        imageAlt: 'Expedition planning',
      },
    ],
  },
};

/**
 * @param {string} label
 * @returns {string}
 */
export function normalizeOptionKey(label) {
  return label
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * @param {string} [raw]
 * @returns {string}
 */
export function sanitizeResultCategory(raw) {
  const value = (raw || '').toLowerCase().trim();
  return ALLOWED_CATEGORIES.includes(value) ? value : 'general-outdoor';
}

/**
 * @param {string[]} selections Normalized option keys per question
 * @returns {string}
 */
export function scoreQuizResult(selections) {
  const totals = Object.fromEntries(ALLOWED_CATEGORIES.map((c) => [c, 0]));

  selections.forEach((selection, questionIndex) => {
    const weights = OPTION_WEIGHTS[questionIndex]?.[selection];
    if (!weights) return;
    Object.entries(weights).forEach(([category, points]) => {
      totals[category] = (totals[category] || 0) + points;
    });
  });

  let winner = 'general-outdoor';
  let high = totals[winner] || 0;
  ALLOWED_CATEGORIES.forEach((category) => {
    if ((totals[category] || 0) > high) {
      high = totals[category];
      winner = category;
    }
  });

  if (high === 0 && selections[0]) {
    const fallback = OPTION_WEIGHTS[0]?.[selections[0]];
    if (fallback) {
      const [top] = Object.entries(fallback).sort((a, b) => b[1] - a[1]);
      if (top) {
        const [category] = top;
        winner = category;
      }
    }
  }

  return winner;
}

/**
 * @param {string} category
 * @returns {QuizResult}
 */
export function getQuizResult(category) {
  const key = sanitizeResultCategory(category);
  return QUIZ_RESULTS[key] || QUIZ_RESULTS['general-outdoor'];
}
