/**
 * Booking journey — Preact SPA shell (delayed load on /book/*).
 */
import { loadCSS } from '../../../scripts/aem.js';
import { getAeroApiBase, readFlightAttribution, DEFAULT_FLIGHT_ORIGIN } from '../../../scripts/aero-blocks.js';

const IMPORT_MAP = {
  imports: {
    preact: 'https://esm.sh/preact@10.24.3',
    'preact/hooks': 'https://esm.sh/preact@10.24.3/hooks',
    'preact/jsx-runtime': 'https://esm.sh/preact@10.24.3/jsx-runtime',
  },
};

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const codeBase = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBase}/blocks/aero/booking-journey/booking-journey.css`);

  block.textContent = '';
  block.classList.add('block');

  const noscript = document.createElement('noscript');
  noscript.innerHTML = '<p>JavaScript is required to complete your booking. <a href="/">Return home</a></p>';
  block.append(noscript);

  const mount = document.createElement('div');
  mount.id = 'booking-journey-app';
  mount.className = 'booking-journey-mount';
  block.append(mount);

  if (!document.querySelector('script[type="importmap"]')) {
    const el = document.createElement('script');
    el.type = 'importmap';
    el.textContent = JSON.stringify(IMPORT_MAP);
    document.head.append(el);
  }

  const params = new URLSearchParams(window.location.search);
  const attrs = readFlightAttribution();
  mount.dataset.origin = params.get('origin') || attrs.origin || DEFAULT_FLIGHT_ORIGIN;
  mount.dataset.dest = params.get('dest') || attrs.dest || '';
  mount.dataset.depart = params.get('depart') || '';
  mount.dataset.passengers = params.get('passengers') || '1';
  mount.dataset.api = getAeroApiBase();

  try {
    const mod = await import('./app/index.js');
    mod.default(mount);
  } catch (err) {
    mount.innerHTML = '<div class="booking-empty"><p>Unable to load booking. Please refresh or <a href="/">return home</a>.</p></div>';
    // eslint-disable-next-line no-console
    console.error('booking-journey failed', err);
  }
}
