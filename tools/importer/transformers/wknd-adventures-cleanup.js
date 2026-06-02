/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: wknd-adventures cleanup.
 * Removes non-authorable site shell elements (nav, footer, skip link)
 * and non-content elements (scripts, styles, noscript).
 */
const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.beforeTransform) {
    // Remove script/style/noscript elements
    WebImporter.DOMUtils.remove(element, ['script', 'style', 'noscript', 'link[rel="stylesheet"]']);
    // Remove non-authorable site chrome
    WebImporter.DOMUtils.remove(element, ['.skip-link', '.navbar', 'footer.footer', 'footer.inverse-footer']);
  }
}
