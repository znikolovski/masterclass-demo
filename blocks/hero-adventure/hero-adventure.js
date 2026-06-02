/**
 * Moves misplaced section-metadata out of the hero block (bad imports/migrations).
 * @param {Element} block
 */
function relocateMisplacedSectionMetadata(block) {
  const section = block.closest('.section');
  block.querySelectorAll(':scope .section-metadata').forEach((meta) => {
    if (section && meta.parentElement !== section) {
      section.append(meta);
    }
  });
}

/**
 * Removes section-metadata table cells that were authored inside the hero row.
 * @param {Element} contentRow
 */
function removeInlineMetadataCells(contentRow) {
  [...contentRow.children].forEach((cell) => {
    if (cell.classList.contains('section-metadata')) {
      cell.remove();
      return;
    }
    const text = cell.textContent.trim().toLowerCase();
    if (text === 'style' || text.includes('hero-adventure-container')) {
      cell.remove();
    }
  });
}

export default function decorate(block) {
  if (!block.querySelector(':scope > div:first-child picture')) {
    block.classList.add('no-image');
  }

  relocateMisplacedSectionMetadata(block);

  const contentRow = block.querySelector(':scope > div:last-child');
  if (!contentRow) return;

  removeInlineMetadataCells(contentRow);

  const cells = [...contentRow.children];
  const h1Cell = cells.find((cell) => cell.querySelector('h1'));
  const avatarCell = cells.find((cell) => cell.querySelector('picture'));
  const textCells = cells.filter((cell) => cell !== h1Cell && cell !== avatarCell
    && !cell.querySelector('picture') && !cell.querySelector('h1'));

  const pic = avatarCell?.querySelector('picture');
  if (!pic || textCells.length < 2) return;

  const nameCell = textCells[0];
  const dateCell = textCells[1];

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
