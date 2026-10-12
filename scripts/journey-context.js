export const JOURNEY_TTL = 24 * 60 * 60 * 1000;
export const JOURNEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADVENTURE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeJourney(value, now = Date.now()) {
  if (!value || !JOURNEY_ID_PATTERN.test(value.id)
    || !Number.isSafeInteger(value.createdAt)
    || value.createdAt > now + 60000 || now - value.createdAt >= JOURNEY_TTL
    || !['web', 'llm-app'].includes(value.source)
    || (value.source === 'llm-app' && value.tool !== 'discover_adventures')
    || (value.assisted !== undefined && typeof value.assisted !== 'boolean')) return null;
  const adventure = typeof value.adventure === 'string' && value.adventure.length <= 80
    && ADVENTURE_PATTERN.test(value.adventure) ? value.adventure : '';
  return {
    id: value.id.toLowerCase(),
    createdAt: value.createdAt,
    source: value.source,
    tool: value.source === 'llm-app' ? value.tool : '',
    assisted: value.assisted === true,
    adventure,
  };
}

export function journeyFromUrl(url) {
  const p = url.searchParams;
  return normalizeJourney({
    id: p.get('wj'),
    createdAt: Number(p.get('wjt')),
    source: p.get('wjs'),
    tool: p.get('wjo'),
    assisted: p.get('wja') === '1',
    adventure: p.get('adv'),
  });
}

export function isJourneyHost(hostname) {
  return hostname === 'wknd-adventures.run.place'
    || /^[a-z0-9-]+--(?:masterclass-demo|wknd-aero)--znikolovski\.aem\.(?:page|live|network)$/.test(hostname);
}

export function isAeroUrl(url) {
  return url.protocol === 'https:' && isJourneyHost(url.hostname)
    && url.hostname.includes('--wknd-aero--');
}

export function addJourneyToUrl(value, context, base) {
  const url = new URL(value, base);
  const journey = normalizeJourney(context);
  if (!journey || url.protocol !== 'https:' || !isJourneyHost(url.hostname)) return url.href;
  url.searchParams.delete('adobe_mc');
  url.searchParams.set('wj', journey.id);
  url.searchParams.set('wjt', String(journey.createdAt));
  url.searchParams.set('wjs', journey.source);
  url.searchParams.set('wjo', journey.tool);
  url.searchParams.set('wja', journey.assisted ? '1' : '0');
  if (journey.adventure && !url.searchParams.has('adv')) {
    url.searchParams.set('adv', journey.adventure);
  }
  return url.href;
}

export function sanitizeJourneyUrl(value, base) {
  if (!value) return value;
  try {
    const url = new URL(value, base);
    ['llm_app_ctx', 'q', 'prompt', 'adobe_mc'].forEach((key) => url.searchParams.delete(key));
    if (url.hash.startsWith('#sherpa?')) url.hash = '#sherpa';
    return url.href;
  } catch {
    return '';
  }
}
