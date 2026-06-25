export default function decorate(block) {
  const section = block.closest('.section');
  const isNested = Boolean(block.closest('.aero-pass-landing, .aero-hero, .aero-pass'));
  if (section && !isNested) {
    section.classList.remove('section');
    section.style.padding = '0';
    section.style.margin = '0';
  }

  const items = [...block.children].map((row) => row.textContent.trim()).filter(Boolean);
  block.textContent = '';

  const track = document.createElement('div');
  track.className = 'marquee-ticker-track';

  const content = items
    .map((item) => `<span class="marquee-ticker-item">${item}</span>`)
    .join('<span class="marquee-ticker-sep">·</span>');

  track.innerHTML = `${content}<span class="marquee-ticker-sep">·</span>${content}<span class="marquee-ticker-sep">·</span>${content}`;

  block.append(track);

  block.addEventListener('mouseenter', () => {
    track.style.animationPlayState = 'paused';
  });

  block.addEventListener('mouseleave', () => {
    track.style.animationPlayState = 'running';
  });
}
