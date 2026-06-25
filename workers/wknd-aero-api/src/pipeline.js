import { getCatalogEntity } from './catalog.js';

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} entity
 */
function buildJsonLd(entity) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: entity.name,
        description: entity.description?.replace(/<[^>]+>/g, '') || '',
        sku: entity.sku,
        brand: { '@type': 'Brand', name: 'WKND Adventures' },
        offers: {
          '@type': 'Offer',
          price: entity.price?.final,
          priceCurrency: entity.price?.currency || 'USD',
        },
        image: entity.images?.[0]?.url,
      },
      {
        '@type': 'TouristTrip',
        name: entity.name,
        description: entity.description?.replace(/<[^>]+>/g, '') || '',
        touristType: entity.adventureCategory,
      },
    ],
  };
}

/**
 * @param {object} entity
 * @returns {string}
 */
function categoryLabel(entity) {
  const cat = entity.adventureCategory || '';
  return cat.replace(/-/g, ' ');
}

/**
 * @param {string} url
 * @returns {string}
 */
function resolveImageUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `https://main--masterclass-demo--znikolovski.aem.live${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * @param {object} entity
 */
function buildPipelineHtml(entity) {
  const iata = entity.destinationIata || '';
  const slug = entity.sku || '';
  const img = resolveImageUrl(entity.images?.[0]?.url || '');
  const name = escapeHtml(entity.name);
  const desc = escapeHtml((entity.description || '').replace(/<[^>]+>/g, ''));
  const category = escapeHtml(categoryLabel(entity));
  const price = entity.price?.final || 399;
  const editorial = escapeHtml(entity.editorialUrl || `https://main--masterclass-demo--znikolovski.aem.live/blog/${slug}`);
  const heroStyle = img ? ` style="background-image:url('${escapeHtml(img)}')"` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} — WKND Aero Adventures</title>
  <meta name="description" content="${desc.slice(0, 160)}" />
  <meta name="brand" content="wknd-aero" />
  <link rel="stylesheet" href="/styles/brand.css" />
  <link rel="stylesheet" href="/styles/brands/wknd-aero.css" />
  <link rel="stylesheet" href="/blocks/aero/adventure-detail/adventure-detail.css" />
  <script type="application/ld+json">${JSON.stringify(buildJsonLd(entity))}</script>
</head>
<body class="wknd-aero appear">
  <main>
    <div class="section">
      <div class="adventure-detail block">
        <article class="adventure-detail-inner">
          <div class="adventure-detail-hero"${heroStyle}>
            <div class="adventure-detail-hero-copy">
              <p class="adventure-detail-eyebrow">${category}</p>
              <h1>${name}</h1>
            </div>
          </div>
          <div class="adventure-detail-body">
            <div class="adventure-detail-main">
              <p class="adventure-detail-lead">${desc}</p>
              <div class="adventure-detail-actions">
                <a class="adventure-detail-cta" href="/book/flights?dest=${escapeHtml(iata)}&amp;adv=${escapeHtml(slug)}">Find flights</a>
                <a class="adventure-detail-link" href="${editorial}" target="_blank" rel="noopener noreferrer">Read the full story on WKND Adventures</a>
              </div>
            </div>
            <aside class="adventure-detail-aside">
              <h2>Trip facts</h2>
              <dl>
                <div><dt>Destination airport</dt><dd>${escapeHtml(iata) || '—'}</dd></div>
                <div><dt>Category</dt><dd>${category || '—'}</dd></div>
                <div><dt>Flights from</dt><dd>$${price}</dd></div>
              </dl>
            </aside>
          </div>
        </article>
      </div>
    </div>
  </main>
</body>
</html>`;
}

/**
 * @param {object} env
 * @param {string} slug
 */
// eslint-disable-next-line import/prefer-default-export
export async function renderPipelinePage(env, slug) {
  const entity = await getCatalogEntity(env, slug);
  if (!entity) return null;
  return {
    html: buildPipelineHtml(entity),
    jsonLd: buildJsonLd(entity),
  };
}
