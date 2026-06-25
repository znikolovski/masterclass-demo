/**
 * WKND Aero site header.
 */
import { getMetadata } from '../../../scripts/aem.js';
import { pushInteractionEvent } from '../../../scripts/analytics-acdl.js';

const isDesktop = window.matchMedia('(min-width: 900px)');

/** Nav link labels treated as header actions (not primary nav). */
const ACTION_LABELS = new Set(['FLIGHT STATUS', 'SIGN IN', 'SIGN IN / JOIN']);

/**
 * @param {Element} nav
 * @param {boolean} [open]
 */
function toggleMobileNav(nav, open) {
  const expanded = open ?? nav.getAttribute('aria-expanded') !== 'true';
  nav.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  document.body.style.overflowY = expanded && !isDesktop.matches ? 'hidden' : '';
  const btn = nav.querySelector('.aero-header-toggle');
  if (btn) btn.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
}

/**
 * @param {HTMLAnchorElement} link
 * @returns {boolean}
 */
function isActionLink(link) {
  const label = link.textContent.trim().toUpperCase();
  return ACTION_LABELS.has(label);
}

/**
 * @param {HTMLAnchorElement} link
 * @returns {string}
 */
function renderActionLink(link) {
  const label = link.textContent.trim();
  const isPrimary = label.toUpperCase() === 'SIGN IN' || label.toUpperCase() === 'SIGN IN / JOIN';
  const cls = isPrimary ? 'aero-header-action aero-header-action--primary' : 'aero-header-action';
  return `<a href="${link.href}" class="${cls}">${label}</a>`;
}

/**
 * @param {HTMLAnchorElement[]} links
 * @returns {{
 *   brand: HTMLAnchorElement|null,
 *   navLinks: HTMLAnchorElement[],
 *   actions: HTMLAnchorElement[],
 * }}
 */
function splitNavLinks(links) {
  const brand = links.shift() || null;
  const navLinks = [];
  const actions = [];
  links.forEach((link) => {
    if (isActionLink(link)) actions.push(link);
    else navLinks.push(link);
  });
  return { brand, navLinks, actions };
}

/** Default nav fragment on seeded WKND Aero DA sites. */
const DEFAULT_NAV_PATH = '/nav';

/**
 * @param {string} [navMeta]
 * @returns {string}
 */
function resolveNavPath(navMeta) {
  if (navMeta) return new URL(navMeta, window.location).pathname;
  return DEFAULT_NAV_PATH;
}

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
async function fetchNavHtml(path) {
  const resp = await fetch(`${path}.plain.html`);
  if (!resp.ok) return '';
  return resp.text();
}

/**
 * @param {HTMLAnchorElement|null} brand
 * @returns {string}
 */
function renderBrand(brand) {
  if (!brand) {
    return '<a href="/" class="aero-header-logo">WKND<br>AERO</a>';
  }
  const label = brand.textContent.trim();
  const href = brand.getAttribute('href') || '/';
  if (/^WKND\s+AERO$/i.test(label)) {
    return `<a href="${href}" class="aero-header-logo">WKND<br>AERO</a>`;
  }
  return brand.outerHTML.replace('<a ', '<a class="aero-header-logo" ');
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const navPath = resolveNavPath(getMetadata('nav'));

  let html = await fetchNavHtml(navPath);
  if (!html && navPath !== DEFAULT_NAV_PATH) {
    html = await fetchNavHtml(DEFAULT_NAV_PATH);
  }

  block.textContent = '';
  block.classList.add('block');

  const nav = document.createElement('nav');
  nav.className = 'aero-header-nav';
  nav.setAttribute('aria-label', 'Main');
  nav.setAttribute('aria-expanded', 'false');

  if (html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const { brand, navLinks, actions } = splitNavLinks([...tmp.querySelectorAll('a')]);
    nav.innerHTML = `
      <div class="aero-header-brand">${renderBrand(brand)}</div>
      <button type="button" class="aero-header-toggle" aria-expanded="false" aria-controls="aero-header-menu">
        <span class="aero-header-toggle-bar"></span>
        <span class="aero-header-toggle-bar"></span>
        <span class="aero-header-toggle-bar"></span>
      </button>
      <div id="aero-header-menu" class="aero-header-menu">
        <ul class="aero-header-links">${navLinks.map((a) => `<li><a href="${a.href}">${a.textContent.trim()}</a></li>`).join('')}</ul>
        <div class="aero-header-actions">${actions.map((a) => renderActionLink(a)).join('')}</div>
      </div>`;
  } else {
    nav.innerHTML = `
      <div class="aero-header-brand">
        <a href="/" class="aero-header-logo">WKND<br>AERO</a>
      </div>
      <button type="button" class="aero-header-toggle" aria-expanded="false" aria-controls="aero-header-menu">
        <span class="aero-header-toggle-bar"></span>
        <span class="aero-header-toggle-bar"></span>
        <span class="aero-header-toggle-bar"></span>
      </button>
      <div id="aero-header-menu" class="aero-header-menu">
        <ul class="aero-header-links"></ul>
        <div class="aero-header-actions"></div>
      </div>`;
  }

  const toggle = nav.querySelector('.aero-header-toggle');
  toggle?.addEventListener('click', () => toggleMobileNav(nav));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && nav.getAttribute('aria-expanded') === 'true') toggleMobileNav(nav, false);
  });
  isDesktop.addEventListener('change', () => toggleMobileNav(nav, false));

  nav.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      pushInteractionEvent('navClick', { block: 'aero-header', label: a.textContent.trim() });
    });
    if (a.pathname === window.location.pathname) a.classList.add('active');
  });

  block.append(nav);
}
