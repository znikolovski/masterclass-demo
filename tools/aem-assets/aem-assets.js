/**
 * DA Library plugin: AEM Assets picker with insert-into-document support.
 * @see https://docs.da.live/developers/guides/developing-apps-and-plugins
 * @see https://docs.da.live/administrators/guides/setup-aem-assets
 */

const SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-helix-assets-addon/static-assets/resources/asset-selector.html';
const SELECTOR_ORIGIN = 'https://experience.adobe.com';
const SDK_TIMEOUT_MS = 20_000;

function isDebugMode() {
  try {
    if (new URLSearchParams(window.location.search).has('debug')) return true;
    return window.localStorage?.getItem('aem-assets-debug') === '1';
  } catch {
    return false;
  }
}

const debugLog = [];

function debug(line, data) {
  const entry = data === undefined ? String(line) : `${line} ${JSON.stringify(data)}`;
  debugLog.push(`${new Date().toISOString().slice(11, 23)} ${entry}`);
  if (!isDebugMode()) return;
  const el = document.getElementById('aem-assets-debug');
  if (!el) return;
  el.hidden = false;
  el.textContent = debugLog.join('\n');
}

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
  return { org, site, ref: 'main' };
}

function getBootstrapConfig() {
  const el = document.getElementById('aem-assets-bootstrap');
  if (!el?.textContent) return { aem: {}, codeOrigin: '' };
  try {
    const json = JSON.parse(el.textContent.trim());
    const aem = {};
    if (json.repositoryId) aem['aem.repositoryId'] = json.repositoryId;
    return { aem, codeOrigin: json.codeOrigin || '' };
  } catch {
    return { aem: {}, codeOrigin: '' };
  }
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

function resolveSiteIdentity(sdk = {}) {
  const identity = { ...getMetaDefaults() };

  mergeIdentity(identity, parseHelixHost(window.location.href));

  const appMatch = window.location.pathname.match(/\/app\/([^/]+)\/([^/]+)/);
  if (appMatch) {
    mergeIdentity(identity, { org: appMatch[1], site: appMatch[2] });
  }

  if (typeof sdk.context === 'string') {
    mergeIdentity(identity, parsePathOrgSite(sdk.context));
  } else if (sdk.context) {
    mergeIdentity(identity, extractFromObject(sdk.context));
  }
  mergeIdentity(identity, extractFromObject(sdk));

  [document.referrer].forEach((url) => {
    if (!url) return;
    mergeIdentity(identity, parseHelixHost(url));
    const hashMatch = url.match(/#\/([^/]+)\/([^/]+)/);
    if (hashMatch) {
      mergeIdentity(identity, { org: hashMatch[1], site: hashMatch[2] });
    }
  });

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

function getPagePath(sdk) {
  if (typeof sdk?.context === 'string') return sdk.context;
  const ctx = sdk?.context;
  return ctx?.path || ctx?.webPath || ctx?.href || sdk?.path || '';
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

function buildSelectorUrl({ aemConfig, codeOrigin, pagePath }) {
  const params = new URLSearchParams({ rail: 'true' });
  if (aemConfig['aem.repositoryId']) {
    params.set('aem.repositoryId', aemConfig['aem.repositoryId']);
  }
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

async function waitForSdk() {
  const { default: DA_SDK } = await import('https://da.live/nx/utils/sdk.js');
  return Promise.race([
    DA_SDK,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('DA SDK handshake timed out')), SDK_TIMEOUT_MS);
    }),
  ]);
}

function mountPicker(frame, aemConfig, codeOrigin, pagePath) {
  if (!aemConfig['aem.repositoryId']) {
    showStatus(
      'Missing repositoryId in tools/assets-selector/config.json. Push code sync, then hard-refresh.',
      true,
    );
    return null;
  }

  const src = buildSelectorUrl({ aemConfig, codeOrigin, pagePath });
  frame.src = src;
  frame.dataset.webPath = pagePath || '';
  debug('mountPicker', { codeOrigin, pagePath, src });
  showStatus('Select an asset, then confirm. The image is inserted at the cursor.');
  return src;
}

function bindInsertHandler(getActions, imageAsLink) {
  window.addEventListener('message', (event) => {
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

    const actions = getActions();
    if (!actions?.sendHTML) {
      showStatus('Cannot insert: open AEM Assets from a DA document (Experience Workspace).', true);
      return;
    }

    const html = payload.data.map((asset) => assetToHtml(asset, imageAsLink)).filter(Boolean).join('\n');
    if (!html) {
      showStatus('No insertable asset URL was returned. Publish the asset in AEM and try again.', true);
      return;
    }

    actions.sendHTML(html);
    actions.closeLibrary();
  });
}

(async function init() {
  const frame = document.getElementById('aem-assets-frame');
  if (!frame) return;

  debug('init', {
    href: window.location.href,
    referrer: document.referrer || '(none)',
    debug: isDebugMode(),
  });

  window.addEventListener('error', (e) => {
    debug('window.error', { message: e.message, filename: e.filename, lineno: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    debug('unhandledrejection', { reason: String(e.reason) });
  });
  frame.addEventListener('load', () => debug('innerFrame.load', { src: frame.src }));
  frame.addEventListener('error', () => debug('innerFrame.error', { src: frame.src }));

  const bootstrap = getBootstrapConfig();
  const bootstrapIdentity = resolveSiteIdentity({});
  const codeOrigin = bootstrap.codeOrigin || getCodeOrigin(bootstrapIdentity);
  const aemConfig = bootstrap.aem;
  debug('bootstrap', { bootstrapIdentity, codeOrigin, aemConfig, frameSrc: frame.src });

  if (!frame.src || !frame.src.includes('asset-selector')) {
    mountPicker(frame, aemConfig, codeOrigin, '');
  } else {
    showStatus('Select an asset, then confirm. The image is inserted at the cursor.');
  }

  loadExtensionConfig(codeOrigin).then((fetched) => {
    if (!fetched['aem.repositoryId'] || fetched['aem.repositoryId'] === aemConfig['aem.repositoryId']) {
      return;
    }
    mountPicker(frame, fetched, codeOrigin, frame.dataset.webPath || '');
  });

  let sdkActions = null;
  bindInsertHandler(() => sdkActions, false);

  try {
    const sdk = await waitForSdk();
    sdkActions = sdk.actions;
    debug('sdk.ready', {
      hasSendHTML: Boolean(sdkActions?.sendHTML),
      contextType: typeof sdk.context,
    });
    const identity = resolveSiteIdentity(sdk);
    const pagePath = getPagePath(sdk);
    const origin = getCodeOrigin(identity);

    mountPicker(frame, { ...aemConfig, ...(await loadExtensionConfig(origin)) }, origin, pagePath);
  } catch (err) {
    debug('sdk.failed', { error: String(err) });
    showStatus(
      'Asset picker is open. If insert does not work, use the toolbar AEM image icon or reload the page.',
      false,
    );
    if (isDebugMode()) {
      showStatus(`SDK: ${err}. Picker URL: ${frame.src || '(not set)'}`, true);
    }
  }

  if (isDebugMode()) {
    debug('copyHint', { text: 'Copy this panel and paste into chat' });
  }
}());
