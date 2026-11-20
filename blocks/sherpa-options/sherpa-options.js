import { getOf1Context } from '../../scripts/of1-context.js';

export default function decorate(block) {
  const { query } = getOf1Context(block);
  const titles = [...new Set([...block.closest('main').querySelectorAll('.cards :is(h2, h3, h4, h5, h6)')]
    .map((heading) => heading.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean))];
  const adventurePrompt = [
    'Help me choose an adventure and work out what I should prepare.',
    query ? `My current search is: ${query}.` : '',
    titles.length ? `The options shown include: ${titles.join('; ')}.` : '',
  ].filter(Boolean).join(' ');
  const chat = block.querySelector('a[href^="#sherpa"]');
  if (chat) {
    const updatePrompt = () => {
      const { experience, products } = getOf1Context(block);
      const prompt = experience === 'product' ? [
        'Help me choose WKND products and compare which options best fit my needs.',
        query ? `My current search is: ${query}.` : '',
        products.length ? `The products shown include: ${products.join('; ')}.` : '',
      ].filter(Boolean).join(' ') : adventurePrompt;
      chat.href = `#sherpa?prompt=${encodeURIComponent(prompt)}&send=true`;
    };
    updatePrompt();
    chat.addEventListener('click', updatePrompt);
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
