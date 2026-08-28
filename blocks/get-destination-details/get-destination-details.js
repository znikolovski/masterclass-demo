// Sample data for standalone/preview mode.
// In production, data comes dynamically from bridge.toolResult.
const SAMPLE_DATA = [
  {
    name: 'Lofoten Islands: Arctic Surfing at the Top of the World',
    description: 'Seven days surfing between the Lofoten peaks in Norway — 7°C seas, Atlantic swell windows, and the legendary Unstad break under arctic skies.',
    image_url: 'https://wknd-adventures.run.place/blog/media_1bd10685af4f3d38127de55d4da60d4ef86518b8d.jpg?width=1200&format=pjpg&optimize=medium',
    category: 'Surf',
  },
  {
    name: 'W Circuit: 9 Days, 115 km — Patagonia',
    description: 'A day-by-day journal of the W Circuit through Torres del Paine — permit strategy, refugio logistics, Patagonian wind, and Grey Glacier.',
    image_url: 'https://wknd-adventures.run.place/blog/media_1e4b49be43a70d306b1c312d0d78dd369b5ccce40.jpg?width=750&format=jpg&optimize=medium',
    category: 'Expedition',
  },
  {
    name: 'Six Days Through the High Alps by Bike',
    description: 'A self-supported touring ride over Col du Galibier, Col d\'Izoard, and Col du Télégraphe from Saint-Jean-de-Maurienne to Briançon.',
    image_url: 'https://wknd-adventures.run.place/blog/media_1e56ff87aeb7dc7d3d4eb4acd41d468f583a00303.jpg?width=750&format=jpg&optimize=medium',
    category: 'Cycling',
  },
];

// Brand palette from the action payload — used to derive card info-strip background.
const PALETTE = ['#e8651a', '#0f1a14'];

function getThemedCardBg(palette) {
  if (!palette || !palette[0]) return null;
  let hex = palette[0].replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  if (hex.length !== 6) return null;
  let [r, g, b] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  const lum = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const relLum = (rr, gg, bb) => 0.2126 * lum(rr) + 0.7152 * lum(gg) + 0.0722 * lum(bb);
  if (relLum(r, g, b) <= 0.12) return { bg: `#${hex}`, fg: '#ffffff' };
  let lo = 0; let hi = 1;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (relLum(Math.round(r * m), Math.round(g * m), Math.round(b * m)) > 0.12) hi = m; else lo = m;
  }
  const dr = Math.round(r * lo); const dg = Math.round(g * lo); const db = Math.round(b * lo);
  return { bg: `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`, fg: '#ffffff' };
}
const theme = getThemedCardBg(PALETTE);

const CARD_COLORS = ['#e8651a', '#9256d9', '#0fb5ae', '#e68619', '#d83790', '#2dca72', '#4046ca', '#72b340'];

export default async function decorate(block, bridge) {
  let item;

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      item = SAMPLE_DATA[0];
    } else {
      // Detail concept — structuredContent IS the item (flat). No wrapper key.
      const _result = await bridge.toolResult;
      item = _result?.structuredContent || {};
    }
  } else {
    item = SAMPLE_DATA[0];
  }

  block.textContent = '';

  if (!item?.name) {
    const empty = document.createElement('p');
    empty.className = 'gdd-empty';
    empty.textContent = 'No matching adventure was found.';
    block.appendChild(empty);
  } else {
    renderDetail(block, item, bridge);
  }

  if (bridge) {
    bridge.reportSize(block.offsetWidth, block.offsetHeight);
    let resizeTimer;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => bridge.reportSize(block.offsetWidth, block.offsetHeight), 150);
    });
    ro.observe(block);
  }
}

function renderDetail(block, item, bridge) {
  const card = document.createElement('div');
  card.className = 'gdd-card';

  // Image LEFT
  const imageContainer = document.createElement('div');
  imageContainer.className = 'gdd-image';

  const fallbackColor = CARD_COLORS[0];
  const colorDiv = () => {
    const d = document.createElement('div');
    d.style.cssText = `width:100%;height:100%;background-color:${fallbackColor};`;
    return d;
  };
  if (item.image_url) {
    const img = document.createElement('img');
    img.src = item.image_url;
    img.alt = item.name || '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    img.onerror = () => img.parentNode.replaceChild(colorDiv(), img);
    imageContainer.appendChild(img);
  } else {
    imageContainer.appendChild(colorDiv());
  }
  card.appendChild(imageContainer);

  // Content RIGHT
  const content = document.createElement('div');
  content.className = 'gdd-content';
  content.style.cssText = `background:${theme?.bg ?? '#1a1a1a'};color:${theme?.fg ?? '#fff'}`;

  if (item.category) {
    const badge = document.createElement('span');
    badge.className = 'gdd-badge';
    badge.textContent = item.category;
    content.appendChild(badge);
  }

  const title = document.createElement('h3');
  title.className = 'gdd-title';
  title.textContent = item.name;
  content.appendChild(title);

  if (item.description) {
    const desc = document.createElement('p');
    desc.className = 'gdd-desc';
    desc.textContent = item.description;
    content.appendChild(desc);
  }

  const btn = document.createElement('button');
  btn.className = 'gdd-cta';
  btn.type = 'button';
  btn.textContent = 'Plan This Trip';
  if (bridge) {
    btn.addEventListener('click', () => {
      bridge.sendMessage(`Help me plan a trip for ${item.name}`);
    });
  }
  content.appendChild(btn);

  card.appendChild(content);
  block.appendChild(card);
}
