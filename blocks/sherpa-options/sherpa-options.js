import { getOf1Context } from '../../scripts/of1-context.js';

export default function decorate(block) {
  const { query } = getOf1Context();
  const titles = [...new Set([...block.closest('main').querySelectorAll('.cards :is(h2, h3, h4, h5, h6)')]
    .map((heading) => heading.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean))];
  const prompt = [
    'Help me choose an adventure and work out what I should prepare.',
    query ? `My current search is: ${query}.` : '',
    titles.length ? `The options shown include: ${titles.join('; ')}.` : '',
  ].filter(Boolean).join(' ');
  const chat = block.querySelector('a[href^="#sherpa"]');
  if (chat) {
    chat.href = `#sherpa?prompt=${encodeURIComponent(prompt)}&send=true`;
    chat.className = 'button primary';
    chat.setAttribute('aria-haspopup', 'dialog');
    chat.setAttribute('aria-controls', 'wknd-sherpa-dialog');
  }
  const panel = document.createElement('div');
  panel.className = 'sherpa-options-panel';
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => panel.append(...cell.childNodes));
  });
  block.replaceChildren(panel);
}
