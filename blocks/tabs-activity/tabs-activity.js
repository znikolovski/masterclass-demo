// eslint-disable-next-line import/no-unresolved
import { toClassName } from '../../scripts/aem.js';
import { pushInteractionEvent } from '../../scripts/analytics-acdl.js';

export default async function decorate(block) {
  // build tablist
  const tablist = document.createElement('div');
  tablist.className = 'tabs-activity-list';
  tablist.setAttribute('role', 'tablist');

  // decorate tabs and tabpanels
  const tabs = [...block.children].map((child) => child.firstElementChild);
  tabs.forEach((tab, i) => {
    const id = toClassName(tab.textContent);

    // decorate tabpanel
    const tabpanel = block.children[i];
    tabpanel.className = 'tabs-activity-panel';
    tabpanel.id = `tabpanel-${id}`;
    tabpanel.setAttribute('aria-hidden', !!i);
    tabpanel.setAttribute('aria-labelledby', `tab-${id}`);
    tabpanel.setAttribute('role', 'tabpanel');

    // build tab button
    const button = document.createElement('button');
    button.className = 'tabs-activity-tab';
    button.id = `tab-${id}`;

    button.innerHTML = tab.innerHTML;

    button.setAttribute('aria-controls', `tabpanel-${id}`);
    button.setAttribute('aria-selected', !i);
    button.setAttribute('role', 'tab');
    button.setAttribute('type', 'button');
    button.addEventListener('click', () => {
      block.querySelectorAll('[role=tabpanel]').forEach((panel) => {
        panel.setAttribute('aria-hidden', true);
      });
      tablist.querySelectorAll('button').forEach((btn) => {
        btn.setAttribute('aria-selected', false);
      });
      tabpanel.setAttribute('aria-hidden', false);
      button.setAttribute('aria-selected', true);
      pushInteractionEvent('tabSelect', {
        block: 'tabs-activity',
        label: button.textContent.trim(),
        detail: button.id,
      });
    });
    tablist.append(button);
    tab.remove();
  });

  block.prepend(tablist);

  // Group flat panel content into cards (only when h3 headings exist)
  block.querySelectorAll('.tabs-activity-panel > div').forEach((content) => {
    if (!content.querySelector('h3')) return;

    const children = [...content.children];
    const cards = [];
    let card = null;

    children.forEach((el) => {
      const hasPicture = el.querySelector('picture');
      if (hasPicture) {
        card = document.createElement('div');
        card.className = 'activity-card';
        cards.push(card);
        const imgWrap = document.createElement('div');
        imgWrap.className = 'activity-card-image';
        imgWrap.append(hasPicture);
        card.append(imgWrap);
      } else if (card) {
        if (el.tagName === 'H3') {
          el.classList.add('activity-card-title');
          card.append(el);
        } else if (!card.querySelector('.activity-card-tag') && el.tagName === 'P' && !el.querySelector('a') && !card.querySelector('.activity-card-title')) {
          el.classList.add('activity-card-tag');
          card.append(el);
        } else {
          el.classList.add('activity-card-desc');
          card.append(el);
        }
      }
    });

    content.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'activity-card-grid';
    cards.forEach((c) => grid.append(c));
    content.append(grid);
  });
}
