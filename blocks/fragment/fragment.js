/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

// eslint-disable-next-line import/no-cycle
import {
  decorateMain,
} from '../../scripts/scripts.js';

import {
  loadSections,
} from '../../scripts/aem.js';

/**
 * Normalizes authored fragment references (relative paths, .aem.page/.aem.live/.aem.network
 * URLs, or content.da.live paths) to a site-root path for .plain.html fetch.
 * @param {string} pathOrUrl Fragment reference from the block or a link
 * @returns {string|null} Path such as /fragments/my-fragment, or null if invalid
 */
export function resolveFragmentPath(pathOrUrl) {
  if (!pathOrUrl?.trim()) return null;
  let path = pathOrUrl.trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname;
    } else {
      path = new URL(path, window.location.href).pathname;
    }
  } catch {
    return null;
  }
  if (path.endsWith('.html')) path = path.slice(0, -5);
  if (path.endsWith('/')) path = path.slice(0, -1);

  // content.da.live: /{org}/{site}/fragments/... → /fragments/...
  const contentBusMatch = path.match(/^\/[^/]+\/[^/]+(\/fragments\/.*)$/);
  if (contentBusMatch) [, path] = contentBusMatch;

  if (path.startsWith('/') && !path.startsWith('//')) return path;
  return null;
}

/**
 * Loads a fragment.
 * @param {string} pathOrUrl The path or URL to the fragment
 * @returns {HTMLElement|null} The root element of the fragment
 */
export async function loadFragment(pathOrUrl) {
  const path = resolveFragmentPath(pathOrUrl);
  if (!path) return null;

  const resp = await fetch(`${path}.plain.html`);
  if (!resp.ok) return null;

  const main = document.createElement('main');
  main.innerHTML = await resp.text();

  // reset base path for media to fragment base
  const resetAttributeBase = (tag, attr) => {
    main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
      elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
    });
  };
  resetAttributeBase('img', 'src');
  resetAttributeBase('source', 'srcset');

  decorateMain(main);
  await loadSections(main);
  return main;
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const raw = link ? (link.getAttribute('href') || link.href) : block.textContent.trim();
  const path = resolveFragmentPath(raw);
  const fragment = path ? await loadFragment(path) : null;
  if (fragment) {
    block.replaceChildren(...fragment.childNodes);
    return;
  }

  block.classList.add('fragment-error');
  const message = document.createElement('p');
  message.textContent = path
    ? `Fragment could not be loaded (${path}). Preview the fragment on the site, then refresh.`
    : 'Fragment path is missing or invalid. Select a fragment under /fragments/.';
  block.replaceChildren(message);
}
