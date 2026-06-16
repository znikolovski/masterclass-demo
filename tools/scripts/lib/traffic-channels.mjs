/**
 * Marketing channel simulation for WKND live traffic (Analytics marketing channel + eVar1 CID).
 * Applies referrer and query params on the landing page of each session only.
 */

import { createRng } from './traffic-visitors.mjs';

/** @typedef {{ id: string, label: string, referer?: string, cid?: string, utm?: Record<string, string> }} SessionChannel */

export const CHANNEL_IDS = ['direct', 'organic', 'social', 'email', 'referral', 'paid'];

/** @type {Record<string, number>} */
export const DEFAULT_CHANNEL_MIX = {
  direct: 0.35,
  organic: 0.25,
  email: 0.15,
  social: 0.12,
  referral: 0.10,
  paid: 0.03,
};

const CHANNEL_LABELS = {
  direct: 'Direct',
  organic: 'Natural Search (Google/Bing referrer)',
  social: 'Social (Facebook/Instagram/Pinterest)',
  email: 'Email (cid + mail client referrer)',
  referral: 'Referral (outdoor / publisher sites)',
  paid: 'Paid Search (utm + Google referrer)',
};

const ORGANIC_REFERRERS = [
  'https://www.google.com/',
  'https://www.bing.com/',
];

const SOCIAL_REFERRERS = [
  'https://www.facebook.com/',
  'https://l.instagram.com/',
  'https://www.pinterest.com/',
];

const REFERRAL_REFERRERS = [
  'https://www.outsideonline.com/',
  'https://www.nationalgeographic.com/',
  'https://www.backpacker.com/',
];

const EMAIL_CIDS = [
  'wknd-newsletter-spring',
  'wknd-email-adventures',
  'wknd-winback-june',
  'wknd-field-notes-digest',
];

const PAID_CAMPAIGNS = [
  'wknd-google-climbing',
  'wknd-google-trekking',
  'wknd-google-winter',
];

/**
 * @param {Record<string, number>} weights
 * @returns {Record<string, number>}
 */
export function normalizeChannelMix(weights) {
  const mix = {};
  let sum = 0;
  CHANNEL_IDS.forEach((id) => {
    const w = Math.max(0, Number(weights[id]) || 0);
    if (w > 0) {
      mix[id] = w;
      sum += w;
    }
  });
  if (sum <= 0) return { ...DEFAULT_CHANNEL_MIX };
  return Object.fromEntries(
    Object.entries(mix).map(([id, w]) => [id, w / sum]),
  );
}

/**
 * Parse `--channel-mix=direct:35,organic:25,email:15` (percentages).
 * @param {string} arg
 */
export function parseChannelMixArg(arg) {
  const weights = {};
  arg.split(',').forEach((part) => {
    const [rawId, rawPct] = part.split(':');
    const id = rawId?.trim();
    if (!id || !CHANNEL_IDS.includes(id)) return;
    const pct = parseFloat(rawPct);
    if (!Number.isFinite(pct) || pct <= 0) return;
    weights[id] = pct / 100;
  });
  return normalizeChannelMix(weights);
}

/**
 * @param {Record<string, number>} mix
 * @returns {{ id: string, label: string, share: number }[]}
 */
export function summarizeChannelMix(mix) {
  return CHANNEL_IDS
    .filter((id) => mix[id] > 0)
    .map((id) => ({
      id,
      label: CHANNEL_LABELS[id] || id,
      share: Math.round((mix[id] || 0) * 1000) / 10,
    }))
    .sort((a, b) => b.share - a.share);
}

/**
 * @param {Record<string, number>} mix
 * @param {() => number} rng
 */
export function pickChannelId(mix, rng) {
  const r = rng();
  let acc = 0;
  for (const id of CHANNEL_IDS) {
    const w = mix[id] || 0;
    if (w <= 0) continue;
    acc += w;
    if (r <= acc) return id;
  }
  return 'direct';
}

/**
 * @param {string} channelId
 * @param {() => number} rng
 * @returns {SessionChannel}
 */
export function resolveSessionChannel(channelId, rng) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  switch (channelId) {
    case 'organic':
      return {
        id: 'organic',
        label: CHANNEL_LABELS.organic,
        referer: pick(ORGANIC_REFERRERS),
      };
    case 'social':
      return {
        id: 'social',
        label: CHANNEL_LABELS.social,
        referer: pick(SOCIAL_REFERRERS),
      };
    case 'email':
      return {
        id: 'email',
        label: CHANNEL_LABELS.email,
        referer: 'https://mail.google.com/',
        cid: pick(EMAIL_CIDS),
      };
    case 'referral':
      return {
        id: 'referral',
        label: CHANNEL_LABELS.referral,
        referer: pick(REFERRAL_REFERRERS),
      };
    case 'paid':
      return {
        id: 'paid',
        label: CHANNEL_LABELS.paid,
        referer: 'https://www.google.com/',
        utm: {
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: pick(PAID_CAMPAIGNS),
        },
      };
    default:
      return { id: 'direct', label: CHANNEL_LABELS.direct };
  }
}

/**
 * @param {{ channel?: SessionChannel }[]} scheduled
 * @param {Record<string, number>} mix
 * @param {() => number} rng
 */
export function assignChannelsToSessions(scheduled, mix, rng) {
  const normalized = normalizeChannelMix(mix);
  scheduled.forEach((session) => {
    const channelId = pickChannelId(normalized, rng);
    session.channel = resolveSessionChannel(channelId, rng);
  });
  return normalized;
}

/**
 * @param {{ channel?: SessionChannel }[]} scheduled
 */
export function summarizeChannelStats(scheduled) {
  const byChannel = {};
  scheduled.forEach(({ channel }) => {
    const id = channel?.id || 'direct';
    if (!byChannel[id]) {
      byChannel[id] = { sessions: 0, label: channel?.label || CHANNEL_LABELS[id] || id };
    }
    byChannel[id].sessions += 1;
  });
  const total = scheduled.length || 1;
  return {
    byChannel: Object.fromEntries(
      Object.entries(byChannel).map(([id, stats]) => [
        id,
        {
          ...stats,
          share: Math.round((stats.sessions / total) * 1000) / 10,
        },
      ]),
    ),
    totalSessions: scheduled.length,
  };
}

/**
 * Landing URL with channel query params (cid / utm) on first page only.
 * @param {string} origin
 * @param {string} path
 * @param {SessionChannel|undefined} channel
 * @param {boolean} isLanding
 */
export function buildSessionPageUrl(origin, path, channel, isLanding) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${origin}${normalized}`);
  if (!isLanding || !channel) return url.toString();

  if (channel.cid) {
    url.searchParams.set('cid', channel.cid);
  }
  if (channel.utm) {
    Object.entries(channel.utm).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

/**
 * Playwright goto options for session landing vs in-site navigation.
 * @param {SessionChannel|undefined} channel
 * @param {boolean} isLanding
 */
export function buildGotoOptions(channel, isLanding) {
  const opts = { waitUntil: 'domcontentloaded', timeout: 60000 };
  if (isLanding && channel?.referer) {
    opts.referer = channel.referer;
  }
  return opts;
}

/**
 * Convenience for tests / dry-run previews.
 * @param {number} seed
 * @param {Record<string, number>} [mix]
 */
export function sampleChannelsForSeed(seed, mix = DEFAULT_CHANNEL_MIX) {
  const rng = createRng(seed);
  return CHANNEL_IDS.map((id) => ({
    id,
    example: resolveSessionChannel(id, rng),
  }));
}
