/**
 * AEM Embed consumer block — Adventures site only.
 */
const ALLOWED_HOSTS = [
  'wknd-aero',
  'main--wknd-aero--znikolovski.aem.live',
  'main--wknd-aero--znikolovski.aem.page',
  'localhost',
];

/**
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedEmbedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some((h) => hostname.includes(h));
  } catch {
    return false;
  }
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const row = block.querySelector(':scope > div');
  const link = row?.querySelector('a');
  const url = link?.href || row?.textContent?.trim() || '';
  block.textContent = '';

  if (!url || !isAllowedEmbedUrl(url)) {
    block.innerHTML = '<p class="aem-embed-error">Invalid embed URL.</p>';
    return;
  }

  if (!customElements.get('aem-embed')) {
    await import('../../scripts/aem-embed.js');
  }

  const embed = document.createElement('aem-embed');
  embed.setAttribute('url', url);
  block.append(embed);
}
