import { createResponsivePicture } from '../../scripts/media.js';
import {
  OPTION_WEIGHTS,
  QUIZ_ID,
  getResultsPath,
  normalizeOptionKey,
  scoreQuizResult,
} from './quiz-data.js';

const STORAGE_KEY = 'wknd-quiz-result';

/**
 * @param {string} src
 * @param {string} alt
 */
function buildOptionPicture(src, alt) {
  if (!src) return null;
  return createResponsivePicture(src, alt || '', false, [{ width: 400 }]);
}

/**
 * @param {Element} block
 * @returns {Promise<void>}
 */
async function trackQuizEvent(eventName, payload = {}) {
  try {
    const mod = await import('../../scripts/quiz-analytics.js');
    mod.pushQuizEvent(eventName, payload);
  } catch {
    // analytics optional during local dev
  }
}

/**
 * @param {Element} block
 */
function parseQuestions(block) {
  const rows = [...block.children];
  let startIndex = 0;
  const firstCell = rows[0]?.querySelector(':scope > div:first-child');
  if (firstCell?.querySelector('h2')) startIndex = 1;
  const questionRows = rows.slice(startIndex);

  return questionRows.map((row, index) => {
    const cells = [...row.children];
    const questionEl = cells[0]?.querySelector('h2, h3, p') || cells[0];
    const questionText = questionEl?.textContent?.trim() || `Question ${index + 1}`;
    const optionsWrap = cells[1] || cells[0];
    const options = [...(optionsWrap?.children || [])].map((optionRow) => {
      const img = optionRow.querySelector('img');
      const label = optionRow.querySelector('p, h4')?.textContent?.trim()
        || optionRow.textContent.trim();
      return {
        label,
        key: normalizeOptionKey(label),
        image: img?.getAttribute('src') || '',
        imageAlt: img?.getAttribute('alt') || label,
      };
    }).filter((opt) => opt.label);

    return { index, questionText, options };
  }).filter((q) => q.options.length);
}

/**
 * @param {Element} block
 * @param {ReturnType<typeof parseQuestions>} questions
 */
function renderQuiz(block, questions) {
  const total = questions.length;
  let step = 0;
  /** @type {string[]} */
  const selections = [];

  const shell = document.createElement('div');
  shell.className = 'adventure-quiz-shell';
  shell.innerHTML = `
    <div class="adventure-quiz-progress" aria-hidden="true">
      <div class="adventure-quiz-progress-bar"></div>
    </div>
    <p class="adventure-quiz-step-label"></p>
    <div class="adventure-quiz-question" role="group"></div>
    <div class="adventure-quiz-actions">
      <button type="button" class="adventure-quiz-back button secondary">Back</button>
      <button type="button" class="adventure-quiz-next button primary">Next</button>
    </div>
  `;
  block.replaceChildren(shell);

  const progressBar = shell.querySelector('.adventure-quiz-progress-bar');
  const stepLabel = shell.querySelector('.adventure-quiz-step-label');
  const questionWrap = shell.querySelector('.adventure-quiz-question');
  const actionsWrap = shell.querySelector('.adventure-quiz-actions');
  const backBtn = shell.querySelector('.adventure-quiz-back');
  const nextBtn = shell.querySelector('.adventure-quiz-next');

  const updateActionsVisibility = () => {
    const hasSelection = Boolean(selections[step]);
    actionsWrap.classList.toggle('is-visible', hasSelection);
    shell.classList.toggle('has-actions', hasSelection);
    nextBtn.disabled = !hasSelection;
  };

  const updateProgress = () => {
    const pct = ((step + 1) / total) * 100;
    progressBar.style.width = `${pct}%`;
    stepLabel.textContent = `Question ${step + 1} of ${total}`;
    backBtn.disabled = step === 0;
    nextBtn.textContent = step === total - 1 ? 'See my results' : 'Next';
  };

  const renderStep = () => {
    const current = questions[step];
    questionWrap.innerHTML = '';
    const heading = document.createElement('h3');
    heading.className = 'adventure-quiz-question-text';
    heading.id = `quiz-question-${step}`;
    heading.textContent = current.questionText;
    questionWrap.append(heading);

    const grid = document.createElement('div');
    grid.className = 'adventure-quiz-options';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-labelledby', heading.id);

    current.options.forEach((option, optionIndex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'adventure-quiz-option';
      btn.dataset.optionKey = option.key;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', selections[step] === option.key ? 'true' : 'false');
      if (selections[step] === option.key) btn.classList.add('is-selected');

      const imageWrap = document.createElement('div');
      imageWrap.className = 'adventure-quiz-option-image';
      const pic = buildOptionPicture(option.image, option.imageAlt);
      if (pic) imageWrap.append(pic);

      const label = document.createElement('span');
      label.className = 'adventure-quiz-option-label';
      label.textContent = option.label;

      btn.append(imageWrap, label);

      btn.addEventListener('click', () => {
        selections[step] = option.key;
        grid.querySelectorAll('.adventure-quiz-option').forEach((el) => {
          el.classList.remove('is-selected');
          el.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('is-selected');
        btn.setAttribute('aria-checked', 'true');
        updateActionsVisibility();
      });

      btn.addEventListener('keydown', (event) => {
        const buttons = [...grid.querySelectorAll('.adventure-quiz-option')];
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          buttons[(optionIndex + 1) % buttons.length].focus();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          buttons[(optionIndex - 1 + buttons.length) % buttons.length].focus();
        }
      });

      grid.append(btn);
    });

    questionWrap.append(grid);
    updateProgress();
    updateActionsVisibility();
    const selected = grid.querySelector('.is-selected');
    if (selected) selected.focus();
    else grid.querySelector('.adventure-quiz-option')?.focus();
  };

  const completeQuiz = async () => {
    const resultCategory = scoreQuizResult(selections);
    const payload = {
      quizId: QUIZ_ID,
      resultCategory,
      selections,
      stepIndex: step + 1,
      step: `q${step + 1}-complete`,
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        resultCategory,
        selections,
        completedAt: Date.now(),
      }));
    } catch {
      // ignore storage errors
    }
    await trackQuizEvent('quizComplete', payload);
    const url = new URL(getResultsPath(), window.location.origin);
    url.searchParams.set('type', resultCategory);
    window.location.href = url.toString();
  };

  backBtn.addEventListener('click', () => {
    if (step === 0) return;
    step -= 1;
    renderStep();
  });

  nextBtn.addEventListener('click', async () => {
    if (!selections[step]) return;
    await trackQuizEvent('quizStepComplete', {
      quizId: QUIZ_ID,
      step: `q${step + 1}`,
      stepIndex: step + 1,
      answerId: selections[step],
    });
    if (step < total - 1) {
      step += 1;
      renderStep();
      return;
    }
    await completeQuiz();
  });

  block.id = block.id || 'quiz';
  trackQuizEvent('quizStart', { quizId: QUIZ_ID, stepIndex: 0 });
  renderStep();
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const questions = parseQuestions(block);
  if (!questions.length) return;

  const maxQuestions = Object.keys(OPTION_WEIGHTS).length;
  const trimmed = questions.slice(0, maxQuestions);
  renderQuiz(block, trimmed);
}
