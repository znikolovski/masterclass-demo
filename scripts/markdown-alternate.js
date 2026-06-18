/**
 * Adds <link rel="alternate" type="text/markdown"> for the current page.
 * EDS serves authored content at /path.md (homepage: /index.md).
 * @param {Document} doc
 */
export default function addMarkdownAlternateLink(doc = document) {
  if (doc.querySelector('link[rel="alternate"][type="text/markdown"]')) return;

  const { pathname } = doc.location || window.location;
  const normalized = pathname.replace(/\/$/, '') || '/';

  if (normalized.startsWith('/blocks/') || normalized.startsWith('/tools/')) return;
  if (/\.[^/]+$/.test(normalized) && !normalized.endsWith('.html')) return;

  const href = normalized === '/' ? '/index.md' : `${normalized}.md`;

  const link = doc.createElement('link');
  link.rel = 'alternate';
  link.type = 'text/markdown';
  link.title = 'Markdown';
  link.href = href;
  doc.head.append(link);
}
