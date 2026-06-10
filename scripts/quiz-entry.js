/**
 * Injects "Find Your Type" quiz CTA into hero-adventure on homepage and /adventures.
 */
/* eslint-disable import/prefer-default-export */

const ENTRY_PATHS = new Set(['/', '/index', '/adventures']);

/**
 * @returns {boolean}
 */
function shouldEnhanceHero() {
  const path = window.location.pathname.replace(/\.html$/, '').replace(/\/index$/, '') || '/';
  return ENTRY_PATHS.has(path);
}

/**
 * Adds secondary quiz CTA to the first hero-adventure on entry pages.
 */
export function initQuizEntryCtas() {
  if (!shouldEnhanceHero()) return;

  const hero = document.querySelector('main .hero-adventure');
  if (!hero) return;

  const contentRow = hero.querySelector(':scope > div:last-child');
  if (!contentRow) return;

  const links = [...contentRow.querySelectorAll('a')];
  const quizPath = window.location.pathname.startsWith('/drafts/')
    ? '/drafts/find-your-adventure'
    : '/find-your-adventure';
  if (links.some((a) => a.getAttribute('href')?.includes('find-your-adventure'))) return;

  const cta = document.createElement('a');
  cta.href = quizPath;
  cta.textContent = 'Find Your Type';
  cta.className = 'button secondary';
  cta.dataset.quizEntry = 'true';

  const lastLinkCell = links[links.length - 1]?.closest('div');
  if (lastLinkCell?.parentElement === contentRow) {
    const cell = document.createElement('div');
    cell.append(cta);
    contentRow.append(cell);
    return;
  }

  const cell = document.createElement('div');
  cell.append(cta);
  contentRow.append(cell);
}
