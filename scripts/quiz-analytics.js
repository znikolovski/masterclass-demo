/**
 * Quiz funnel tracking via ACDL. Never overwrites page.adventureCategory (eVar4).
 * @see docs/QUIZ-ANALYTICS-PLAN.md
 */
/* eslint-disable import/prefer-default-export */

const BLOCK_NAME = 'adventure-quiz';

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
 */
export function pushQuizEvent(eventName, payload = {}) {
  if (!isTrackingEnabled() || !eventName) return;

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
}
