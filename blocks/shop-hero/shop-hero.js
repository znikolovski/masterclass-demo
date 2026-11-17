/*
 * Shop hero — dark category/landing banner for the WKND shop.
 * Authoring: one cell of default content.
 *   - paragraph(s) before the heading → tag line (e.g. "Field-tested since 2014")
 *   - h1/h2 → title
 *   - paragraphs after the heading → intro
 *   - a bulleted list → highlight chips
 *   - an optional picture → faded background image
 */
export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  const content = document.createElement('div');
  content.className = 'shop-hero-content';
  cells.forEach((cell) => content.append(...cell.childNodes));

  const picture = content.querySelector('picture');
  const media = picture ? document.createElement('div') : null;
  if (picture) {
    media.className = 'shop-hero-media';
    const holder = picture.closest('p');
    media.append(picture);
    if (holder && !holder.textContent.trim()) holder.remove();
  }

  const heading = content.querySelector('h1, h2');
  if (heading) {
    let node = heading.previousElementSibling;
    while (node) {
      const prev = node.previousElementSibling;
      if (node.tagName === 'P' && node.textContent.trim()) {
        node.classList.add('shop-hero-tag');
        // keep tag lines above the heading, in authored order
        heading.before(node);
      }
      node = prev;
    }
  }

  content.querySelectorAll('ul').forEach((list) => list.classList.add('shop-hero-highlights'));
  block.replaceChildren(...(media ? [media] : []), content);
}
