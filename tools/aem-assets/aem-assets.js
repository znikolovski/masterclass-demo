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

/** Resolve DA org + site from SDK payload, mountpoint, path, or URLs. */
function resolveSiteIdentity(sdk) {
  const ctx = sdk.context || {};
  let org = sdk.org || ctx.org || ctx.owner || sdk.owner;
  let site = sdk.repo || sdk.site || ctx.repo || ctx.site || ctx.project || sdk.project;

  const mount = ctx.mountpoint || ctx.mountPoint || sdk.mountpoint
    || ctx.config?.mountpoint || sdk.config?.mountpoint;
  if (typeof mount === 'string') {
    const m = mount.match(/content\.da\.live\/([^/]+)\/([^/]+)/i);
    if (m) {
      org = org || m[1];
      site = site || m[2];
    }
  }

  const docPath = ctx.path || ctx.pathname || ctx.webPath || sdk.path || sdk.pathname;
  if (typeof docPath === 'string') {
    const m = docPath.match(/^\/([^/]+)\/([^/]+)/);
    if (m) {
      org = org || m[1];
      site = site || m[2];
    }
  }

  const appMatch = window.location.pathname.match(/\/app\/([^/]+)\/([^/]+)/);
  if (appMatch) {
    org = org || appMatch[1];
    site = site || appMatch[2];
  }

  const parseHelixHost = (url) => {
    try {
      const parts = new URL(url).hostname.split('.')[0].split('--');
      if (parts.length >= 3) return { ref: parts[0], site: parts[1], org: parts[2] };
    } catch {
      /* ignore invalid URLs */
    }
    return null;
  };

  [document.referrer, window.location.href].forEach((url) => {
    if (!url || (org && site)) return;
    const parsed = parseHelixHost(url);
    if (parsed) {
      org = org || parsed.org;
      site = site || parsed.site;
    }
    const hashMatch = url.match(/#\/([^/]+)\/([^/]+)/);
    if (hashMatch) {
      org = org || hashMatch[1];
      site = site || hashMatch[2];
    }
  });

  return { org, site, ref: ctx.ref || sdk.ref || ctx.branch || sdk.branch || 'main' };
}

function getCodeOrigin(identity) {
  if (identity.ref === 'local') return 'http://localhost:3000';
  const branch = identity.ref || 'main';
  const { org, site } = identity;
  return `https://${branch}--${site}--${org}.aem.page`;
}

function collectAemConfig(context) {
  const out = {};
  Object.entries(context).forEach(([key, value]) => {
    if (key.startsWith('aem.') && typeof value === 'string') out[key] = value;
  });
  if (Array.isArray(context.data)) {
    context.data.forEach((row) => {
      if (row?.key?.startsWith('aem.') && row.value) out[row.key] = row.value;
    });
  }
  if (context.config && typeof context.config === 'object') {
    Object.entries(context.config).forEach(([key, value]) => {
      if (key.startsWith('aem.') && typeof value === 'string') out[key] = value;
    });
  }
  return out;
}

async function fetchSiteAemConfig(org, site, token) {
  if (!org || !site || org === 'undefined' || site === 'undefined') return {};
  try {
    const res = await fetch(`https://admin.da.live/config/${org}/${site}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
  const status = document.getElementById('aem-assets-status');
  const frame = document.getElementById('aem-assets-frame');

  try {
    const sdk = await DA_SDK;
    const { context, token, actions } = sdk;
    const identity = resolveSiteIdentity(sdk);
    const aemConfig = {
      ...collectAemConfig(context || sdk),
      ...(await fetchSiteAemConfig(identity.org, identity.site, token)),
    };

    if (!aemConfig['aem.repositoryId']) {
      const configHint = identity.org && identity.site
        ? `https://da.live/config#/${identity.org}/${identity.site}`
        : 'https://da.live/config';
      showStatus(
        `Missing aem.repositoryId in DA site config. Add it under ${configHint} (data tab), then save.`,
        true,
      );
      return;
    }

    if (!identity.org || !identity.site) {
      showStatus(
        'Could not detect DA org/site from the editor. Open AEM Assets from a document in DA, not the raw preview URL.',
        true,
      );
      return;
    }

    const codeOrigin = getCodeOrigin(identity);
    const pagePath = context?.path || context?.webPath || context?.href || sdk.path || '';
    const imageAsLink = aemConfig['aem.assets.image.type'] === 'link';

    frame.src = buildSelectorUrl({ aemConfig, codeOrigin, pagePath });
    showStatus('Select an asset, then confirm. The image is inserted at the cursor.');

    window.addEventListener('message', (event) => {
      handleSelectorMessage(event, actions, imageAsLink);
    });

    if (status) status.hidden = false;
  } catch (err) {
    showStatus(err?.message || 'Failed to initialize AEM Assets plugin.', true);
  }
}());
