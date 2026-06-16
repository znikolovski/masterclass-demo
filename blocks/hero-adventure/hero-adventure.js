import { createHeroAdventurePicture } from '../../scripts/media.js';

/**
 * Optimizes the hero background image for LCP (eager load, smaller mobile payload).
 * @param {Element} block
 */
function optimizeHeroBackground(block) {
  const picture = block.querySelector(':scope > div:first-child picture');
  const img = picture?.querySelector('img');
  if (!img?.src) return;
  if (img.dataset.lcpPrimed === 'true' || img.dataset.mediaOptimized === 'true') {
    return;
  }
  picture.replaceWith(createHeroAdventurePicture(img.src, img.alt || ''));
}

/**
 * Pulls h1 and author fields from the section wrapper into the hero content row.
 * @param {Element} block
 */
function adoptOrphanHeroFields(block) {
  const section = block.closest('.section');
  const contentRow = block.querySelector(':scope > div:last-child');
  if (!section || !contentRow || contentRow.querySelector('h1')) return;

  const wrapper = section.querySelector('.default-content-wrapper');
  if (!wrapper) return;

  let adoptedAuthor = false;
  [...wrapper.children].forEach((child) => {
    if (child.matches('h1')) {
      const cell = document.createElement('div');
      cell.append(child);
      contentRow.append(cell);
      return;
    }
    if (!adoptedAuthor && child.matches('p') && child.querySelector('picture')) {
      const cell = document.createElement('div');
      cell.append(...child.childNodes);
      child.remove();
      contentRow.append(cell);
      adoptedAuthor = true;
      return;
    }
    if (adoptedAuthor && child.matches('p') && !child.querySelector('a')) {
      const text = child.textContent.trim();
      if (text.length > 0 && text.length < 80) {
        const cell = document.createElement('div');
        cell.textContent = text;
        child.remove();
        contentRow.append(cell);
      }
    }
  });
}

/**
 * @param {Element} contentRow
 */
function removeInlineMetadataCells(contentRow) {
  [...contentRow.children].forEach((cell) => {
    if (cell.classList.contains('section-metadata')) {
      cell.remove();
      return;
    }
    if (/^hero-adventure-container$/i.test(cell.textContent.trim())) {
      cell.remove();
      return;
    }
    const key = cell.children[0]?.textContent?.trim().toLowerCase();
    const val = cell.children[1]?.textContent?.trim().toLowerCase() || '';
    if (key === 'style' && val.includes('hero-adventure')) {
      cell.remove();
    }
  });
}

export default function decorate(block) {
  if (!block.querySelector(':scope > div:first-child picture')) {
    block.classList.add('no-image');
  } else {
    optimizeHeroBackground(block);
  }

  adoptOrphanHeroFields(block);

  const contentRow = block.querySelector(':scope > div:last-child');
  if (!contentRow) return;

  removeInlineMetadataCells(contentRow);

  const cells = [...contentRow.children];
  const avatarCell = cells.find((cell) => cell.querySelector('picture'));
  const textCells = cells.filter((cell) => cell !== avatarCell
    && !cell.querySelector('h1') && !cell.querySelector('picture'));

  const pic = avatarCell?.querySelector('picture');
  const nameCell = textCells[0];
  const dateCell = textCells[1];
  if (!pic || !nameCell || !dateCell) return;

  const byline = document.createElement('div');
  byline.className = 'hero-byline';
  byline.innerHTML = `
    <div class="hero-byline-avatar">${pic.outerHTML}</div>
    <div class="hero-byline-text">
      <p class="hero-byline-name">${nameCell.textContent.trim()}</p>
      <p class="hero-byline-date">${dateCell.textContent.trim()}</p>
    </div>
  `;
  avatarCell.replaceWith(byline);
  nameCell.remove();
  dateCell.remove();
}
