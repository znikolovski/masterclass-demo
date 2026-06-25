import { loadScript } from '../../scripts/aem.js';
import {
  GOOGLE_MAPS_API_KEY,
  DEFAULT_MAP_ANALYTICS_CID,
  DEFAULT_MAP_ZOOM,
} from '../../scripts/maps-config.js';
import { pushInteractionEvent } from '../../scripts/analytics-acdl.js';

const MAPS_CALLBACK = 'wkndAdventureMapReady';

const WKND_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#f4f2ef' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#0f1a14' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4f2ef' }] },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#c5d4d0' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#e8e6e3' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#0f1a14' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
];

const PIN_SVG = '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'40\' viewBox=\'0 0 32 40\'><path fill=\'#e8651a\' stroke=\'#0f1a14\' stroke-width=\'1.5\' d=\'M16 1C9.925 1 5 5.925 5 12c0 8.25 11 27 11 27s11-18.75 11-27c0-6.075-4.925-11-11-11z\'/><circle cx=\'16\' cy=\'12\' r=\'4\' fill=\'#f4f2ef\'/></svg>';

const PIN_ICON_URL = `data:image/svg+xml,${encodeURIComponent(PIN_SVG)}`;

/**
 * @param {string} path
 * @returns {boolean}
 */
function isSafePath(path) {
  return typeof path === 'string' && /^\/[a-z0-9\-/]*$/i.test(path);
}

/**
 * @param {string|number} lat
 * @param {string|number} lng
 * @returns {{ lat: number, lng: number }|null}
 */
function parseCoordinates(lat, lng) {
  const latitude = Number.parseFloat(String(lat));
  const longitude = Number.parseFloat(String(lng));
  if (
    Number.isNaN(latitude)
    || Number.isNaN(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

/**
 * @param {Element} block
 * @returns {{ heading: string, defaultZoom: number, analyticsCid: string }}
 */
function parseConfig(block) {
  const row = block.querySelector(':scope > div');
  const headingEl = row?.querySelector('h2');
  const cells = [...row?.children || []].map((cell) => cell.textContent.trim());

  let defaultZoom = DEFAULT_MAP_ZOOM;
  let analyticsCid = DEFAULT_MAP_ANALYTICS_CID;

  const zoomCell = row?.querySelector('div:nth-child(2)');
  if (zoomCell && !zoomCell.querySelector('h2')) {
    const parsed = Number.parseInt(zoomCell.textContent.trim(), 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 18) {
      defaultZoom = parsed;
    }
  }

  const cidCell = row?.querySelector('div:nth-child(3)');
  if (cidCell && !cidCell.querySelector('h2')) {
    const cidText = cidCell.textContent.trim().replace(/^cid\s*:?\s*/i, '');
    if (cidText) analyticsCid = cidText;
  }

  return {
    heading: headingEl?.textContent?.trim() || cells[0] || 'Adventure map',
    defaultZoom,
    analyticsCid: analyticsCid || DEFAULT_MAP_ANALYTICS_CID,
  };
}

/**
 * @param {string} path
 * @param {string} cid
 * @returns {string}
 */
function buildAdventureUrl(path, cid) {
  if (!isSafePath(path)) return '#';
  const url = new URL(path, window.location.origin);
  url.searchParams.set('cid', cid);
  return `${url.pathname}${url.search}`;
}

/**
 * @param {string} category
 * @returns {string}
 */
function formatCategory(category) {
  if (!category) return 'Adventure';
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * @returns {Promise<object[]>}
 */
async function fetchAdventures() {
  const base = window.hlx.codeBasePath || '';
  const indexPath = `${base}/adventures-map-index.json`;
  try {
    const resp = await fetch(indexPath);
    if (!resp.ok) return [];
    const json = await resp.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows
      .map((entry) => {
        const coords = parseCoordinates(entry.latitude, entry.longitude);
        if (!coords || !entry.title || !isSafePath(entry.path)) return null;
        return {
          path: entry.path,
          title: entry.title.replace(/\s+—\s+WKND Adventures$/i, '').trim(),
          description: entry.description || '',
          image: entry.image || '',
          category: entry.adventureCategory || '',
          placeName: entry.placeName || '',
          position: coords,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @returns {Promise<typeof google.maps>}
 */
function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error('Maps API key not configured'));
      return;
    }

    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps));
      existing.addEventListener('error', reject);
      return;
    }

    window[MAPS_CALLBACK] = () => {
      delete window[MAPS_CALLBACK];
      resolve(window.google.maps);
    };

    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      loading: 'async',
      callback: MAPS_CALLBACK,
    });

    loadScript(`https://maps.googleapis.com/maps/api/js?${params.toString()}`).catch(reject);
  });
}

/**
 * @param {Element} block
 * @param {string} message
 */
function showMessage(block, message) {
  const existing = block.querySelector('.adventure-map-message');
  if (existing) {
    existing.textContent = message;
    return;
  }
  const msg = document.createElement('p');
  msg.className = 'adventure-map-message';
  msg.textContent = message;
  block.append(msg);
}

/**
 * @param {object} adventure
 * @param {string} analyticsCid
 * @returns {HTMLElement}
 */
function createInfoWindowContent(adventure, analyticsCid) {
  const wrap = document.createElement('div');
  wrap.className = 'adventure-map-popup';

  if (adventure.image) {
    const img = document.createElement('img');
    img.src = adventure.image;
    img.alt = adventure.title;
    img.loading = 'lazy';
    img.width = 240;
    img.height = 135;
    wrap.append(img);
  }

  const tag = document.createElement('p');
  tag.className = 'adventure-map-popup-tag';
  tag.textContent = formatCategory(adventure.category);
  wrap.append(tag);

  const title = document.createElement('h3');
  title.className = 'adventure-map-popup-title';
  title.textContent = adventure.title;
  wrap.append(title);

  if (adventure.placeName) {
    const place = document.createElement('p');
    place.className = 'adventure-map-popup-place';
    place.textContent = adventure.placeName;
    wrap.append(place);
  }

  const ctaWrap = document.createElement('p');
  ctaWrap.className = 'button-container';
  const cta = document.createElement('a');
  cta.className = 'button';
  cta.href = buildAdventureUrl(adventure.path, analyticsCid);
  cta.textContent = 'View adventure';
  cta.addEventListener('click', () => {
    pushInteractionEvent('ctaClick', {
      label: cta.textContent.trim(),
      block: 'adventure-map',
      detail: cta.getAttribute('href') || '',
    });
  });
  ctaWrap.append(cta);
  wrap.append(ctaWrap);

  return wrap;
}

/**
 * @param {Element} block
 * @param {object} config
 * @param {object[]} adventures
 * @param {typeof google.maps} maps
 */
function initMap(block, config, adventures, maps) {
  const canvas = block.querySelector('.adventure-map-canvas');
  const list = block.querySelector('.adventure-map-list');
  const countEl = block.querySelector('.adventure-map-count');
  if (!canvas) return;

  block.classList.add('adventure-map-loaded');

  const preferReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mapOptions = {
    styles: WKND_MAP_STYLES,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: 'cooperative',
  };

  const map = new maps.Map(canvas, {
    ...mapOptions,
    center: { lat: 20, lng: 0 },
    zoom: config.defaultZoom,
  });

  const bounds = new maps.LatLngBounds();
  adventures.forEach((adventure) => bounds.extend(adventure.position));

  if (adventures.length >= 2) {
    map.fitBounds(bounds, 48);
  } else if (adventures.length === 1) {
    map.setCenter(adventures[0].position);
    map.setZoom(Math.max(config.defaultZoom, 6));
  }

  const infoWindow = new maps.InfoWindow();
  /** @type {{ marker: google.maps.Marker, adventure: object }[]} */
  const markerEntries = adventures.map((adventure) => {
    const marker = new maps.Marker({
      position: adventure.position,
      map: null,
      title: adventure.title,
      icon: {
        url: PIN_ICON_URL,
        scaledSize: new maps.Size(32, 40),
        anchor: new maps.Point(16, 40),
      },
    });

    marker.addListener('click', () => {
      pushInteractionEvent('mapPinClick', {
        block: 'adventure-map',
        label: adventure.title,
        detail: adventure.path,
      });
      infoWindow.setContent(createInfoWindowContent(adventure, config.analyticsCid));
      infoWindow.open({ map, anchor: marker });
      if (!preferReducedMotion) {
        map.panTo(adventure.position);
      }
    });

    return { marker, adventure };
  });

  /**
   * @param {object[]} visible
   */
  function renderList(visible) {
    if (!list) return;
    list.replaceChildren();
    const heading = document.createElement('h3');
    heading.className = 'adventure-map-list-heading';
    heading.textContent = 'Adventures in this area';
    list.append(heading);

    const ul = document.createElement('ul');
    visible.forEach((adventure) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = buildAdventureUrl(adventure.path, config.analyticsCid);
      link.textContent = adventure.placeName
        ? `${adventure.title} — ${adventure.placeName}`
        : adventure.title;
      li.append(link);
      ul.append(li);
    });
    list.append(ul);
  }

  function updateVisibleMarkers() {
    const mapBounds = map.getBounds();
    if (!mapBounds) return;

    const visible = [];
    markerEntries.forEach(({ marker, adventure }) => {
      const inBounds = mapBounds.contains(adventure.position);
      marker.setMap(inBounds ? map : null);
      if (inBounds) visible.push(adventure);
    });

    if (countEl) {
      countEl.textContent = visible.length
        ? `Showing ${visible.length} adventure${visible.length === 1 ? '' : 's'} in this area`
        : 'No adventures in this map area';
    }
    renderList(visible);
  }

  maps.event.addListener(map, 'idle', updateVisibleMarkers);
  updateVisibleMarkers();
}

/**
 * @param {Element} block
 * @param {{ heading: string, defaultZoom: number, analyticsCid: string }} config
 */
async function loadMapBlock(block, config) {
  try {
    const [adventures, maps] = await Promise.all([
      fetchAdventures(),
      loadGoogleMaps(),
    ]);

    if (adventures.length === 0) {
      showMessage(block, 'No adventures with map coordinates are available yet.');
      return;
    }

    initMap(block, config, adventures, maps);
  } catch {
    showMessage(block, 'Map unavailable. Check Google Maps API configuration.');
  }
}

/**
 * @param {Element} block
 */
function buildMapShell(block, config) {
  block.replaceChildren();

  const header = document.createElement('div');
  header.className = 'adventure-map-header';
  const heading = document.createElement('h2');
  heading.id = `adventure-map-${block.dataset.blockUid || 'heading'}`;
  heading.textContent = config.heading;
  header.append(heading);

  const count = document.createElement('p');
  count.className = 'adventure-map-count';
  count.setAttribute('aria-live', 'polite');
  header.append(count);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'adventure-map-canvas-wrap';
  const canvas = document.createElement('div');
  canvas.className = 'adventure-map-canvas';
  canvasWrap.append(canvas);

  const list = document.createElement('div');
  list.className = 'adventure-map-list';

  block.append(header, canvasWrap, list);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-labelledby', heading.id);
}

/**
 * @param {Element} block
 */
export default function decorate(block) {
  if (block.dataset.adventureMapInit === 'true') return;
  block.dataset.adventureMapInit = 'true';
  block.dataset.blockUid = String(Math.random()).slice(2, 8);

  const config = parseConfig(block);
  buildMapShell(block, config);

  const observer = new IntersectionObserver((entries) => {
    const [entry] = entries;
    if (!entry?.isIntersecting) return;
    observer.disconnect();
    loadMapBlock(block, config);
  }, { rootMargin: '100px' });

  observer.observe(block);
}
