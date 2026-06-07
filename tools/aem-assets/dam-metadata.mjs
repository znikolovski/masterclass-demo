/**
 * DAM metadata helpers — Assets OpenAPI PATCH when available, Sling POST fallback.
 */

const DEFAULT_AUTHOR = 'https://author-p115476-e1135027.adobeaemcloud.com';

export function getAuthHeaders() {
  const token = process.env.AEM_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const apiKey = process.env.AEM_API_KEY?.trim();
  if (apiKey) headers['X-Api-Key'] = apiKey;
  return headers;
}

export function requireAuth() {
  const headers = getAuthHeaders();
  if (!headers) {
    console.error(`
Missing AEM_ACCESS_TOKEN.

1. Log into AEM author
2. DevTools → Network → copy Bearer token from any XHR
3. export AEM_ACCESS_TOKEN="<token>"
`);
    process.exit(1);
  }
  return headers;
}

/**
 * @param {string} damFolder e.g. /content/dam/wknd-adventures/blog
 * @param {string} fileName
 */
export function toApiPath(damFolder, fileName) {
  const prefix = '/content/dam/';
  if (!damFolder.startsWith(prefix)) throw new Error(`Invalid DAM folder: ${damFolder}`);
  return `${damFolder.slice(prefix.length)}/${fileName}`;
}

/**
 * @param {string} damFolder
 * @param {string} fileName
 */
export function toDamPath(damFolder, fileName) {
  return `${damFolder}/${fileName}`;
}

/**
 * Mirror dc:title → jcr:title; coerce wknd:contentUsage to string[] (multi-select).
 * @param {Record<string, unknown>} metadata
 */
export function normalizeMetadata(metadata) {
  const props = { ...metadata };
  if (props['dc:title'] && !props['jcr:title']) {
    props['jcr:title'] = props['dc:title'];
  }
  if (props['wknd:contentUsage'] != null) {
    const usage = props['wknd:contentUsage'];
    props['wknd:contentUsage'] = Array.isArray(usage) ? usage : [usage];
  }
  return props;
}

/**
 * @param {unknown} value
 */
export function formatMetadataValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * @param {unknown} expected
 * @param {unknown} actual
 */
export function metadataValuesMatch(expected, actual) {
  if (expected == null) return actual == null;
  if (Array.isArray(expected)) {
    const exp = [...expected].map(String).sort();
    const act = Array.isArray(actual) ? [...actual].map(String).sort() : [String(actual)];
    return exp.length === act.length && exp.every((v, i) => v === act[i]);
  }
  return String(expected) === formatMetadataValue(actual);
}

/**
 * @param {string} authorUrl
 * @param {string} apiPath
 * @param {Record<string, string>} headers
 * @param {number} [maxAttempts]
 */
export async function waitForAsset(authorUrl, apiPath, headers, maxAttempts = 40) {
  const url = `${authorUrl}/api/assets/${apiPath}.json`;
  for (let i = 0; i < maxAttempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, { headers });
    if (res.ok) return true;
    if (res.status !== 404) {
      const text = await res.text();
      throw new Error(`waitForAsset ${res.status}: ${text.slice(0, 200)}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/**
 * @param {object} data
 */
function extractUrnFromAssetJson(data) {
  const repo = data?.properties?.['repo:assetId']
    || data?.['repo:assetId']
    || data?.entities?.[0]?.properties?.['repo:assetId']
    || data?.entities?.[0]?.['repo:assetId'];
  if (repo) return repo;
  const uuid = data?.['jcr:uuid'];
  if (typeof uuid === 'string' && uuid) return `urn:aaid:aem:${uuid}`;
  return null;
}

/**
 * @param {string} authorUrl
 * @param {string} damFolder
 * @param {string} fileName
 * @param {Record<string, string>} headers
 */
export async function resolveAssetId(authorUrl, damFolder, fileName, headers) {
  const damPath = toDamPath(damFolder, fileName);
  const apiPath = toApiPath(damFolder, fileName);

  const res = await fetch(`${authorUrl}/api/assets/${apiPath}.json`, { headers });
  if (res.ok) {
    const data = await res.json();
    const urn = extractUrnFromAssetJson(data);
    if (urn) return urn;
  }

  const slingRes = await fetch(`${authorUrl}${damPath}.1.json`, { headers });
  if (slingRes.ok) {
    const data = await slingRes.json();
    const urn = extractUrnFromAssetJson(data);
    if (urn) return urn;
  }

  return damPath;
}

/**
 * @param {string} authorUrl
 * @param {string} assetId
 * @param {Record<string, string>} headers
 */
export async function readOpenApiMetadata(authorUrl, assetId, headers) {
  const url = `${authorUrl}/adobe/assets/${encodeURIComponent(assetId)}/metadata`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`GET metadata ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const body = JSON.parse(text);
  const assetMetadata = body.assetMetadata || body;
  return {
    etag: res.headers.get('etag'),
    assetMetadata,
    raw: body,
  };
}

/**
 * @param {string} authorUrl
 * @param {string} damPath
 * @param {Record<string, string>} headers
 */
export async function readSlingMetadata(authorUrl, damPath, headers) {
  const url = `${authorUrl}${damPath}/jcr:content/metadata.1.json`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GET sling metadata ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

/**
 * Build JSON Patch ops for assetMetadata fields.
 *
 * @param {Record<string, unknown>} metadata
 * @param {Record<string, unknown>} existing
 */
export function buildMetadataPatch(metadata, existing) {
  return Object.entries(metadata)
    .filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return value !== '';
    })
    .map(([key, value]) => ({
      op: existing[key] !== undefined ? 'replace' : 'add',
      path: `/${key}`,
      value,
    }));
}

/**
 * URLSearchParams encodes ":" in field names as "%3A", which AEM stores literally
 * (e.g. wknd%3AcontentUsage) and rejects with 422. Encode values only.
 * @param {string} name
 * @param {string} value
 */
function appendSlingFormField(parts, name, value) {
  parts.push(`${name}=${encodeURIComponent(String(value))}`);
}

/**
 * @param {string} text
 * @param {number} [max]
 */
function summarizeAemError(text, max = 240) {
  if (!text) return '';
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return (stripped || text).slice(0, max);
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Build Sling POST body for asset metadata. Field names keep literal ":" characters.
 * @param {Record<string, unknown>} props
 * @param {{ clearMultiValue?: boolean }} [opts]
 */
function buildAssetMetadataPostBody(props, opts = {}) {
  const { clearMultiValue = true } = opts;
  const parts = [];
  appendSlingFormField(parts, '_charset_', 'utf-8');

  Object.entries(props).forEach(([key, value]) => {
    if (value == null || key.startsWith('jcr:')) return;
    const base = `./jcr:content/metadata/${key}`;

    if (Array.isArray(value)) {
      const entries = value.filter((entry) => entry != null && entry !== '');
      if (entries.length === 0) return;
      if (clearMultiValue) appendSlingFormField(parts, `${base}@Delete`, '');
      entries.forEach((entry, index) => {
        appendSlingFormField(parts, base, String(entry));
        if (index === 0) appendSlingFormField(parts, `${base}@TypeHint`, 'String[]');
      });
      return;
    }

    if (value !== '') appendSlingFormField(parts, base, String(value));
  });

  return parts.join('&');
}

/**
 * @param {string} authorUrl
 * @param {Record<string, string>} headers
 */
async function fetchCsrfToken(authorUrl, headers) {
  const res = await fetch(`${authorUrl}/libs/granite/csrf/token.json`, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CSRF token ${res.status}: ${summarizeAemError(text)}`);
  }
  const data = JSON.parse(text);
  if (!data?.token) throw new Error('CSRF token missing from response');
  return data.token;
}

/**
 * @param {Record<string, string>} headers
 * @param {string} csrfToken
 */
function withCsrfHeaders(headers, csrfToken) {
  return {
    ...headers,
    'CSRF-Token': csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

/**
 * @param {string} authorUrl
 * @param {string} damPath
 * @param {Record<string, unknown>} props
 * @param {Record<string, string>} headers
 * @param {{ maxAttempts?: number }} [opts]
 */
async function applyMetadataViaSling(authorUrl, damPath, props, headers, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 4;
  const strategies = [
    { clearMultiValue: true },
    { clearMultiValue: false },
  ];

  let lastStatus = 0;
  let lastError = '';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const strategy = strategies[Math.min(attempt, strategies.length - 1)];
    const body = buildAssetMetadataPostBody(props, strategy);
    if (body === '_charset_=utf-8') return { target: 'skip', status: 0, ok: true };

    // eslint-disable-next-line no-await-in-loop
    const assetRes = await fetch(`${authorUrl}${damPath}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body,
    });

    if (assetRes.ok || assetRes.status === 200 || assetRes.status === 201) {
      return { target: 'asset-post', status: assetRes.status, ok: true };
    }

    // eslint-disable-next-line no-await-in-loop
    const assetText = await assetRes.text();
    lastStatus = assetRes.status;
    lastError = summarizeAemError(assetText);

    if (assetRes.status === 409 && attempt < maxAttempts - 1) {
      // DAM often returns 409 while post-upload processing holds a short-lived lock.
      // eslint-disable-next-line no-await-in-loop
      await sleep(1500 * (attempt + 1));
      continue;
    }

    if (attempt < maxAttempts - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1000);
    }
  }

  return {
    target: 'asset-post',
    status: lastStatus,
    ok: false,
    error: lastError,
  };
}

/**
 * @param {string} damPath
 */
function fileNameFromPath(damPath) {
  return damPath.split('/').pop() || damPath;
}

/**
 * @param {string} authorUrl
 * @param {string} apiPath
 * @param {Record<string, unknown>} props
 * @param {Record<string, string>} headers
 */
async function applyMetadataViaAssetsApiPut(authorUrl, apiPath, props, headers, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const payload = Object.fromEntries(
    Object.entries(props).filter(([key, value]) => {
      if (key.startsWith('jcr:')) return false;
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return value !== '';
    }),
  );
  if (Object.keys(payload).length === 0) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${authorUrl}/api/assets/${apiPath}`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ class: 'asset', properties: payload }),
    });

    if (res.ok || res.status === 200) return res.status;

    // eslint-disable-next-line no-await-in-loop
    const text = await res.text();
    if (res.status === 409 && attempt < maxAttempts - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1500 * (attempt + 1));
      continue;
    }
    console.warn(`  assets API PUT ${res.status}: ${summarizeAemError(text)}`);
    return null;
  }
  return null;
}

/**
 * @param {string} authorUrl
 * @param {string} assetId
 * @param {object[]} patch
 * @param {string|null} etag
 * @param {Record<string, string>} headers
 */
async function patchOpenApiMetadata(authorUrl, assetId, patch, etag, headers) {
  const url = `${authorUrl}/adobe/assets/${encodeURIComponent(assetId)}/metadata`;
  const reqHeaders = {
    ...headers,
    'Content-Type': 'application/json-patch+json',
  };
  if (etag) reqHeaders['If-Match'] = etag;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: reqHeaders,
    body: JSON.stringify(patch),
  });

  const text = await res.text();
  return { status: res.status, text, etag: res.headers.get('etag') };
}

/**
 * @param {Record<string, unknown>} expected
 * @param {Record<string, unknown>} actual
 */
function findMetadataMismatches(expected, actual) {
  return Object.keys(expected).filter((k) => {
    if (k.startsWith('jcr:')) return false;
    return !metadataValuesMatch(expected[k], actual[k]);
  });
}

/**
 * Read metadata with short retries — DAM post-upload processing can lag behind PUT.
 * @param {string} authorUrl
 * @param {string} damPath
 * @param {Record<string, unknown>} expected
 * @param {Record<string, string>} headers
 * @param {number} [maxAttempts]
 */
async function readMetadataUntilStable(authorUrl, damPath, expected, headers, maxAttempts = 5) {
  let slingMeta = {};
  let missing = Object.keys(expected).filter((k) => !k.startsWith('jcr:'));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    slingMeta = await readSlingMetadata(authorUrl, damPath, headers);
    missing = findMetadataMismatches(expected, slingMeta);
    if (missing.length === 0) return { slingMeta, missing: [] };
    if (attempt < maxAttempts - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(1200 * (attempt + 1));
    }
  }

  return { slingMeta, missing };
}

/**
 * @param {string} authorUrl
 * @param {string} damPath
 * @param {Record<string, unknown>} props
 * @param {Record<string, string>} headers
 */
async function applyViaSlingStack(authorUrl, damPath, apiPath, props, headers) {
  const csrf = await fetchCsrfToken(authorUrl, headers);
  const mutatingHeaders = withCsrfHeaders(headers, csrf);

  await applyMetadataViaAssetsApiPut(authorUrl, apiPath, props, mutatingHeaders);

  let { slingMeta, missing } = await readMetadataUntilStable(
    authorUrl, damPath, props, headers,
  );

  if (missing.length > 0) {
    const partial = Object.fromEntries(missing.map((key) => [key, props[key]]));
    await applyMetadataViaAssetsApiPut(authorUrl, apiPath, partial, mutatingHeaders);
    ({ slingMeta, missing } = await readMetadataUntilStable(
      authorUrl, damPath, props, headers,
    ));
  }

  if (missing.length > 0) {
    const partial = Object.fromEntries(missing.map((key) => [key, props[key]]));
    const slingResult = await applyMetadataViaSling(
      authorUrl, damPath, partial, mutatingHeaders,
    );
    ({ slingMeta, missing } = await readMetadataUntilStable(
      authorUrl, damPath, props, headers,
    ));

    if (missing.length > 0 && !slingResult.ok) {
      throw new Error(
        `metadata not stored on ${fileNameFromPath(damPath)}: ${missing.join(', ')} `
        + `(sling ${slingResult.status}: ${slingResult.error}). `
        + 'Retry with npm run migrate:metadata -- --failed-only. '
        + 'If wknd fields stay empty, deploy wknd namespace repoinit '
        + '(docs/AEM-ASSETS-METADATA-SETUP.md §2.2).',
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `metadata not stored on ${fileNameFromPath(damPath)}: ${missing.join(', ')}. `
      + 'Deploy wknd namespace repoinit (docs/AEM-ASSETS-METADATA-SETUP.md §2.2). '
      + 'Multi-select wknd:contentUsage must be a string array (e.g. ["blog","card"]).',
    );
  }

  const verified = {};
  Object.keys(props).forEach((key) => {
    if (!key.startsWith('jcr:')) verified[key] = slingMeta[key] ?? null;
  });
  return { method: 'assets-api-put+sling', verified };
}

/**
 * @param {string} authorUrl
 * @param {string} assetId
 * @param {Record<string, unknown>} props
 * @param {Record<string, string>} headers
 */
async function applyViaOpenApi(authorUrl, assetId, props, headers) {
  let { etag, assetMetadata } = await readOpenApiMetadata(authorUrl, assetId, headers);
  const patch = buildMetadataPatch(props, assetMetadata);
  if (patch.length === 0) {
    return { method: 'skip', assetId, verified: {} };
  }

  let result = await patchOpenApiMetadata(authorUrl, assetId, patch, etag, headers);
  if (result.status === 412) {
    const fresh = await readOpenApiMetadata(authorUrl, assetId, headers);
    result = await patchOpenApiMetadata(
      authorUrl,
      assetId,
      buildMetadataPatch(props, fresh.assetMetadata),
      fresh.etag,
      headers,
    );
  }

  if (result.status !== 200 && result.status !== 204) {
    throw new Error(
      `PATCH metadata ${result.status} (assetId=${assetId}): ${result.text.slice(0, 400)}`,
    );
  }

  const { assetMetadata: updated } = await readOpenApiMetadata(authorUrl, assetId, headers);
  const missing = findMetadataMismatches(props, updated);
  if (missing.length > 0) {
    throw new Error(`metadata mismatch after PATCH: ${missing.join(', ')}`);
  }

  const verified = {};
  Object.keys(props).forEach((key) => {
    if (!key.startsWith('jcr:')) verified[key] = updated[key] ?? null;
  });
  return { method: 'assets-api-patch', assetId, verified };
}

/**
 * Apply metadata — OpenAPI when provisioned, else Sling (this program uses Sling).
 *
 * @param {string} authorUrl
 * @param {string} damFolder
 * @param {string} fileName
 * @param {Record<string, unknown>} metadata
 * @param {Record<string, string>} headers
 */
export async function applyAssetMetadata(authorUrl, damFolder, fileName, metadata, headers) {
  const props = normalizeMetadata(metadata);
  const apiPath = toApiPath(damFolder, fileName);
  const damPath = toDamPath(damFolder, fileName);

  const ready = await waitForAsset(authorUrl, apiPath, headers);
  if (!ready) {
    throw new Error(`asset not available: ${damPath}`);
  }

  const assetId = await resolveAssetId(authorUrl, damFolder, fileName, headers);

  try {
    return await applyViaOpenApi(authorUrl, assetId, props, headers);
  } catch (err) {
    const status = err.status || Number(err.message?.match(/\b(\d{3})\b/)?.[1]);
    if (status !== 404) throw err;
  }

  const slingResult = await applyViaSlingStack(authorUrl, damPath, apiPath, props, headers);
  return { ...slingResult, assetId };
}

/**
 * @param {string} authorUrl
 * @param {string} damFolder
 * @param {string} fileName
 * @param {Record<string, unknown>} expected
 * @param {Record<string, string>} headers
 */
export async function verifyAssetMetadata(authorUrl, damFolder, fileName, expected, headers) {
  const damPath = toDamPath(damFolder, fileName);
  const assetId = await resolveAssetId(authorUrl, damFolder, fileName, headers);

  try {
    const { assetMetadata } = await readOpenApiMetadata(authorUrl, assetId, headers);
    const found = {};
    Object.keys(expected).forEach((key) => {
      if (!key.startsWith('jcr:')) found[key] = assetMetadata[key] ?? null;
    });
    return found;
  } catch (err) {
    if (err.status !== 404 && !String(err.message).includes('404')) throw err;
  }

  const slingMeta = await readSlingMetadata(authorUrl, damPath, headers);
  const found = {};
  Object.keys(expected).forEach((key) => {
    if (!key.startsWith('jcr:')) found[key] = slingMeta[key] ?? null;
  });
  return found;
}

export function getAuthorUrl() {
  return (process.env.AEM_AUTHOR_URL || DEFAULT_AUTHOR).replace(/\/$/, '');
}
