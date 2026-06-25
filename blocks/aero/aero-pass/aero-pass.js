/**
 * WKND Pass — homepage section + full landing page (Figma node 14-1408).
 */
import { buildBlock } from '../../../scripts/aem.js';
import { loadBlockOrSiteBlock } from '../../../scripts/aero-blocks.js';
import { DEFAULT_AERO_HERO_IMAGE } from '../../../scripts/aero-catalog-images.js';

const PASS_HERO_IMAGE = DEFAULT_AERO_HERO_IMAGE;

const BENEFIT_ICONS = {
  plane: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  ticket: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
  globe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
};

const DEFAULT_MARQUEE_ITEMS = [
  'UNLIMITED STANDBY FLIGHTS',
  'NO BLACKOUT DATES',
  'PRIORITY BOARDING',
  'EXCLUSIVE GEAR ACCESS',
];

const DEFAULT_LANDING_BENEFITS = [
  {
    title: 'Unlimited Standby',
    desc: 'Fly on any available seat across our entire network, anytime.',
    image: PASS_HERO_IMAGE,
  },
  {
    title: 'Zero Blackouts',
    desc: 'Holidays, peak seasons, or last-minute whims. We don\'t do limits.',
    image: PASS_HERO_IMAGE,
  },
  {
    title: 'Priority Boarding',
    desc: 'First on, first off. Spend less time in the terminal and more time at the peak.',
    image: PASS_HERO_IMAGE,
  },
  {
    title: 'Exclusive Gear',
    desc: 'Access to member-only drops of WKND Aero high-performance travel gear.',
    image: PASS_HERO_IMAGE,
  },
];

const DEFAULT_PROTOCOL = [
  {
    num: '01',
    title: 'JOIN',
    body: 'Apply for the pass. Once vetted, your digital credentials unlock the entire WKND network instantly.',
  },
  {
    num: '02',
    title: 'BOOK',
    body: 'Open the app, find an adventure, and tap \'Book with Pass\'. No checkout, no hidden fees, no friction.',
  },
  {
    num: '03',
    title: 'EXPLORE',
    body: 'Head to the gate. Board first. Arrive in Iceland or Patagonia ready to push your boundaries.',
  },
];

/**
 * @param {string} label
 * @param {string} fallback
 * @returns {string}
 */
function getBenefitIcon(label, fallback = 'plane') {
  const text = label.toLowerCase();
  if (text.includes('board') || text.includes('priority')) return BENEFIT_ICONS.plane;
  if (text.includes('fare') || text.includes('exclusive') || text.includes('gear')) return BENEFIT_ICONS.ticket;
  if (text.includes('credit') || text.includes('adventure') || text.includes('standby') || text.includes('blackout')) return BENEFIT_ICONS.globe;
  return BENEFIT_ICONS[fallback] || BENEFIT_ICONS.plane;
}

/**
 * @param {Element} row
 * @returns {string[]}
 */
function rowCells(row) {
  return [...row.querySelectorAll(':scope > div')].map((cell) => {
    const img = cell.querySelector('picture img, img');
    if (img) return img.src;
    const link = cell.querySelector('a');
    if (link && cell.textContent.trim() === link.textContent.trim()) return link.href;
    return cell.textContent.trim();
  });
}

/**
 * @param {string} text
 * @returns {string}
 */
function cellText(text) {
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * @param {string} key
 * @param {string[]} cells
 * @returns {boolean}
 */
function isSection(key, cells) {
  return cellText(cells[0]).toLowerCase() === `section:${key}`;
}

/**
 * @param {Element} block
 * @param {Element[]} rows
 */
function decorateSection(block, rows) {
  const inner = document.createElement('div');
  inner.className = 'aero-pass-inner';

  const copy = document.createElement('div');
  copy.className = 'aero-pass-copy';

  const benefits = document.createElement('ul');
  benefits.className = 'aero-pass-benefits';

  let ctaText = 'JOIN THE PASS';
  let ctaUrl = '/wknd-pass';
  let imageUrl = PASS_HERO_IMAGE;

  rows.forEach((row, i) => {
    const cells = row.querySelectorAll(':scope > div');
    if (i === 0 && cells[0]) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'aero-pass-eyebrow';
      eyebrow.textContent = cells[0].textContent.trim();
      copy.append(eyebrow);
    } else if (i === 1 && cells[0]) {
      const h2 = document.createElement('h2');
      h2.textContent = cells[0].textContent.trim();
      copy.append(h2);
    } else if (cells.length >= 3) {
      const li = document.createElement('li');
      const iconWrap = document.createElement('span');
      iconWrap.className = 'aero-pass-benefit-icon';
      const iconImg = cells[0].querySelector('img');
      const iconKey = cells[0].textContent.trim().toLowerCase();
      if (iconImg) {
        iconWrap.append(iconImg.cloneNode(true));
      } else if (BENEFIT_ICONS[iconKey]) {
        iconWrap.innerHTML = BENEFIT_ICONS[iconKey];
      } else {
        iconWrap.innerHTML = getBenefitIcon(cells[1].textContent.trim());
      }
      li.append(iconWrap);
      const text = document.createElement('div');
      text.className = 'aero-pass-benefit-text';
      text.innerHTML = `<strong>${cells[1].textContent.trim()}</strong><span>${cells[2].textContent.trim()}</span>`;
      li.append(text);
      benefits.append(li);
    } else if (cells.length >= 2 && cells[0].textContent.trim().length < 24) {
      ctaText = cells[0].textContent.trim();
      ctaUrl = cells[1].querySelector('a')?.href || cells[1].textContent.trim() || ctaUrl;
    } else if (cells[0]?.querySelector('picture img, img')) {
      imageUrl = cells[0].querySelector('picture img, img')?.src || imageUrl;
    }
  });

  copy.append(benefits);
  const cta = document.createElement('a');
  cta.className = 'aero-pass-cta';
  cta.href = ctaUrl;
  cta.textContent = ctaText;
  copy.append(cta);

  const visual = document.createElement('div');
  visual.className = 'aero-pass-visual';
  const frame = document.createElement('div');
  frame.className = 'aero-pass-image-frame';
  frame.innerHTML = `<img src="${imageUrl}" alt="" loading="lazy" />`;
  const card = document.createElement('div');
  card.className = 'aero-pass-card';
  card.innerHTML = '<div class="aero-pass-card-status"><span>Current status</span><strong>Boarding: Now</strong></div>';
  visual.append(frame, card);

  inner.append(copy, visual);
  block.append(inner);
}

/**
 * @param {Element} block
 * @param {Element[]} rows
 */
async function decorateLanding(block, rows) {
  const cellsByRow = rows.map(rowCells);

  const heroRow = cellsByRow.find((cells) => isSection('hero', cells));
  const heroOffset = heroRow ? 1 : 0;
  const heroEyebrow = cellText(heroRow?.[heroOffset]) || 'EXCLUSIVE MEMBERSHIP';
  const heroTitle = cellText(heroRow?.[heroOffset + 1]) || 'THE WKND PASS';
  const heroIntro = cellText(heroRow?.[heroOffset + 2])
    || 'Unlimited Adventure. One Flat Rate. Break free from the booking cycle. Join the elite network of travelers who don\'t just fly—they explore without limits.';
  const heroPrimaryCta = cellText(heroRow?.[heroOffset + 3]) || 'JOIN NOW';
  const heroPrimaryUrl = cellText(heroRow?.[heroOffset + 4]) || '#join';
  const heroSecondaryCta = cellText(heroRow?.[heroOffset + 5]) || 'VIEW DETAILS';
  const heroSecondaryUrl = cellText(heroRow?.[heroOffset + 6]) || '#benefits';
  const heroImage = heroRow?.[heroOffset + 7] || PASS_HERO_IMAGE;

  const benefitsHeader = cellsByRow.find((cells) => isSection('benefits', cells));
  const benefitsOffset = benefitsHeader ? 1 : 0;
  const benefitsHeading = cellText(benefitsHeader?.[benefitsOffset]) || 'ENGINEERED FOR ADRENALINE';
  const benefitsIntro = cellText(benefitsHeader?.[benefitsOffset + 1])
    || 'We stripped away the complexity of modern aviation to give you pure, unadulterated access to the world\'s most intense destinations.';
  const benefitsBadge = cellText(benefitsHeader?.[benefitsOffset + 2]) || 'PASS_01';

  const benefitCards = cellsByRow
    .filter((cells) => isSection('benefit', cells))
    .map((cells) => ({
      image: cells[1] || PASS_HERO_IMAGE,
      title: cellText(cells[2]),
      desc: cellText(cells[3]),
    }))
    .filter((card) => card.title);

  const cards = benefitCards.length ? benefitCards : DEFAULT_LANDING_BENEFITS;

  const protocolHeader = cellText(
    cellsByRow.find((cells) => isSection('protocol', cells))?.[1],
  ) || 'THE PROTOCOL';

  const protocolSteps = cellsByRow
    .filter((cells) => isSection('protocol-step', cells))
    .map((cells, i) => ({
      num: cellText(cells[1]) || DEFAULT_PROTOCOL[i]?.num || String(i + 1).padStart(2, '0'),
      title: cellText(cells[2]) || DEFAULT_PROTOCOL[i]?.title || '',
      body: cellText(cells[3]) || DEFAULT_PROTOCOL[i]?.body || '',
    }));

  const steps = protocolSteps.length ? protocolSteps : DEFAULT_PROTOCOL;

  const pricingRow = cellsByRow.find((cells) => isSection('pricing', cells));
  const pricingOffset = pricingRow ? 1 : 0;
  const pricingHeading = cellText(pricingRow?.[pricingOffset + 0]) || 'ONE PRICE.';
  const pricingHeading2 = cellText(pricingRow?.[pricingOffset + 1]) || 'ALL HORIZONS.';
  const pricingIntro = cellText(pricingRow?.[pricingOffset + 2])
    || 'Membership is limited to 1,000 active explorers per season to ensure flight availability and maintain the exclusivity of the WKND network.';
  const pricingFeatures = [
    cellText(pricingRow?.[pricingOffset + 3]) || 'Unlimited Network Access',
    cellText(pricingRow?.[pricingOffset + 4]) || 'No Change Fees Ever',
    cellText(pricingRow?.[pricingOffset + 5]) || '24/7 Dedicated Concierge',
  ];
  const pricingAmount = cellText(pricingRow?.[pricingOffset + 6]) || '$399';
  const pricingSuffix = cellText(pricingRow?.[pricingOffset + 7]) || '/ MO';
  const pricingNote = cellText(pricingRow?.[pricingOffset + 8])
    || 'Billed monthly. Cancel anytime after the first 3 months. Exclusive of local taxes.';
  const pricingCta = cellText(pricingRow?.[pricingOffset + 9]) || 'CLAIM YOUR PASS';
  const pricingSpots = cellText(pricingRow?.[pricingOffset + 10]) || '942 SPOTS TAKEN';

  const escapeRow = cellsByRow.find((cells) => isSection('escape', cells));
  const escapeOffset = escapeRow ? 1 : 0;
  const escapeLine1 = cellText(escapeRow?.[escapeOffset]) || 'ESCAPE THE';
  const escapeLine2 = cellText(escapeRow?.[escapeOffset + 1]) || 'ORDINARY';
  const escapeBody = cellText(escapeRow?.[escapeOffset + 2])
    || 'The world is wider than your office walls. The WKND Pass is your permanent permission slip to go find it.';

  const marqueeRow = cellsByRow.find((cells) => isSection('marquee', cells));
  const marqueeItems = (marqueeRow
    ? marqueeRow.slice(1).map((cell) => cellText(cell)).filter(Boolean)
    : DEFAULT_MARQUEE_ITEMS);

  const page = document.createElement('div');
  page.className = 'aero-pass-landing';

  page.innerHTML = `
    <section class="aero-pass-hero" id="join">
      <img class="aero-pass-hero-bg" src="${heroImage}" alt="" loading="eager" />
      <div class="aero-pass-hero-gradient" aria-hidden="true"></div>
      <div class="aero-pass-hero-content">
        <p class="aero-pass-hero-eyebrow">${heroEyebrow}</p>
        <h1>${heroTitle}</h1>
        <p class="aero-pass-hero-intro">${heroIntro}</p>
        <div class="aero-pass-hero-actions">
          <a href="${heroPrimaryUrl}" class="aero-pass-btn aero-pass-btn--primary">${heroPrimaryCta}</a>
          <a href="${heroSecondaryUrl}" class="aero-pass-btn aero-pass-btn--outline">${heroSecondaryCta}</a>
        </div>
      </div>
    </section>
    <section class="aero-pass-benefits-grid" id="benefits">
      <header class="aero-pass-benefits-header">
        <div>
          <h2>${benefitsHeading}</h2>
          <p>${benefitsIntro}</p>
        </div>
        <span class="aero-pass-benefits-badge">${benefitsBadge}</span>
      </header>
      <div class="aero-pass-benefits-cards">
        ${cards.map((card) => `
          <article class="aero-pass-benefit-card">
            <img src="${card.image}" alt="" loading="lazy" />
            <div class="aero-pass-benefit-card-overlay">
              <span class="aero-pass-benefit-card-icon" aria-hidden="true">${getBenefitIcon(card.title)}</span>
              <h3>${card.title}</h3>
              <p>${card.desc}</p>
            </div>
          </article>`).join('')}
      </div>
    </section>
    <section class="aero-pass-protocol">
      <h2>${protocolHeader}</h2>
      <div class="aero-pass-protocol-steps">
        ${steps.map((step) => `
          <article class="aero-pass-protocol-step">
            <span class="aero-pass-protocol-num" aria-hidden="true">${step.num}</span>
            <span class="aero-pass-protocol-icon" aria-hidden="true">${getBenefitIcon(step.title)}</span>
            <h3>${step.title}</h3>
            <p>${step.body}</p>
          </article>`).join('')}
      </div>
    </section>
    <section class="aero-pass-pricing">
      <div class="aero-pass-pricing-copy">
        <h2><span>${pricingHeading}</span><span>${pricingHeading2}</span></h2>
        <p>${pricingIntro}</p>
        <ul class="aero-pass-pricing-features">
          ${pricingFeatures.map((feature) => `<li>${feature}</li>`).join('')}
        </ul>
      </div>
      <aside class="aero-pass-pricing-card">
        <p class="aero-pass-pricing-label">MONTHLY SUBSCRIPTION</p>
        <p class="aero-pass-pricing-amount"><strong>${pricingAmount}</strong><span>${pricingSuffix}</span></p>
        <p class="aero-pass-pricing-note">${pricingNote}</p>
        <a href="${heroPrimaryUrl}" class="aero-pass-btn aero-pass-btn--primary aero-pass-btn--block">${pricingCta}</a>
        <p class="aero-pass-pricing-spots">${pricingSpots}</p>
      </aside>
    </section>
    <section class="aero-pass-escape">
      <h2><span>${escapeLine1}</span> <span class="aero-pass-escape-accent">${escapeLine2}</span></h2>
      <p>${escapeBody}</p>
    </section>`;

  block.append(page);

  const hero = block.querySelector('.aero-pass-hero');
  if (hero && marqueeItems.length) {
    const marqueeSlot = buildBlock('marquee-ticker', marqueeItems.map((item) => [item]));
    marqueeSlot.classList.add('block', 'aero-pass-hero-marquee');
    marqueeSlot.dataset.blockName = 'marquee-ticker';
    marqueeSlot.dataset.blockStatus = 'initialized';
    hero.append(marqueeSlot);
    await loadBlockOrSiteBlock(marqueeSlot);
  }
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const isLanding = block.classList.contains('landing') || block.classList.contains('page');
  block.textContent = '';
  block.classList.add('block', 'deep-green');
  if (isLanding) {
    block.classList.add('landing');
    await decorateLanding(block, rows);
    return;
  }
  decorateSection(block, rows);
}
