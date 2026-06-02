export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`teaser-${cols.length}-cols`);

  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          picWrapper.classList.add('teaser-image');
        }
      }
    });
  });
}
