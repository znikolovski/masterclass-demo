/**
 * Dynamic Media Open API delivery URL helpers (vs legacy Scene7 URLs).
 * @see https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/dynamicmedia/dynamic-media-open-apis/deliver-assets-apis
 */

/**
 * @param {string} authorUrl
 */
export function authorToDeliveryBase(authorUrl) {
  const url = new URL(authorUrl.replace(/\/$/, ''));
  if (!url.hostname.startsWith('author-')) {
    throw new Error(`Expected AEM author URL (author-*.adobeaemcloud.com), got ${authorUrl}`);
  }
  url.hostname = url.hostname.replace(/^author-/, 'delivery-');
  return url.origin;
}

/**
 * @param {string} value
 */
export function isOpenApiDeliveryUrl(value) {
  return typeof value === 'string'
    && /\/adobe\/assets\/urn:aaid:aem:/i.test(value);
}

/**
 * Legacy Dynamic Media / Scene7 URL (not Open API).
 * @param {string} value
 */
export function isLegacyScene7Url(value) {
  return typeof value === 'string'
    && /scene7\.com/i.test(value)
    && (value.includes('/is/image/') || value.includes('/is/content/'));
}

/**
 * @param {string} fileName
 */
export function imageFormatFromFileName(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  if (ext === 'jpeg') return 'jpg';
  if (['jpg', 'png', 'webp', 'gif', 'avif'].includes(ext)) return ext;
  return 'jpg';
}

/**
 * Web-optimized delivery URL per Open API spec:
 * /adobe/assets/{assetId}/as/{seoName}.{format}
 *
 * @param {string} deliveryBase
 * @param {string} assetId urn:aaid:aem:...
 * @param {string} fileName
 */
export function buildOpenApiDeliveryUrl(deliveryBase, assetId, fileName) {
  if (!assetId?.includes('urn:aaid:aem:')) return null;
  const format = imageFormatFromFileName(fileName);
  const seoName = fileName.replace(/\.[^.]+$/, '') || 'asset';
  const encodedSeo = encodeURIComponent(seoName);
  return `${deliveryBase}/adobe/assets/${assetId}/as/${encodedSeo}.${format}`;
}

/**
 * Normalize delivery URL (prefer https).
 * @param {string} url
 */
export function normalizeDeliveryUrl(url) {
  if (!url) return url;
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * @param {string} uuid
 */
export function urnFromJcrUuid(uuid) {
  if (!uuid || typeof uuid !== 'string') return null;
  const trimmed = uuid.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('urn:aaid:aem:')) return trimmed;
  return `urn:aaid:aem:${trimmed}`;
}

/**
 * @param {unknown} node
 * @returns {string|null}
 */
function findUrnInTree(node) {
  if (node == null) return null;
  if (typeof node === 'string') {
    const match = node.match(/urn:aaid:aem:[0-9a-f-]+/i);
    return match ? match[0] : null;
  }
  if (typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findUrnInTree(item);
      if (hit) return hit;
    }
    return null;
  }
  const obj = /** @type {Record<string, unknown>} */ (node);
  if (typeof obj['repo:assetId'] === 'string') return obj['repo:assetId'];
  if (typeof obj['jcr:uuid'] === 'string') return urnFromJcrUuid(obj['jcr:uuid']);
  for (const value of Object.values(obj)) {
    const hit = findUrnInTree(value);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {unknown} body
 */
export function extractRepoAssetId(body) {
  if (!body || typeof body !== 'object') return null;
  const data = /** @type {Record<string, unknown>} */ (body);
  return data.properties?.['repo:assetId']
    || data['repo:assetId']
    || urnFromJcrUuid(/** @type {string|undefined} */ (data['jcr:uuid']))
    || data.entities?.[0]?.properties?.['repo:assetId']
    || data.entities?.[0]?.['repo:assetId']
    || findUrnInTree(body);
}

/**
 * Find Open API href in a delivery/search API JSON body.
 * @param {unknown} body
 * @returns {string|null}
 */
export function findOpenApiHref(body) {
  if (!body || typeof body !== 'object') return null;

  /** @type {string[]} */
  const hits = [];

  /**
   * @param {unknown} node
   */
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const obj = /** @type {Record<string, unknown>} */ (node);
    if (typeof obj.href === 'string' && isOpenApiDeliveryUrl(obj.href)) {
      hits.push(obj.href);
    }
    if (typeof obj.url === 'string' && isOpenApiDeliveryUrl(obj.url)) {
      hits.push(obj.url);
    }
    if (typeof obj.deliveryUrl === 'string' && isOpenApiDeliveryUrl(obj.deliveryUrl)) {
      hits.push(obj.deliveryUrl);
    }
    Object.values(obj).forEach(walk);
  }

  walk(body);
  return hits[0] || null;
}
