/**
 * Planning facts panel for blog articles (elevation, season, culture, etc.).
 * @param {Element} block
 */

const ICON_HINTS = [
  ['peak', /elev|altitude|summit|height|metre|meter|feet/i],
  ['weather', /weather|climate|rain|snow|wind|temperature/i],
  ['season', /best time|season|when to visit|month/i],
  ['culture', /culture|cultural|local|custom|tradition|language/i],
  ['history', /histor|heritage|ancient|monastery|century/i],
  ['permit', /permit|visa|document|regulation|entry/i],
  ['route', /distance|duration|days|km|mile|trek|trail/i],
  ['budget', /budget|cost|price|fee|currency/i],
];

/**
 * @param {Element} cell
 * @returns {string}
 */
function extractLabel(cell) {
  if (!cell) return '';
  const heading = cell.querySelector('h3, h4, h5, p, strong');
  if (heading?.textContent?.trim()) return heading.textContent.trim();
  return cell.textContent?.trim() || '';
}

/**
 * @param {string} label
 * @returns {string}
 */
function getIconHint(label) {
  const match = ICON_HINTS.find(([, pattern]) => pattern.test(label));
  return match ? match[0] : 'info';
}

/**
 * @param {Element} cell
 * @returns {DocumentFragment}
 */
function normalizeFactValue(cell) {
  const fragment = document.createDocumentFragment();
  if (!cell) return fragment;

  const list = cell.querySelector('ul, ol');
  if (list) {
    const clone = list.cloneNode(true);
    if (clone.tagName === 'OL') {
      const ul = document.createElement('ul');
      [...clone.children].forEach((child) => ul.append(child));
      fragment.append(ul);
    } else {
      fragment.append(clone);
    }
    return fragment;
  }

  const paragraphs = [...cell.querySelectorAll(':scope > p')].filter((p) => p.textContent.trim());
  if (paragraphs.length > 1) {
    const ul = document.createElement('ul');
    paragraphs.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.textContent.trim();
      ul.append(li);
    });
    fragment.append(ul);
    return fragment;
  }

  if (paragraphs.length === 1) {
    const text = paragraphs[0].textContent.trim();
    const parts = text.split(/\s*;\s*/).filter(Boolean);
    if (parts.length > 1) {
      const ul = document.createElement('ul');
      parts.forEach((part) => {
        const li = document.createElement('li');
        li.textContent = part;
        ul.append(li);
      });
      fragment.append(ul);
      return fragment;
    }
    const p = document.createElement('p');
    p.textContent = text;
    fragment.append(p);
    return fragment;
  }

  const fallback = cell.textContent?.trim();
  if (fallback) {
    const p = document.createElement('p');
    p.textContent = fallback;
    fragment.append(p);
  }
  return fragment;
}

/**
 * @param {Element} block
 */
export default function decorate(block) {
  const rows = [...block.children];
  let title = 'Useful information';
  let intro = '';
  let startIndex = 0;

  if (rows[0]?.children.length === 1) {
    const cell = rows[0].children[0];
    const heading = cell.querySelector('h2, h3');
    if (heading?.textContent?.trim()) {
      title = heading.textContent.trim();
      startIndex = 1;
      const lead = cell.querySelector('p');
      if (lead && lead !== heading) {
        intro = lead.textContent.trim();
      }
    }
  }

  const panel = document.createElement('div');
  panel.className = 'adventure-facts-panel';

  const header = document.createElement('header');
  header.className = 'adventure-facts-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'adventure-facts-title';
  titleEl.textContent = title;
  header.append(titleEl);

  if (intro) {
    const lead = document.createElement('p');
    lead.className = 'adventure-facts-lead';
    lead.textContent = intro;
    header.append(lead);
  }

  panel.append(header);

  const grid = document.createElement('dl');
  grid.className = 'adventure-facts-grid';

  rows.slice(startIndex).forEach((row) => {
    if (row.children.length < 2) return;
    const label = extractLabel(row.children[0]);
    if (!label) return;

    const item = document.createElement('div');
    item.className = 'adventure-facts-item';
    item.dataset.icon = getIconHint(label);

    const dt = document.createElement('dt');
    dt.className = 'adventure-facts-label';
    const icon = document.createElement('span');
    icon.className = 'adventure-facts-icon';
    icon.setAttribute('aria-hidden', 'true');
    dt.append(icon, document.createTextNode(label));

    const dd = document.createElement('dd');
    dd.className = 'adventure-facts-value';
    dd.append(normalizeFactValue(row.children[1]));

    item.append(dt, dd);
    grid.append(item);
  });

  panel.append(grid);
  block.replaceChildren(panel);
}
