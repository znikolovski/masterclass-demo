import { getMetadata } from '../../scripts/aem.js';

export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';

  let resp = await fetch('/content/footer.plain.html');
  if (!resp.ok) resp = await fetch(`${footerPath}.plain.html`);
  if (!resp.ok) return;

  const html = await resp.text();
  block.textContent = '';
  const footer = document.createElement('div');
  footer.className = 'footer-content';
  footer.innerHTML = html;

  const sections = footer.querySelectorAll(':scope > div');
  if (sections.length >= 5) {
    sections[0].classList.add('footer-brand');
    sections[1].classList.add('footer-col');
    sections[2].classList.add('footer-col');
    sections[3].classList.add('footer-col');
    sections[4].classList.add('footer-bottom');

    const brand = sections[0];
    const brandName = brand.querySelector('p:first-child');
    if (brandName) {
      const logo = document.createElement('div');
      logo.className = 'footer-logo';
      logo.innerHTML = '<div class="footer-logo-icon"><svg width="100%" height="100%" viewBox="0 0 33 33" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M28,0H5C2.24,0,0,2.24,0,5v23c0,2.76,2.24,5,5,5h23c2.76,0,5-2.24,5-5V5c0-2.76-2.24-5-5-5ZM29,17c-6.63,0-12,5.37-12,12h-1c0-6.63-5.37-12-12-12v-1c6.63,0,12-5.37,12-12h1c0,6.63,5.37,12,12,12v1Z" fill="currentColor"></path></svg></div><span class="logo-text">WKND<br>Adventures</span>';
      brandName.replaceWith(logo);
    }

    footer.removeChild(sections[4]);
    block.append(footer);
    block.append(sections[4]);
  } else {
    block.append(footer);
  }
}
