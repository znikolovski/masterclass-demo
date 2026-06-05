/**
 * Realistic browser profiles for traffic simulation.
 * Adobe Analytics derives the Browser dimension from User-Agent; custom UAs
 * (e.g. WKND-DemoTraffic) report as "None" and are often flagged as bots.
 */

/** Weighted Playwright device preset names (Chromium emulates their UA/viewport). */
export const TRAFFIC_BROWSER_CATALOG = [
  { name: 'Desktop Chrome', weight: 30 },
  { name: 'Desktop Edge', weight: 14 },
  { name: 'Desktop Firefox', weight: 12 },
  { name: 'Desktop Safari', weight: 10 },
  { name: 'Pixel 7', weight: 14 },
  { name: 'iPhone 13', weight: 12 },
  { name: 'iPhone 14', weight: 8 },
];

/**
 * @param {string} visitorId
 */
function hashVisitorId(visitorId) {
  return visitorId.split('').reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 2147483647,
    0,
  );
}

/**
 * Stable device per visitor so returning sessions keep the same browser label.
 * @param {string} visitorId
 * @param {{ name: string, weight: number }[]} [catalog]
 */
export function pickBrowserDeviceForVisitor(
  visitorId,
  catalog = TRAFFIC_BROWSER_CATALOG,
) {
  const totalWeight = catalog.reduce((sum, entry) => sum + entry.weight, 0);
  let slot = hashVisitorId(visitorId) % totalWeight;
  const match = catalog.find((entry) => {
    slot -= entry.weight;
    return slot < 0;
  });
  return match ? match.name : catalog[0].name;
}

/**
 * Parse a coarse browser label from a User-Agent (for run logs / mix reports).
 * @param {string} userAgent
 */
export function browserLabelFromUserAgent(userAgent) {
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Microsoft Edge';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'Mobile Safari';
  if (ua.includes('android')) return 'Chrome Mobile';
  if (ua.includes('chrome/')) return 'Chrome';
  if (ua.includes('safari/')) return 'Safari';
  return 'Other';
}

/**
 * @param {string} deviceName
 * @param {Record<string, import('playwright').DeviceDescriptor>} devicesMap
 * @param {{ storageState?: string }} [extras]
 */
export function buildBrowserContextOptions(deviceName, devicesMap, extras = {}) {
  const device = devicesMap[deviceName];
  if (!device) {
    throw new Error(`Unknown Playwright device "${deviceName}"`);
  }

  const options = {
    userAgent: device.userAgent,
    viewport: device.viewport,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  };

  if (device.deviceScaleFactor) options.deviceScaleFactor = device.deviceScaleFactor;
  if (typeof device.isMobile === 'boolean') options.isMobile = device.isMobile;
  if (typeof device.hasTouch === 'boolean') options.hasTouch = device.hasTouch;
  if (extras.storageState) options.storageState = extras.storageState;

  return {
    options,
    deviceName,
    browserLabel: browserLabelFromUserAgent(device.userAgent),
  };
}

/**
 * @param {string[]} visitorIds
 * @param {Record<string, import('playwright').DeviceDescriptor>} devicesMap
 * @param {{ name: string, weight: number }[]} [catalog]
 */
export function summarizeBrowserMix(
  visitorIds,
  devicesMap,
  catalog = TRAFFIC_BROWSER_CATALOG,
) {
  const counts = {};
  visitorIds.forEach((visitorId) => {
    const deviceName = pickBrowserDeviceForVisitor(visitorId, catalog);
    const { browserLabel } = buildBrowserContextOptions(deviceName, devicesMap);
    counts[browserLabel] = (counts[browserLabel] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
