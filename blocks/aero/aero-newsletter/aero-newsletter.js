/**
 * Newsletter email capture strip.
 */
import { pushInteractionEvent } from '../../../scripts/analytics-acdl.js';

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  block.textContent = '';
  block.classList.add('block');

  const headline = rows[0]?.querySelector(':scope > div')?.textContent.trim() || 'Get flight deals & adventure inspiration';
  const subcopy = rows[1]?.querySelector(':scope > div')?.textContent.trim() || 'Subscribe for exclusive fares and WKND stories.';
  const row3 = rows[2]?.querySelectorAll(':scope > div') || [];
  const placeholder = row3[0]?.textContent.trim() || 'Email address';
  const submitLabel = row3[1]?.textContent.trim() || 'SUBSCRIBE';

  block.innerHTML = `
    <div class="aero-newsletter-inner">
      <div class="aero-newsletter-copy">
        <h2>${headline}</h2>
        <p>${subcopy}</p>
      </div>
      <form class="aero-newsletter-form">
        <label class="sr-only" for="aero-newsletter-email">Email</label>
        <input id="aero-newsletter-email" type="email" name="email" placeholder="${placeholder}" required />
        <button type="submit">${submitLabel}</button>
      </form>
    </div>`;

  block.querySelector('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    pushInteractionEvent('newsletterSubscribe', { block: 'aero-newsletter', label: 'submit' });
    const btn = block.querySelector('button');
    if (btn) btn.textContent = 'SUBSCRIBED!';
  });
}
