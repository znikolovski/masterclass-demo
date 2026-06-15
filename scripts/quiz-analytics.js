/**
 * Quiz funnel tracking via ACDL. Never overwrites page.adventureCategory (eVar4).
 * @see docs/QUIZ-ANALYTICS-PLAN.md
 */
/* eslint-disable import/prefer-default-export */

const BLOCK_NAME = 'adventure-quiz';

/** Time for ACDL + Launch rules to process before navigation unload. */
const ANALYTICS_FLUSH_MS = 450;

/**
 * @returns {boolean}
 */
function isTrackingEnabled() {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.classList.contains('adobe-ue-edit')) return false;
  return !!window.adobeDataLayer;
}

/**
 * @param {object} payload
 * @returns {object}
 */
function buildQuizContext(payload = {}) {
  return {
    quizId: payload.quizId || 'find-your-adventure',
    step: payload.step || '',
    stepIndex: payload.stepIndex || 0,
    answerId: payload.answerId || '',
    resultCategory: payload.resultCategory || '',
    adventurerType: payload.adventurerType || '',
    experienceCount: payload.experienceCount || 0,
    experiencePath: payload.experiencePath || '',
  };
}

/**
 * @param {string} eventName
 * @param {object} [payload]
 * @param {{ awaitFlush?: boolean }} [options]
 * @returns {Promise<void>|void}
 */
export function pushQuizEvent(eventName, payload = {}, options = {}) {
  if (!isTrackingEnabled() || !eventName) return options.awaitFlush ? Promise.resolve() : undefined;

  const quiz = buildQuizContext(payload);
  window.adobeDataLayer.push({
    event: eventName,
    quiz,
    interaction: {
      label: quiz.adventurerType || quiz.quizId,
      block: BLOCK_NAME,
      detail: quiz.step || quiz.resultCategory || quiz.answerId || '',
    },
  });

  if (!options.awaitFlush) return undefined;

  return new Promise((resolve) => {
    window.setTimeout(resolve, ANALYTICS_FLUSH_MS);
  });
}
