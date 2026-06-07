const DEFAULT_API = 'https://wknd-b2b-api.jaggah.workers.dev';

/**
 * @param {string} name
 */
function getPageMetadata(name) {
  const block = document.querySelector('main .metadata');
  if (!block) return '';
  const row = [...block.children].find(
    (r) => r.children[0]?.textContent?.trim().toLowerCase() === name.toLowerCase(),
  );
  return row?.children[1]?.textContent?.trim() || '';
}

/**
 * Resolve forms API base URL (same worker as B2B auth by default).
 * @param {string} [override]
 */
export function getFormsApiBase(override) {
  if (override?.trim()) return override.replace(/\/$/, '');
  const formsMeta = document.querySelector('meta[name="forms-api"]');
  if (formsMeta?.content?.trim()) return formsMeta.content.trim().replace(/\/$/, '');
  const pageMeta = getPageMetadata('forms-api');
  if (pageMeta) return pageMeta.replace(/\/$/, '');
  const b2bMeta = document.querySelector('meta[name="b2b-api"]');
  if (b2bMeta?.content?.trim()) return b2bMeta.content.trim().replace(/\/$/, '');
  const b2bPageMeta = getPageMetadata('b2b-api');
  if (b2bPageMeta) return b2bPageMeta.replace(/\/$/, '');
  return DEFAULT_API;
}

/**
 * @param {string} slug
 */
export function getFormSubmitUrl(slug) {
  if (!slug?.trim()) return '';
  return `${getFormsApiBase()}/api/forms/${encodeURIComponent(slug.trim())}`;
}
