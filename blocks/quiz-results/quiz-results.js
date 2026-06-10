import { createResponsivePicture } from '../../scripts/media.js';
import {
  getQuizResult,
  sanitizeResultCategory,
} from '../adventure-quiz/quiz-data.js';

const STORAGE_KEY = 'wknd-quiz-result';

/**
 * @returns {Promise<void>}
 */
async function trackResultView(result) {
  try {
    const mod = await import('../../scripts/quiz-analytics.js');
    mod.pushQuizEvent('quizResultView', {
      quizId: 'find-your-adventure',
      resultCategory: result.resultCategory,
      adventurerType: result.adventurerType,
      experienceCount: result.experiences.length,
    });
  } catch {
    // optional during local dev
  }
}

/**
 * @returns {string}
 */
function getResultCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = sanitizeResultCategory(params.get('type'));
  if (params.get('type')) return fromUrl;
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    if (stored.resultCategory) return sanitizeResultCategory(stored.resultCategory);
  } catch {
    // ignore
  }
  return 'general-outdoor';
}

/**
 * @param {Element} block
 * @param {import('../adventure-quiz/quiz-data.js').QuizResult} result
 */
function renderHero(block, result) {
  const hero = document.createElement('div');
  hero.className = 'quiz-results-hero';
  const bg = createResponsivePicture(result.heroImage, result.heroImageAlt, false, [
    { media: '(min-width: 900px)', width: 1600 },
    { width: 600 },
  ]);
  hero.innerHTML = `
    <div class="quiz-results-hero-bg"></div>
    <div class="quiz-results-hero-content">
      <p class="quiz-results-tag">${result.tagline}</p>
      <h1>${result.adventurerType}</h1>
      <p class="quiz-results-blurb">${result.blurb}</p>
    </div>
  `;
  hero.querySelector('.quiz-results-hero-bg').append(bg);
  block.append(hero);
}

/**
 * @param {Element} block
 * @param {import('../adventure-quiz/quiz-data.js').QuizResult} result
 */
function renderExperiences(block, result) {
  const section = document.createElement('div');
  section.className = 'quiz-results-experiences';
  const heading = document.createElement('h2');
  heading.textContent = 'Experiences matched for you';
  section.append(heading);

  const list = document.createElement('ul');
  result.experiences.forEach((exp) => {
    const li = document.createElement('li');
    const pic = createResponsivePicture(exp.image, exp.imageAlt, false, [{ width: 750 }]);
    li.innerHTML = `
      <div class="quiz-results-card-image"></div>
      <div class="quiz-results-card-body">
        <p class="quiz-results-card-category">${exp.category}</p>
        <h3><a href="${exp.path}">${exp.title}</a></h3>
        <p>${exp.description}</p>
      </div>
    `;
    li.querySelector('.quiz-results-card-image').append(pic);
    const link = li.querySelector('a');
    link.addEventListener('click', async () => {
      try {
        const mod = await import('../../scripts/quiz-analytics.js');
        mod.pushQuizEvent('quizExperienceClick', {
          quizId: 'find-your-adventure',
          resultCategory: result.resultCategory,
          adventurerType: result.adventurerType,
          experiencePath: exp.path,
        });
      } catch {
        // optional
      }
    });
    list.append(li);
  });
  section.append(list);
  block.append(section);
}

/**
 * @param {Element} block
 * @param {import('../adventure-quiz/quiz-data.js').QuizResult} result
 */
function renderCta(block, result) {
  const cta = document.createElement('div');
  cta.className = 'quiz-results-cta';
  const interest = result.adventureInterest ? `&adventureInterest=${encodeURIComponent(result.adventureInterest)}` : '';
  cta.innerHTML = `
    <h2>Ready to plan your trip?</h2>
    <p>Save your results and tell us what you are dreaming of — no commitment required.</p>
    <p><a class="button" href="/adventures?quizType=${encodeURIComponent(result.resultCategory)}${interest}">Get trip ideas</a></p>
  `;
  block.append(cta);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const category = getResultCategoryFromUrl();
  const result = getQuizResult(category);
  block.replaceChildren();
  block.dataset.resultCategory = result.resultCategory;
  block.dataset.adventurerType = result.adventurerType;
  renderHero(block, result);
  renderExperiences(block, result);
  renderCta(block, result);
  await trackResultView(result);
}
