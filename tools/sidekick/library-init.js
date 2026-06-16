/**
 * Sidekick library bootstrap (external module — safe under CSP nonce / strict-dynamic).
 */
const library = document.querySelector('sidekick-library') || document.createElement('sidekick-library');
library.config = library.config || {
  base: new URLSearchParams(window.location.search).get('base') || '/tools/sidekick/library.json',
};
if (!library.isConnected) {
  document.body.prepend(library);
}

// Upstream Sidekick blocks.js listens for e.details.path (typo); event uses e.detail.path.
document.addEventListener('PreviewBlock', (event) => {
  const path = event.detail?.path;
  if (!path) return;
  window.open(path, '_blockpreview');
  event.stopImmediatePropagation();
}, true);
