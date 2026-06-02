export default function decorate(block) {
  const section = block.closest('.section');
  if (!section) return;
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    const key = row.children[0]?.textContent.trim().toLowerCase();
    const value = row.children[1]?.textContent.trim().toLowerCase();
    if (key === 'style' && value) {
      section.classList.add(...value.split(',').map((s) => s.trim()));
    }
  });
  const wrapper = block.closest('.section-metadata-wrapper') || block.parentElement;
  if (wrapper && wrapper !== section) wrapper.remove();
  else block.remove();
}
