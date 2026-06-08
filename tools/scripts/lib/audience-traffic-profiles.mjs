/**
 * Audience journey profiles aligned with WKND Analytics segments (Phase 4).
 * Each journey is an ordered path list on one visit (prop3 / eVar4 derive from paths).
 */

/** @type {Record<string, { label: string, journeys: string[][] }>} */
export const AUDIENCE_PROFILES = {
  climbingSeekers: {
    label: 'WKND - Climbing Seekers',
    journeys: [
      ['/blog/yosemite-rock-climbing', '/expeditions', '/gear'],
      ['/adventures', '/blog/yosemite-rock-climbing', '/faq'],
      ['/blog/yosemite-rock-climbing', '/destinations'],
      ['/blog/yosemite-rock-climbing'],
    ],
  },
  trekkingHiking: {
    label: 'WKND - Trekking & Hiking',
    journeys: [
      ['/blog/patagonia-trek', '/expeditions', '/gear'],
      ['/blog/ultralight-backpacking', '/basecamp', '/faq'],
      ['/adventures', '/blog/patagonia-trek'],
      ['/blog/patagonia-trek'],
    ],
  },
  winterAlpine: {
    label: 'WKND - Winter & Alpine',
    journeys: [
      ['/blog/winter-mountaineering', '/gear', '/expeditions'],
      ['/adventures', '/blog/winter-mountaineering'],
      ['/blog/winter-mountaineering', '/faq'],
    ],
  },
  cyclingAdventurers: {
    label: 'WKND - Cycling Adventurers',
    journeys: [
      ['/blog/alpine-cycling', '/gear', '/expeditions'],
      ['/adventures', '/blog/alpine-cycling'],
      ['/blog/alpine-cycling'],
    ],
  },
  waterAdventurers: {
    label: 'WKND - Water Adventurers',
    journeys: [
      ['/blog/kayaking-norway', '/destinations', '/expeditions'],
      ['/blog/surfing-costa-rica', '/blog/wild-swimming-guide'],
      ['/blog/wild-swimming-guide', '/adventures'],
      ['/blog/surfing-costa-rica'],
    ],
  },
  desertExplorers: {
    label: 'WKND - Desert Explorers',
    journeys: [
      ['/blog/desert-survival-guide', '/gear', '/basecamp'],
      ['/adventures', '/blog/desert-survival-guide'],
      ['/blog/desert-survival-guide'],
    ],
  },
  photographyStory: {
    label: 'WKND - Photography & Story',
    journeys: [
      ['/blog/mountain-photography', '/field-notes'],
      ['/field-notes', '/blog/mountain-photography'],
      ['/blog/mountain-photography', '/'],
    ],
  },
  broadOutdoorBrowse: {
    label: 'WKND - Broad Outdoor Browse',
    journeys: [
      ['/', '/adventures'],
      ['/adventures', '/'],
      ['/adventures', '/destinations'],
      ['/'],
    ],
  },
  inspirationReaders: {
    label: 'WKND - Inspiration Readers',
    journeys: [
      ['/', '/blog/mountain-photography', '/field-notes'],
      ['/field-notes', '/blog/wild-swimming-guide'],
      ['/blog/alpine-cycling', '/field-notes'],
      ['/blog/mountain-photography'],
    ],
  },
  discoveryBrowsers: {
    label: 'WKND - Discovery Browsers',
    journeys: [
      ['/adventures', '/destinations'],
      ['/destinations', '/adventures', '/blog/patagonia-trek'],
      ['/adventures', '/blog/surfing-costa-rica'],
      ['/blog/patagonia-trek', '/adventures'],
      ['/destinations'],
    ],
  },
  formExplorers: {
    label: 'WKND - Form Explorers',
    journeys: [
      ['/adventures'],
      ['/blog/patagonia-trek', '/adventures'],
      ['/blog/yosemite-rock-climbing', '/adventures'],
      ['/adventures', '/blog/kayaking-norway'],
    ],
  },
  plannersPrep: {
    label: 'WKND - Planners & Prep',
    journeys: [
      ['/expeditions', '/gear', '/faq'],
      ['/gear', '/basecamp', '/faq'],
      ['/faq', '/expeditions', '/gear'],
      ['/basecamp', '/gear'],
    ],
  },
  communityValues: {
    label: 'WKND - Community & Values',
    journeys: [
      ['/community', '/sustainability'],
      ['/about', '/community'],
      ['/sustainability', '/about'],
      ['/community'],
    ],
  },
  inspiredToPlanning: {
    label: 'WKND - Inspired → Planning',
    journeys: [
      ['/blog/mountain-photography', '/field-notes', '/expeditions', '/gear'],
      ['/', '/blog/wild-swimming-guide', '/faq', '/gear'],
      ['/field-notes', '/blog/yosemite-rock-climbing', '/expeditions'],
    ],
  },
  climberReadyToBook: {
    label: 'WKND - Climber Ready to Book',
    journeys: [
      ['/blog/yosemite-rock-climbing', '/expeditions', '/gear', '/faq'],
      ['/adventures', '/blog/yosemite-rock-climbing', '/basecamp', '/gear'],
    ],
  },
  weekendBrowser: {
    label: 'WKND - Weekend Browser',
    journeys: [
      ['/', '/adventures', '/blog/mountain-photography'],
      ['/adventures', '/field-notes', '/blog/surfing-costa-rica'],
      ['/', '/blog/wild-swimming-guide'],
    ],
  },
  destinationResearchers: {
    label: 'WKND - Destination Researchers',
    journeys: [
      ['/destinations', '/expeditions'],
      ['/destinations', '/blog/kayaking-norway', '/expeditions'],
      ['/expeditions', '/destinations'],
    ],
  },
};

export const PROFILE_IDS = Object.keys(AUDIENCE_PROFILES);
