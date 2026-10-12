import {
  normalizeJourney, journeyFromUrl, addJourneyToUrl, isAeroUrl, sanitizeJourneyUrl,
} from './journey-context.js';

export const JOURNEY_EVENTS = {
  llmAppResult: 30,
  llmAppHandoff: 31,
  of1Search: 32,
  of1Results: 33,
  sherpaOpen: 34,
  sherpaMessageAttempt: 35,
  aeroHandoff: 36,
  flightSearchStart: 37,
  bookingStart: 38,
  bookingStep: 39,
  bookingComplete: 40,
  bookingError: 41,
};
const STORAGE_KEY = 'wknd:journey';
const MILESTONES_KEY = 'wknd:milestones';
const MAX_MILESTONES = 256;
let initialized = false;
let current;
let storageWarning = false;
const emitted = new Set();
let milestoneJourney;

function storage(method, key, value) {
  try {
    return window.sessionStorage[method](key, value);
  } catch (error) {
    if (!storageWarning) {
      storageWarning = true;
      // eslint-disable-next-line no-console
      console.warn('WKND journey storage unavailable; attribution is held in memory.', error.name);
    }
    return null;
  }
}

export function saveJourney(value) {
  current = normalizeJourney(value);
  if (current) storage('setItem', STORAGE_KEY, JSON.stringify(current));
  return current;
}

export function getJourney(create = true) {
  if (typeof window === 'undefined') return null;
  if (!initialized) {
    initialized = true;
    const url = new URL(window.location.href);
    current = journeyFromUrl(url);
    const stored = storage('getItem', STORAGE_KEY);
    let previous;
    if (stored) {
      try {
        previous = normalizeJourney(JSON.parse(stored));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Invalid WKND journey storage discarded.', error.name);
      }
    }
    if (url.searchParams.has('wj') && !current) {
      // eslint-disable-next-line no-console
      console.warn('Invalid or expired WKND journey handoff discarded.');
      storage('removeItem', STORAGE_KEY);
    } else if (!current) {
      current = previous;
    } else if (previous?.id === current.id) {
      current.assisted ||= previous.assisted;
      current.adventure ||= previous.adventure;
    }
    if (current) saveJourney(current);
  }
  current = normalizeJourney(current);
  if (!current && create) {
    saveJourney({
      id: crypto.randomUUID(), createdAt: Date.now(), source: 'web', assisted: false,
    });
  }
  return current;
}

export function journeyEventPayload(stage, detail = {}, context = getJourney()) {
  const journey = normalizeJourney(context);
  if (!journey || (!JOURNEY_EVENTS[stage] && !['of1Arrival', 'aeroArrival'].includes(stage))) {
    throw new Error(`Invalid WKND journey event: ${stage}`);
  }
  const data = { ...journey, stage };
  if (Number.isInteger(detail.step) && detail.step >= 0 && detail.step <= 3) {
    data.step = detail.step;
  }
  if (stage === 'bookingComplete') {
    const { booking } = detail;
    if (!/^BK_[0-9a-f]{12,16}$/i.test(booking?.id) || booking.status !== 'confirmed'
      || !Number.isFinite(booking.total) || booking.total < 0
      || !/^[A-Z]{3}$/.test(booking.currency) || typeof booking.demo !== 'boolean') {
      throw new Error('Invalid confirmed booking analytics');
    }
    data.bookingId = booking.id;
    data.total = booking.total;
    data.currency = booking.currency;
    data.demo = booking.demo;
  }
  if (stage === 'bookingError') {
    data.reason = ['network', 'http', 'invalid-response'].includes(detail.reason)
      ? detail.reason : 'invalid-response';
  }
  return {
    event: 'wkndJourney',
    xdm: {
      eventType: 'web.webinteraction.linkClicks',
      web: { webInteraction: { name: stage, type: 'other', linkClicks: { value: 1 } } },
    },
    data: { wkndJourney: data },
  };
}

export function pushJourneyEvent(stage, detail = {}) {
  const context = getJourney();
  const key = detail.onceKey ? `${context.id}:${stage}:${detail.onceKey}` : '';
  if (key && milestoneJourney !== context.id) {
    milestoneJourney = context.id;
    emitted.clear();
    const stored = storage('getItem', MILESTONES_KEY);
    if (stored) {
      try {
        const previous = JSON.parse(stored);
        if (previous.journeyId === context.id && Array.isArray(previous.keys)) {
          previous.keys.slice(-MAX_MILESTONES).filter((entry) => typeof entry === 'string')
            .forEach((entry) => emitted.add(entry));
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Invalid WKND milestone storage discarded.', error.name);
      }
    }
  }
  if (key && emitted.has(key)) return;
  const payload = journeyEventPayload(stage, detail, context);
  const disabled = document.querySelector('meta[name="analytics"]')?.content.toLowerCase();
  if (['off', 'false', 'no'].includes(disabled)) return;
  window.adobeDataLayer ||= [];
  window.adobeDataLayer.push(payload);
  if (key) {
    emitted.add(key);
    if (emitted.size > MAX_MILESTONES) emitted.delete(emitted.values().next().value);
    storage('setItem', MILESTONES_KEY, JSON.stringify({
      journeyId: context.id, keys: [...emitted],
    }));
  }
}

export function mapJourneyToAnalytics(content) {
  /* eslint-disable no-underscore-dangle -- Adobe's documented Analytics mapping */
  const s = content.data.__adobe.analytics;
  const event = content.data.wkndJourney;
  const context = normalizeJourney(event) || getJourney(false);
  if (context) {
    s.eVar30 = context.id;
    s.eVar31 = context.source;
    s.eVar32 = context.tool || 'none';
    s.eVar33 = context.assisted ? 'assisted' : 'unassisted';
    s.eVar35 = context.adventure || 'none';
  }
  if (event && normalizeJourney(event)) {
    s.eVar34 = event.stage === 'bookingStep' ? `bookingStep:${event.step}` : event.stage;
    const number = JOURNEY_EVENTS[event.stage];
    if (number) {
      const metric = `event${number}${event.bookingId ? `:${event.bookingId}` : ''}`;
      s.events = [...new Set([...(s.events || '').split(',').filter(Boolean), metric])].join(',');
    }
    if (event.bookingId) {
      s.purchaseID = event.bookingId;
      s.currencyCode = event.currency;
      content.xdm.commerce = {
        ...content.xdm.commerce,
        order: {
          purchaseID: event.bookingId, priceTotal: event.total, currencyCode: event.currency,
        },
        // Demo reservations must not inflate standard purchase/revenue metrics.
        ...(!event.demo ? { purchases: { value: 1 } } : {}),
      };
    }
  }
  const redact = (value) => sanitizeJourneyUrl(value, window.location.href);
  if (content.xdm.web?.webPageDetails?.URL) {
    content.xdm.web.webPageDetails.URL = redact(content.xdm.web.webPageDetails.URL);
  }
  if (content.xdm.web?.webPageDetails?.referrer) {
    content.xdm.web.webPageDetails.referrer = redact(content.xdm.web.webPageDetails.referrer);
  }
  if (content.xdm.web?.webReferrer?.URL) {
    content.xdm.web.webReferrer.URL = redact(content.xdm.web.webReferrer.URL);
  }
  if (content.xdm.web?.webInteraction?.URL) {
    content.xdm.web.webInteraction.URL = redact(content.xdm.web.webInteraction.URL);
  }
  if (s.pageURL) s.pageURL = redact(s.pageURL);
  if (s.referrer) s.referrer = redact(s.referrer);
  /* eslint-enable no-underscore-dangle */
}

export async function decorateJourneyIdentity(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:'
    || (!isAeroUrl(url) && url.hostname !== 'wknd-adventures.run.place')) return value;
  if (typeof window.alloy !== 'function') return value;
  let timer;
  try {
    // Web SDK returns the original URL immediately when consent is pending/out.
    const result = await Promise.race([
      window.alloy('appendIdentityToUrl', { url: value }),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Identity handoff timed out')), 1500);
      }),
    ]);
    if (typeof result?.url !== 'string' || new URL(result.url).origin !== url.origin) {
      throw new Error('Invalid identity handoff URL');
    }
    return result.url;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Adobe identity handoff unavailable; journey correlation is retained.', error.name);
    return value;
  } finally {
    clearTimeout(timer);
  }
}

export function prepareAeroUrl(value, ref = 'wknd-of1') {
  const url = new URL(value, window.location.href);
  if (!isAeroUrl(url)) return url.href;
  const context = getJourney();
  const adventure = url.searchParams.get('adv')
    || url.pathname.match(/^\/adventures\/([a-z0-9-]+)$/)?.[1] || context.adventure;
  const next = normalizeJourney({ ...context, adventure });
  if (!url.searchParams.has('cid')) url.searchParams.set('cid', `${context.source}-aero`);
  if (!url.searchParams.has('ref')) url.searchParams.set('ref', ref);
  return addJourneyToUrl(url.href, next);
}

export function bindJourneyHandoffs(root) {
  if (!root || root.dataset.journeyBound) return;
  root.dataset.journeyBound = 'true';
  const handleClick = (event) => {
    if (event.button > 1) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || !isAeroUrl(new URL(link.href))
      || isAeroUrl(new URL(window.location.href))) return;
    link.href = prepareAeroUrl(link.href);
    saveJourney(journeyFromUrl(new URL(link.href)));
    pushJourneyEvent('aeroHandoff');
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey || (link.target && link.target !== '_self')) return;
    event.preventDefault();
    decorateJourneyIdentity(link.href).then((url) => window.location.assign(url));
  };
  root.addEventListener('click', handleClick, true);
  root.addEventListener('auxclick', handleClick, true);
}
