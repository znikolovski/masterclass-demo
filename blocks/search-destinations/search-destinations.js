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
    description: "A self-supported touring ride over Col du Galibier, Col d'Izoard, and Col du Télégraphe from Saint-Jean-de-Maurienne to Briançon.",
    image_url: 'https://wknd-adventures.run.place/blog/media_1e56ff87aeb7dc7d3d4eb4acd41d468f583a00303.jpg?width=750&format=jpg&optimize=medium',
    category: 'Cycling',
  },
  {
    name: 'First Light on the Valley: Yosemite Rock Climbing',
    description: "A beginner's guide to Yosemite climbing — Swan Slab crack routes, the Yosemite Decimal grading system, trad gear lists, and season permits.",
    image_url: 'https://wknd-adventures.run.place/blog/media_13abc2aa7399e068d346e9f883c5be81f0bdfabf5.avif?width=750&format=avif&optimize=medium',
    category: 'Climbing',
  },
  {
    name: 'Why Cold Routes Demand Warm Minds: Winter Mountaineering',
    description: 'A winter mountaineering primer covering ice axe technique, crampon use, avalanche awareness, and a Ben Nevis case study.',
    image_url: 'https://wknd-adventures.run.place/blog/media_12bab1a689efff46698aae2d4591400d1208853ff.avif?width=750&format=avif&optimize=medium',
    category: 'Winter',
  },
  {
    name: 'Pavones and Playa Negra: Costa Rica Surf Guide',
    description: "Finding your feet on Costa Rica's Pacific and Caribbean breaks — wave-reading basics, reef ethics, and the reality of Pavones at six feet.",
    image_url: 'https://wknd-adventures.run.place/blog/media_168d4df680b92c68b36d08772450bd3d2ec2d19ce.jpg?width=750&format=jpg&optimize=medium',
    category: 'Surf',
  },
  {
    name: '48 Hours in the Sonoran: A Field Guide to Desert Survival',
    description: 'A field guide to the Sonoran Desert — water discipline, dawn-start heat management, arroyo navigation, and flash-flood awareness.',
    image_url: 'https://wknd-adventures.run.place/blog/media_19a5af1a42e99ed270bfc14e36e044ac83731bd28.jpg?width=750&format=jpg&optimize=medium',
    category: 'Desert',
  },
  {
    name: 'Reading a River: Wild Swimming Guide',
    description: 'A hybrid guide-essay on wild swimming — reading rivers, access ethics, cold-water management, and the gear for safe open-water swimming.',
    image_url: 'https://wknd-adventures.run.place/blog/media_183099ae6d06ddd8bbd52f5416f41782c6d9af77c.jpg?width=750&format=jpg&optimize=medium',
    category: 'Water',
  },
  {
    name: 'Sub-10 lb: What to Cut, What to Keep — Ultralight Backpacking',
    description: 'An honest gear guide to ultralight backpacking — where the weight lives, what to cut, what to keep, and when to ignore the dogma.',
    image_url: 'https://wknd-adventures.run.place/blog/media_11542d7349fe7aaf3224ac0eaa71c09bc9c82ea2f.jpg?width=750&format=jpg&optimize=medium',
    category: 'Hiking',
  },
];

// Brand palette from the action payload — used to derive the card info-strip background.
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
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (relLum(Math.round(r * m), Math.round(g * m), Math.round(b * m)) > 0.12) hi = m; else lo = m;
  }
  const dr = Math.round(r * lo), dg = Math.round(g * lo), db = Math.round(b * lo);
  return { bg: `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`, fg: '#ffffff' };
}
const theme = getThemedCardBg(PALETTE);

const CARD_COLORS = ['#378ef0', '#9256d9', '#0fb5ae', '#e68619', '#d83790', '#2dca72', '#4046ca', '#72b340'];

export default async function decorate(block, bridge) {
  let items;

  if (bridge) {
    bridge.applyHostStyles();
    const isPreview = bridge.hostContext?.preview === true;
    if (isPreview) {
      items = SAMPLE_DATA;
    } else {
      const _result = await bridge.toolResult;
      const structuredContent = _result?.structuredContent || {};
      // structuredContent.destinations — bare array outputSchema; key derived from actionName "search_destinations"
      items = structuredContent?.destinations || [];
    }
  } else {
    items = SAMPLE_DATA;
  }

  block.textContent = '';
  renderItems(block, items, bridge);

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

function renderItems(block, items, bridge) {
  const list = (items || []).slice(0, 10);

  const wrapper = document.createElement('div');
  wrapper.className = 'search-destinations-wrapper';

  const track = document.createElement('div');
  track.className = 'search-destinations-track';

  list.forEach((item, i) => {
    const card = document.createElement('article');
    card.className = 'search-destinations-card';

    const imageBox = document.createElement('div');
    imageBox.className = 'search-destinations-image';
    const fallbackColor = CARD_COLORS[i % CARD_COLORS.length];
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
      img.onerror = () => { if (img.parentNode) img.parentNode.replaceChild(colorDiv(), img); };
      imageBox.appendChild(img);
    } else {
      imageBox.appendChild(colorDiv());
    }
    card.appendChild(imageBox);

    const info = document.createElement('div');
    info.className = 'search-destinations-info';
    info.style.cssText = `background:${theme?.bg ?? '#1a1a1a'};color:${theme?.fg ?? '#fff'};`;

    const title = document.createElement('h3');
    title.className = 'search-destinations-title';
    title.textContent = item.name || '';
    info.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'search-destinations-desc';
    desc.textContent = item.description || '';
    info.appendChild(desc);

    if (item.category) {
      const badge = document.createElement('span');
      badge.className = 'search-destinations-badge';
      badge.textContent = item.category;
      info.appendChild(badge);
    }

    const cta = document.createElement('button');
    cta.className = 'search-destinations-cta';
    cta.type = 'button';
    cta.textContent = 'Explore Adventure';
    if (bridge) {
      cta.addEventListener('click', () => {
        bridge.sendMessage(`Tell me more about ${item.name}`);
      });
    }
    info.appendChild(cta);

    card.appendChild(info);
    track.appendChild(card);
  });

  wrapper.appendChild(track);

  const fade = document.createElement('div');
  fade.className = 'search-destinations-fade';
  fade.style.cssText = `position:absolute;top:0;right:0;height:100%;width:60px;background:linear-gradient(to right,transparent,${theme?.bg ?? '#1a1a1a'}cc);pointer-events:none;border-radius:0 10px 10px 0;`;
  wrapper.appendChild(fade);

  const mkArrow = (dir) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `search-destinations-arrow search-destinations-arrow-${dir}`;
    b.setAttribute('aria-label', dir === 'left' ? 'Scroll left' : 'Scroll right');
    b.textContent = dir === 'left' ? '◀' : '▶';
    const scroll = () => {
      const card = track.querySelector('.search-destinations-card');
      const amount = card ? card.offsetWidth + 16 : 236;
      track.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
    };
    b.addEventListener('click', scroll);
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scroll(); }
    });
    return b;
  };
  const leftArrow = mkArrow('left');
  const rightArrow = mkArrow('right');
  wrapper.appendChild(leftArrow);
  wrapper.appendChild(rightArrow);

  const updateArrows = () => {
    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    leftArrow.style.display = atStart ? 'none' : '';
    rightArrow.style.display = atEnd ? 'none' : '';
  };
  track.addEventListener('scroll', updateArrows);
  requestAnimationFrame(updateArrows);

  block.appendChild(wrapper);
}
