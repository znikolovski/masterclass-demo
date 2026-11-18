/**
 * Shared shop stylesheet (eyebrows, badges, promises, drop-in theme). Dependency-free so blocks
 * can wait for it before painting server/placeholder content without loading commerce.js.
 */

/**
 * Resolves when a stylesheet has loaded — including one already requested elsewhere
 * (scripts.js starts commerce.css on shop pages; aem.js loadCSS would resolve immediately).
 * @param {string} href
 * @param {number} [timeout]
 */
export function stylesheetReady(href, timeout = 2000) {
  let link = document.head.querySelector(`link[rel="stylesheet"][href="${href}"]`);
  if (link?.sheet) return Promise.resolve();
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
  return new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, timeout);
  });
}

/** commerce.css, so shop content is revealed styled rather than re-flowed. */
export function shopStylesReady() {
  return stylesheetReady(`${window.hlx?.codeBasePath || ''}/styles/commerce.css`);
}
