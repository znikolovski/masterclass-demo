import { markTargetZone } from '../../scripts/target-delivery.js';

export default function decorate(block) {
  const section = block.closest('.section');
  if (!section) return;
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    const key = row.children[0]?.textContent.trim().toLowerCase();
    const rawValue = row.children[1]?.textContent.trim() || '';
    const value = rawValue.toLowerCase();
    if (key === 'style' && value) {
      section.classList.add(...value.split(',').map((s) => s.trim()));
    }
    if (key === 'targetlocation' && rawValue) {
      section.dataset.targetlocation = rawValue;
      markTargetZone(section);
    }
  });
  const wrapper = block.closest('.section-metadata-wrapper') || block.parentElement;
  if (wrapper && wrapper !== section) wrapper.remove();
  else block.remove();
}
