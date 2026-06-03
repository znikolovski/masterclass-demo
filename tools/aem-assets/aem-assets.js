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

function getCodeOrigin(context) {
  if (context.ref === 'local') return 'http://localhost:3000';
  const branch = context.ref || context.branch || 'main';
  const { org, repo } = context;
  return `https://${branch}--${repo}--${org}.aem.page`;
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

async function fetchSiteAemConfig(org, repo, token) {
  try {
    const res = await fetch(`https://admin.da.live/config/${org}/${repo}`, {
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
    const { context, token, actions } = await DA_SDK;
    const aemConfig = {
      ...collectAemConfig(context),
      ...(await fetchSiteAemConfig(context.org, context.repo, token)),
    };

    if (!aemConfig['aem.repositoryId']) {
      showStatus(
        'Missing aem.repositoryId in DA site config. Add it under https://da.live/config before using AEM Assets.',
        true,
      );
      return;
    }

    const codeOrigin = getCodeOrigin(context);
    const pagePath = context.path || context.webPath || context.href || '';
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
