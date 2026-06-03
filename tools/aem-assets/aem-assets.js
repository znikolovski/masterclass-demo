/**
 * DA Library plugin: AEM Assets picker with insert-into-document support.
 * @see https://docs.da.live/developers/guides/developing-apps-and-plugins
 * @see https://docs.da.live/administrators/guides/setup-aem-assets
 */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-helix-assets-addon/static-assets/resources/asset-selector.html';
const SELECTOR_ORIGIN = 'https://experience.adobe.com';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMetaDefaults() {
  const org = document.querySelector('meta[name="da-org"]')?.content?.trim();
  const site = document.querySelector('meta[name="da-site"]')?.content?.trim();
  return { org, site };
}

function parseHelixHost(url) {
  try {
    const parts = new URL(url).hostname.split('.')[0].split('--');
    if (parts.length >= 3) return { ref: parts[0], site: parts[1], org: parts[2] };
  } catch {
    /* ignore invalid URLs */
  }
  return null;
}

function parsePathOrgSite(path) {
  if (typeof path !== 'string') return null;
  const m = path.match(/^\/([^/]+)\/([^/]+)/);
  return m ? { org: m[1], site: m[2] } : null;
}

function isValidSiteId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value !== 'undefined'
    && value !== 'null';
}

function mergeIdentity(target, source) {
  if (!source) return target;
  if (isValidSiteId(source.org) && !target.org) target.org = source.org;
  if (isValidSiteId(source.site) && !target.site) target.site = source.site;
  if (source.ref && !target.ref) target.ref = source.ref;
  return target;
}

function extractFromObject(obj, depth = 0) {
  const out = { org: '', site: '', ref: '' };
  if (!obj || typeof obj !== 'object' || depth > 4) return out;

  const org = obj.org || obj.owner || obj.daOrg || obj.fromOrg;
  const site = obj.repo || obj.site || obj.project || obj.daSite || obj.fromRepo;
  if (isValidSiteId(org)) out.org = org;
  if (isValidSiteId(site)) out.site = site;
  if (obj.ref || obj.branch) out.ref = obj.ref || obj.branch;

  const mount = obj.mountpoint || obj.mountPoint || obj.config?.mountpoint;
  if (typeof mount === 'string') {
    const m = mount.match(/content\.da\.live\/([^/]+)\/([^/]+)/i);
    if (m) {
      if (!out.org) out.org = m[1];
      if (!out.site) out.site = m[2];
    }
  }

  const path = obj.path || obj.pathname || obj.webPath || obj.href || obj.location?.pathname;
  const fromPath = parsePathOrgSite(path);
  if (fromPath) {
    if (!out.org) out.org = fromPath.org;
    if (!out.site) out.site = fromPath.site;
  }

  Object.values(obj).forEach((value) => {
    if (!value || typeof value !== 'object') return;
    const nested = extractFromObject(value, depth + 1);
    if (!out.org && nested.org) out.org = nested.org;
    if (!out.site && nested.site) out.site = nested.site;
    if (!out.ref && nested.ref) out.ref = nested.ref;
  });

  return out;
}

/** Resolve DA org + site — EW/canvas often omits context.org; hostname + meta are reliable. */
function resolveSiteIdentity(sdk) {
  const identity = { ...getMetaDefaults(), ref: 'main' };

  mergeIdentity(identity, parseHelixHost(window.location.href));

  const appMatch = window.location.pathname.match(/\/app\/([^/]+)\/([^/]+)/);
  if (appMatch) {
    mergeIdentity(identity, { org: appMatch[1], site: appMatch[2] });
  }

  if (typeof sdk.context === 'string') {
    mergeIdentity(identity, parsePathOrgSite(sdk.context));
  } else {
    mergeIdentity(identity, extractFromObject(sdk.context));
    mergeIdentity(identity, extractFromObject(sdk));
  }

  [document.referrer, window.location.href].forEach((url) => {
    if (!url) return;
    mergeIdentity(identity, parseHelixHost(url));
    const hashMatch = url.match(/#\/([^/]+)\/([^/]+)/);
    if (hashMatch) {
      mergeIdentity(identity, { org: hashMatch[1], site: hashMatch[2] });
    }
  });

  const ctx = typeof sdk.context === 'object' && sdk.context ? sdk.context : {};
  if (ctx.ref || sdk.ref || ctx.branch || sdk.branch) {
    identity.ref = ctx.ref || sdk.ref || ctx.branch || sdk.branch || identity.ref;
  }

  return identity;
}

function getCodeOrigin(identity) {
  const defaults = getMetaDefaults();
  const org = isValidSiteId(identity.org) ? identity.org : defaults.org;
  const site = isValidSiteId(identity.site) ? identity.site : defaults.site;
  if (identity.ref === 'local') return 'http://localhost:3000';
  const branch = identity.ref || 'main';
  return `https://${branch}--${site}--${org}.aem.page`;
}

function collectAemConfig(source) {
  const out = {};
  if (!source || typeof source !== 'object') return out;

  Object.entries(source).forEach(([key, value]) => {
    if (key.startsWith('aem.') && typeof value === 'string') out[key] = value;
  });

  if (Array.isArray(source.data)) {
    source.data.forEach((row) => {
      if (row?.key?.startsWith('aem.') && row.value) out[row.key] = row.value;
    });
  }

  if (source.config && typeof source.config === 'object') {
    Object.entries(source.config).forEach(([key, value]) => {
      if (key.startsWith('aem.') && typeof value === 'string') out[key] = value;
    });
  }

  return out;
}

async function loadExtensionConfig(codeOrigin) {
  try {
    const res = await fetch(`${codeOrigin}/tools/assets-selector/config.json`);
    if (!res.ok) return {};
    const json = await res.json();
    const out = {};
    if (json.repositoryId) out['aem.repositoryId'] = json.repositoryId;
    return out;
  } catch {
    return {};
  }
}

async function fetchSiteAemConfig(org, site, token, actions) {
  if (!isValidSiteId(org) || !isValidSiteId(site)) return {};

  const url = `https://admin.da.live/config/${org}/${site}`;
  const opts = { headers: { Authorization: `Bearer ${token}` } };

  try {
    const res = actions?.daFetch
      ? await actions.daFetch(url, opts)
      : await fetch(url, opts);
    if (!res.ok) return {};
    const cfg = await res.json();
    const rows = cfg.data?.data || [];
    return Object.fromEntries(
      rows.filter((r) => r.key?.startsWith('aem.')).map((r) => [r.key, r.value]),
    );
  } catch {
    return {};
  }
}

function buildSelectorUrl({ aemConfig, codeOrigin, pagePath }) {
  const params = new URLSearchParams({ rail: 'true' });
  Object.entries(aemConfig).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set('extConfigUrl', `${codeOrigin}/tools/assets-selector/config.json`);
  if (pagePath) params.set('webPath', pagePath);
  return `${SELECTOR_URL}?${params.toString()}`;
}

function getAssetUrl(asset) {
  return asset.deliveryUrl
    || asset.publicUrl
    || asset.url
    || asset.renditionUrl
    || asset.path
    || '';
}

function assetToHtml(asset, imageAsLink) {
  const type = asset.type || asset.mimeType || '';
  const title = asset.title || asset.name || '';
  const alt = escapeHtml(title);
  const url = escapeHtml(getAssetUrl(asset));

  if (!url) return '';

  if (type.startsWith('image/')) {
    if (imageAsLink) return `<p><a href="${url}">${alt || 'image'}</a></p>`;
    return `<p><img src="${url}" alt="${alt}"></p>`;
  }

  if (type.startsWith('video/')) {
    const videoUrl = escapeHtml(asset.videoUrl || asset.url || getAssetUrl(asset));
    return `<table><tbody><tr><td>Embed</td></tr><tr><td><a href="${videoUrl}">${alt || 'Video'}</a></td></tr></tbody></table>`;
  }

  return `<p><a href="${url}">${alt || url}</a></p>`;
}

function showStatus(message, isError = false) {
  const el = document.getElementById('aem-assets-status');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
  el.classList.toggle('is-error', isError);
}

function handleSelectorMessage(event, actions, imageAsLink) {
  if (event.origin !== SELECTOR_ORIGIN) return;

  let payload;
  try {
    payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }

  const action = payload?.config?.action;
  if (!action || action === 'close') return;
  if (action !== 'done' || !Array.isArray(payload.data) || payload.data.length === 0) return;

  const html = payload.data.map((asset) => assetToHtml(asset, imageAsLink)).filter(Boolean).join('\n');
  if (!html) {
    showStatus('No insertable asset URL was returned. Publish the asset in AEM and try again.', true);
    return;
  }

  actions.sendHTML(html);
  actions.closeLibrary();
}

(async function init() {
  const frame = document.getElementById('aem-assets-frame');

  try {
    const sdk = await DA_SDK;
    const { context, token, actions } = sdk;
    const identity = resolveSiteIdentity(sdk);
    const codeOrigin = getCodeOrigin(identity);

    const ctxObj = typeof context === 'object' && context ? context : sdk;
    const aemConfig = {
      ...await loadExtensionConfig(codeOrigin),
      ...collectAemConfig(ctxObj),
      ...(await fetchSiteAemConfig(identity.org, identity.site, token, actions)),
    };

    if (!aemConfig['aem.repositoryId']) {
      const configHint = isValidSiteId(identity.org) && isValidSiteId(identity.site)
        ? `https://da.live/config#/${identity.org}/${identity.site}`
        : 'https://da.live/config';
      showStatus(
        `Missing aem.repositoryId. Add it under ${configHint} (data tab) or in tools/assets-selector/config.json.`,
        true,
      );
      return;
    }

    const pagePath = typeof context === 'string'
      ? context
      : (context?.path || context?.webPath || context?.href || sdk.path || '');
    const imageAsLink = aemConfig['aem.assets.image.type'] === 'link';

    frame.src = buildSelectorUrl({ aemConfig, codeOrigin, pagePath });
    showStatus('Select an asset, then confirm. The image is inserted at the cursor.');

    window.addEventListener('message', (event) => {
      handleSelectorMessage(event, actions, imageAsLink);
    });
  } catch (err) {
    showStatus(err?.message || 'Failed to initialize AEM Assets plugin.', true);
  }
}());
