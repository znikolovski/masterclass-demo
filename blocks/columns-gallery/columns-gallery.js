/**
 * Moves a trailing paragraph with only a picture into the block as a full-width row.
 * @param {Element} block
 */
function adoptOrphanWideImage(block) {
  const next = block.nextElementSibling;
  if (!next?.matches('p')) return;
  const pic = next.querySelector('picture');
  if (!pic || next.textContent.trim()) return;

  const row = document.createElement('div');
  const col = document.createElement('div');
  col.append(pic);
  row.append(col);
  block.append(row);
  next.remove();
}

export default function decorate(block) {
  adoptOrphanWideImage(block);

  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-gallery-${cols.length}-cols`);

  // setup image columns
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-gallery-img-col');
        }
      }
    });
  });
}
