import { loadScript } from '../../scripts/aem.js';
import {
  getGoogleMapsApiKey,
  DEFAULT_MAP_ANALYTICS_CID,
  DEFAULT_MAP_ZOOM,
} from '../../scripts/maps-config.js';
import { pushInteractionEvent } from '../../scripts/analytics-acdl.js';
import { isSafePath, stripWkndTitleSuffix } from '../../scripts/paths.js';
import { fetchHelixIndex, helixIndexPath } from '../../scripts/index.js';
import {
  createAdventureCta,
  createAdventureImage,
} from '../../scripts/adventure-links.js';
import {
  bindCarouselNavigation,
  updateCarouselSlide,
} from '../../scripts/carousel.js';

const MAPS_CALLBACK = 'wkndAdventureMapReady';

const WKND_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#0f1a14' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8478' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f1a14' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2a2418' }],
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#3a3228' }, { saturation: -40 }],
  },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#4a4032' }, { saturation: -30 }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0a100d' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#2a2418' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1a1612' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b6358' }],
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

const PIN_SVG = '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 32 32\'><defs><filter id=\'g\' x=\'-50%\' y=\'-50%\' width=\'200%\' height=\'200%\'><feDropShadow dx=\'0\' dy=\'4\' stdDeviation=\'4\' flood-color=\'#e8651a\' flood-opacity=\'0.55\'/></filter></defs><rect width=\'32\' height=\'32\' rx=\'12\' fill=\'#e8651a\' filter=\'url(#g)\'/><path fill=\'#fff\' d=\'M16 8.5a3.5 3.5 0 0 0-3.5 3.5c0 2.6 3.5 7.8 3.5 7.8s3.5-5.2 3.5-7.8A3.5 3.5 0 0 0 16 8.5zm0 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z\'/></svg>';

const PIN_ICON_URL = `data:image/svg+xml,${encodeURIComponent(PIN_SVG)}`;

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
 * @returns {Promise<object[]>}
 */
async function fetchAdventures() {
  try {
    const rows = await fetchHelixIndex(helixIndexPath('adventures-map-index.json'));
    return rows
      .map((entry) => {
        const coords = parseCoordinates(entry.latitude, entry.longitude);
        if (!coords || !entry.title || !isSafePath(entry.path)) return null;
        return {
          path: entry.path,
          title: stripWkndTitleSuffix(entry.title),
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
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
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
      key: apiKey,
      loading: 'async',
      callback: MAPS_CALLBACK,
    });

    loadScript(`https://maps.googleapis.com/maps/api/js?${params.toString()}`).catch(reject);
  });
}

/**
 * @param {Element} canvasWrap
 * @param {string} message
 */
function showCanvasMessage(canvasWrap, message) {
  let msg = canvasWrap.querySelector('.adventure-map-canvas-message');
  if (!msg) {
    msg = document.createElement('p');
    msg.className = 'adventure-map-canvas-message';
    msg.setAttribute('role', 'status');
    canvasWrap.append(msg);
  }
  msg.textContent = message;
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

  const imageEl = createAdventureImage({
    image: adventure.image,
    title: adventure.title,
    wrapperClass: 'adventure-map-popup-image',
  });
  if (imageEl) wrap.append(imageEl);

  const body = document.createElement('div');
  body.className = 'adventure-map-popup-body';

  const title = document.createElement('h3');
  title.className = 'adventure-map-popup-title';
  title.textContent = adventure.title.toUpperCase();
  body.append(title);

  const description = adventure.description || adventure.placeName || '';
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'adventure-map-popup-description';
    desc.textContent = description;
    body.append(desc);
  }

  body.append(createAdventureCta({
    path: adventure.path,
    analyticsCid,
    label: 'View adventure',
    className: 'adventure-map-popup-cta',
  }));
  wrap.append(body);

  return wrap;
}

/**
 * @returns {import('../../scripts/carousel.js').CarouselOptions}
 */
function getNearbyCarouselOptions() {
  return {
    selectors: {
      slide: '.adventure-map-nearby-slide',
      track: '.adventure-map-nearby-track',
      prev: '.adventure-map-nearby-prev',
      next: '.adventure-map-nearby-next',
    },
    respectReducedMotion: true,
  };
}

/**
 * @param {Element} nearby
 * @param {number} slideIndex
 */
function updateNearbySlide(nearby, slideIndex) {
  updateCarouselSlide(nearby, slideIndex, getNearbyCarouselOptions());
}

/**
 * @param {Element} nearby
 */
function bindNearbyCarousel(nearby) {
  if (nearby.dataset.carouselClickBound === 'true') return;
  nearby.dataset.carouselClickBound = 'true';
  bindCarouselNavigation(nearby, getNearbyCarouselOptions());
}

/**
 * @param {object} adventure
 * @param {string} analyticsCid
 * @returns {HTMLLIElement}
 */
function createNearbyCard(adventure, analyticsCid) {
  const li = document.createElement('li');
  li.className = 'adventure-map-nearby-slide';

  const card = document.createElement('article');
  card.className = 'adventure-map-nearby-card';

  const imageEl = createAdventureImage({
    image: adventure.image,
    title: adventure.title,
    imageClass: 'adventure-map-nearby-card-bg',
    placeholderClass: 'adventure-map-nearby-card-bg-placeholder',
  });
  if (imageEl) card.append(imageEl);

  const copy = document.createElement('div');
  copy.className = 'adventure-map-nearby-card-copy';

  const title = document.createElement('h4');
  title.className = 'adventure-map-nearby-card-title';
  title.textContent = (adventure.placeName || adventure.title).toUpperCase();
  copy.append(title);

  const description = adventure.description || '';
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'adventure-map-nearby-card-description';
    desc.textContent = description;
    copy.append(desc);
  }

  copy.append(createAdventureCta({
    path: adventure.path,
    analyticsCid,
    label: 'View details',
    className: 'adventure-map-nearby-card-cta',
  }));
  card.append(copy);
  li.append(card);

  return li;
}

/**
 * @param {Element|null} list
 * @param {object[]} visible
 * @param {object} config
 */
function renderAdventureList(list, visible, config) {
  if (!list) return;

  list.replaceChildren();
  list.classList.toggle('adventure-map-nearby-empty', visible.length === 0);
  if (visible.length === 0) return;

  list.dataset.activeSlide = '0';
  list.setAttribute('role', 'region');
  list.setAttribute('aria-roledescription', 'Carousel');
  list.setAttribute('aria-label', 'Adventures in this area');

  const header = document.createElement('div');
  header.className = 'adventure-map-nearby-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'adventure-map-nearby-eyebrow';
  eyebrow.textContent = 'Local discoveries';

  const heading = document.createElement('h3');
  heading.className = 'adventure-map-nearby-heading';
  heading.textContent = 'Adventures in this area';

  header.append(eyebrow, heading);

  if (visible.length > 1) {
    const controls = document.createElement('div');
    controls.className = 'adventure-map-nearby-controls';
    controls.innerHTML = `
      <div class="adventure-map-nearby-nav">
        <button type="button" class="adventure-map-nearby-prev" aria-label="Previous adventure"></button>
        <button type="button" class="adventure-map-nearby-next" aria-label="Next adventure"></button>
      </div>
    `;
    header.append(controls);
  }

  list.append(header);

  const trackWrap = document.createElement('div');
  trackWrap.className = 'adventure-map-nearby-track-wrap';

  const track = document.createElement('ul');
  track.className = 'adventure-map-nearby-track';
  visible.forEach((adventure) => {
    track.append(createNearbyCard(adventure, config.analyticsCid));
  });

  trackWrap.append(track);
  list.append(trackWrap);

  list.dataset.carouselClickBound = 'false';
  bindNearbyCarousel(list);
  updateNearbySlide(list, 0);
}

/**
 * @param {Element} block
 * @param {object} config
 * @param {object[]} adventures
 */
function initListOnly(block, config, adventures) {
  const countEl = block.querySelector('.adventure-map-count');
  const list = block.querySelector('.adventure-map-nearby');
  if (countEl) {
    countEl.textContent = adventures.length
      ? `Showing ${adventures.length} adventure${adventures.length === 1 ? '' : 's'}`
      : '';
  }
  renderAdventureList(list, adventures, config);
}

/**
 * @param {Element} block
 * @param {object} config
 * @param {object[]} adventures
 * @param {typeof google.maps} maps
 */
function initMap(block, config, adventures, maps) {
  const canvas = block.querySelector('.adventure-map-canvas');
  const list = block.querySelector('.adventure-map-nearby');
  const countEl = block.querySelector('.adventure-map-count');
  if (!canvas) return;

  block.classList.add('adventure-map-loaded');

  const preferReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mapOptions = {
    styles: WKND_MAP_STYLES,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: true,
    backgroundColor: '#0f1a14',
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
        scaledSize: new maps.Size(32, 32),
        anchor: new maps.Point(16, 16),
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

  let lastVisibleKey = '';

  /**
   * @param {object[]} visible
   */
  function renderList(visible) {
    const visibleKey = visible.map((adventure) => adventure.path).join('|');
    if (visibleKey === lastVisibleKey) return;
    lastVisibleKey = visibleKey;
    renderAdventureList(list, visible, config);
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
  block.classList.add('adventure-map-loading');
  const canvasWrap = block.querySelector('.adventure-map-canvas-wrap');

  let adventures = [];
  try {
    adventures = await fetchAdventures();
  } finally {
    block.classList.remove('adventure-map-loading');
  }

  if (adventures.length === 0) {
    if (canvasWrap) {
      showCanvasMessage(canvasWrap, 'No adventures with map coordinates are available yet.');
    } else {
      showMessage(block, 'No adventures with map coordinates are available yet.');
    }
    return;
  }

  let maps = null;
  try {
    maps = await loadGoogleMaps();
  } catch {
    if (canvasWrap) {
      showCanvasMessage(
        canvasWrap,
        'Map unavailable. Set a referrer-restricted Google Maps API key in scripts/maps-config.js or page metadata.',
      );
    }
    initListOnly(block, config, adventures);
    return;
  }

  initMap(block, config, adventures, maps);
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

  const vignette = document.createElement('div');
  vignette.className = 'adventure-map-vignette';
  vignette.setAttribute('aria-hidden', 'true');

  const brand = document.createElement('div');
  brand.className = 'adventure-map-brand';
  brand.setAttribute('aria-hidden', 'true');
  brand.innerHTML = '<p class="adventure-map-brand-title">WKND Global Explorer</p><p class="adventure-map-brand-meta">V 2.4.0 // Live data feed</p>';

  const canvas = document.createElement('div');
  canvas.className = 'adventure-map-canvas';
  canvasWrap.append(vignette, canvas, brand);

  const list = document.createElement('div');
  list.className = 'adventure-map-nearby adventure-map-nearby-empty';

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
