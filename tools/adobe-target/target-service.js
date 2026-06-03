import {
  deleteOffer, getAccessToken, getOffer, saveOffer,
} from './target-api.js';

const TARGET_CONFIG_PATH = '/.da/adobe-target.json';

function sheetRows(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json)) return json;
  return [];
}

export async function fetchTargetConfig(org, site, imsToken) {
  const path = `https://admin.da.live/source/${org}/${site}${TARGET_CONFIG_PATH}`;
  const resp = await fetch(path, {
    headers: imsToken ? { Authorization: `Bearer ${imsToken}` } : {},
  });
  if (!resp.ok) return { error: 'Could not load Adobe Target config from /.da/adobe-target.json.' };

  const json = await resp.json();
  const baseConfig = sheetRows(json).reduce((acc, row) => {
    if (row.key) acc[row.key] = row.value;
    return acc;
  }, {});

  const { clientId, clientSecret, tenant } = baseConfig;
  if (!clientId || !clientSecret || !tenant) {
    return { error: 'Missing tenant, clientId, or clientSecret in /.da/adobe-target.json.' };
  }

  const { error, token } = await getAccessToken(clientId, clientSecret);
  if (error) return { error };

  return {
    tenant, clientId, clientSecret, token,
  };
}

export function normalizePagePath(context) {
  const { org } = context;
  const site = context.repo || context.site;
  let path = context.path || '/';
  if (typeof path !== 'string') path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (!path.startsWith(`/${org}/${site}`)) path = `/${org}/${site}${path}`;
  return path;
}

export function toSourcePath(pagePath, org, site) {
  const prefix = `/${org}/${site}`;
  if (pagePath.startsWith(prefix)) {
    const rest = pagePath.slice(prefix.length);
    return rest || '/index';
  }
  return pagePath;
}

export async function savePreview(org, site, sourcePath, imsToken) {
  const resp = await fetch(`https://admin.hlx.page/preview/${org}/${site}/main${sourcePath}`, {
    method: 'POST',
    headers: imsToken ? { Authorization: `Bearer ${imsToken}` } : {},
  });
  if (!resp.ok) return { error: 'Could not preview the page.' };
  const json = await resp.json();
  const url = json?.preview?.url || json?.url;
  if (!url) return { error: 'Preview did not return a URL.' };
  return { ...json, url };
}

export function parseOfferIdFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cells = doc.querySelectorAll('td p, td');
  for (let i = 0; i < cells.length; i += 1) {
    const text = cells[i].textContent?.trim();
    if (text === 'adobe.target.offerId') {
      const valueCell = cells[i + 1];
      return valueCell?.textContent?.trim() || null;
    }
  }
  return null;
}

export async function readOfferIdFromSource(org, site, sourcePath, imsToken) {
  const resp = await fetch(`https://admin.da.live/source/${org}/${site}${sourcePath}`, {
    headers: imsToken ? { Authorization: `Bearer ${imsToken}` } : {},
  });
  if (!resp.ok) return null;
  return parseOfferIdFromHtml(await resp.text());
}

function buildMetadataTable(offerId) {
  return `<table><tbody><tr><td colspan="2">metadata</td></tr><tr><td>adobe.target.offerId</td><td>${offerId}</td></tr></tbody></table>`;
}

export async function writeOfferIdToSource(org, site, sourcePath, offerId, imsToken) {
  const url = `https://admin.da.live/source/${org}/${site}${sourcePath}`;
  const getResp = await fetch(url, {
    headers: imsToken ? { Authorization: `Bearer ${imsToken}` } : {},
  });
  if (!getResp.ok) return { error: 'Could not read page source to store offer metadata.' };

  let html = await getResp.text();
  const existingId = parseOfferIdFromHtml(html);

  if (existingId) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cells = doc.querySelectorAll('td');
    cells.forEach((cell) => {
      if (cell.textContent?.trim() === 'adobe.target.offerId' && cell.nextElementSibling) {
        cell.nextElementSibling.textContent = offerId;
      }
    });
    html = doc.body.innerHTML.includes('<html')
      ? doc.documentElement.outerHTML
      : doc.body.innerHTML;
  } else {
    const mainClose = html.indexOf('</main>');
    const table = buildMetadataTable(offerId);
    if (mainClose !== -1) {
      html = `${html.slice(0, mainClose)}\n${table}\n${html.slice(mainClose)}`;
    } else {
      html = `${html}\n${table}`;
    }
  }

  const form = new FormData();
  form.append('data', new Blob([html], { type: 'text/html' }), sourcePath.split('/').pop() || 'index.html');

  const putResp = await fetch(url, {
    method: 'PUT',
    headers: imsToken ? { Authorization: `Bearer ${imsToken}` } : {},
    body: form,
  });
  if (!putResp.ok) return { error: 'Could not save offer metadata to the page.' };
  return { success: true };
}

export async function removeOfferIdFromSource(org, site, sourcePath, imsToken) {
  const url = `https://admin.da.live/source/${org}/${site}${sourcePath}`;
  const getResp = await fetch(url, {
    headers: imsToken ? { Authorization: `Bearer ${imsToken}` } : {},
  });
  if (!getResp.ok) return { error: 'Could not read page source.' };

  const doc = new DOMParser().parseFromString(await getResp.text(), 'text/html');
  let changed = false;
  doc.querySelectorAll('table').forEach((table) => {
    const firstCell = table.querySelector('td');
    if (firstCell?.textContent?.trim().toLowerCase() === 'metadata') {
      table.remove();
      changed = true;
    }
  });
  if (!changed) return { success: true };

  const html = doc.body.innerHTML;
  const form = new FormData();
  form.append('data', new Blob([html], { type: 'text/html' }), sourcePath.split('/').pop() || 'index.html');
  const putResp = await fetch(url, {
    method: 'PUT',
    headers: imsToken ? { Authorization: `Bearer ${imsToken}` } : {},
    body: form,
  });
  if (!putResp.ok) return { error: 'Could not update page source.' };
  return { success: true };
}

export async function sendPageToTarget({
  org, site, sourcePath, name, offerId, displayName, imsToken,
}) {
  const preview = await savePreview(org, site, sourcePath, imsToken);
  if (preview.error) return preview;

  const aemResp = await fetch(`${preview.url}?nocache=${Date.now()}`);
  if (!aemResp.ok) return { error: 'Could not fetch preview HTML from AEM.' };

  const dom = new DOMParser().parseFromString(await aemResp.text(), 'text/html');
  const main = dom.querySelector('main');
  if (!main) return { error: 'Preview HTML has no main element to export.' };

  const config = await fetchTargetConfig(org, site, imsToken);
  if (config.error) return config;

  const result = await saveOffer(config, name, main.innerHTML, preview.url, displayName, offerId);
  if (result.error) return result;

  if (result.offerId) {
    const meta = await writeOfferIdToSource(org, site, sourcePath, result.offerId, imsToken);
    if (meta.error) return { ...result, warning: meta.error };
  }

  return result;
}

export async function loadOfferDetails(org, site, sourcePath, imsToken) {
  const offerId = await readOfferIdFromSource(org, site, sourcePath, imsToken);
  if (!offerId) return {};

  const config = await fetchTargetConfig(org, site, imsToken);
  if (config.error) return { id: offerId };

  const result = await getOffer(config, offerId);
  if (result.error) return { id: offerId };
  return { id: result.id, name: result.name };
}

export async function deleteTargetOffer(org, site, sourcePath, offerId, imsToken) {
  const config = await fetchTargetConfig(org, site, imsToken);
  if (config.error) return config;

  const result = await deleteOffer(config, offerId);
  if (result.error && !result.notFound) return result;

  await removeOfferIdFromSource(org, site, sourcePath, imsToken);
  return result;
}
