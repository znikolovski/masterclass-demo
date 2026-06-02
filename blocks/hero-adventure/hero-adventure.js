export default function decorate(block) {
  if (!block.querySelector(':scope > div:first-child picture')) {
    block.classList.add('no-image');
  }

  const contentRow = block.querySelector(':scope > div:last-child');
  const cells = contentRow ? [...contentRow.children] : [];

  if (cells.length >= 5) {
    const avatarCell = cells[2];
    const nameCell = cells[3];
    const dateCell = cells[4];
    const pic = avatarCell.querySelector('picture');

    if (pic) {
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
  }
}
