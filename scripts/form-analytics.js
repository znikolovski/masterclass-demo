/**
 * Form funnel tracking via ACDL for Analytics / Workspace fallout.
 * Never sends field values — only form id, step names, and error field ids.
 * @see docs/FORM-ANALYTICS-PLAN.md
 */

const IMPRESSION_RATIO = 0.5;
const BLOCK_NAME = 'form';

/**
 * @returns {boolean}
 */
function isTrackingEnabled() {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.classList.contains('adobe-ue-edit')) return false;
  return !!window.adobeDataLayer;
}

/**
 * @param {HTMLFormElement} form
 */
export function resolveFormSlug(form) {
  if (!form) return '';
  if (form.dataset.formSlug) return form.dataset.formSlug;
  const action = form.dataset.action || '';
  const apiMatch = action.match(/\/api\/forms\/([^/?#]+)/i);
  if (apiMatch) return apiMatch[1];
  try {
    const path = new URL(action, window.location.origin).pathname;
    const segment = path.split('/').filter(Boolean).pop() || '';
    if (segment && segment !== 'submit') return segment.replace(/\.json$/i, '');
  } catch {
    // ignore malformed action URLs
  }
  return form.dataset.id || 'form';
}

/**
 * @param {HTMLFormElement} form
 * @returns {HTMLElement[]}
 */
function getTrackableFields(form) {
  return [...form.querySelectorAll('input, select, textarea')].filter((el) => {
    if (!el.name || el.disabled) return false;
    if (el.type === 'submit' || el.type === 'button' || el.type === 'hidden') return false;
    if (el.closest('.g-recaptcha')) return false;
    return true;
  });
}

/**
 * @param {HTMLFormElement} form
 * @param {string} [step]
 */
export function buildFormContext(form, step = '') {
  const fields = getTrackableFields(form);
  const stepIndex = step
    ? Math.max(0, fields.findIndex((el) => el.name === step)) + 1
    : 0;
  return {
    formId: form.dataset.id || '',
    formSlug: resolveFormSlug(form),
    step,
    stepIndex: stepIndex || 0,
    totalSteps: fields.length,
  };
}

/**
 * @param {string} eventName
 * @param {HTMLFormElement} form
 * @param {object} [extra]
 */
export function pushFormEvent(eventName, form, extra = {}) {
  if (!isTrackingEnabled() || !eventName || !form) return;

  const formCtx = buildFormContext(form, extra.step || '');
  window.adobeDataLayer.push({
    event: eventName,
    form: {
      ...formCtx,
      ...extra,
    },
    interaction: {
      label: formCtx.formSlug || formCtx.formId || 'form',
      block: BLOCK_NAME,
      detail: extra.step || extra.errorField || formCtx.formSlug || '',
    },
  });
}

/**
 * @param {HTMLFormElement} form
 */
export function pushFormSubmitAttempt(form) {
  pushFormEvent('formSubmitAttempt', form, { step: 'submit' });
}

/**
 * @param {HTMLFormElement} form
 * @param {string} [fieldName]
 */
export function pushFormValidationError(form, fieldName = '') {
  pushFormEvent('formValidationError', form, {
    step: 'submit',
    errorField: fieldName,
  });
}

/**
 * @param {HTMLFormElement} form
 */
export function pushFormSubmitSuccess(form) {
  pushFormEvent('formSubmitSuccess', form, { step: 'success' });
}

/**
 * @param {HTMLFormElement} form
 * @param {string} [reason]
 */
export function pushFormSubmitError(form, reason = '') {
  pushFormEvent('formSubmitError', form, {
    step: 'submit',
    errorReason: reason.slice(0, 120),
  });
}

/**
 * @param {HTMLFormElement} form
 * @param {string} [formSlug]
 */
export function initFormAnalytics(form, formSlug = '') {
  if (!form || form.dataset.formAnalyticsInit === 'true') return;
  form.dataset.formAnalyticsInit = 'true';
  if (formSlug) form.dataset.formSlug = formSlug;

  const fields = getTrackableFields(form);
  form.dataset.analyticsTotalSteps = String(fields.length);

  const markOnce = (key) => {
    if (form.dataset[key] === 'true') return false;
    form.dataset[key] = 'true';
    return true;
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.intersectionRatio < IMPRESSION_RATIO) return;
      if (!markOnce('analyticsImpression')) return;
      pushFormEvent('formImpression', form);
      observer.disconnect();
    });
  }, { threshold: IMPRESSION_RATIO });
  observer.observe(form);

  form.addEventListener('focusin', (event) => {
    const { target } = event;
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('input, select, textarea')) return;
    if (!markOnce('analyticsStarted')) return;
    pushFormEvent('formStart', form, { step: target.name || 'start' });
  }, true);

  fields.forEach((field) => {
    field.addEventListener('blur', () => {
      if (field.dataset.analyticsStepComplete === 'true') return;
      const hasValue = field.type === 'checkbox' || field.type === 'radio'
        ? field.checked
        : Boolean(field.value?.trim());
      if (!hasValue) return;
      if (!field.checkValidity()) return;
      field.dataset.analyticsStepComplete = 'true';
      pushFormEvent('formStepComplete', form, { step: field.name });
    });
  });
}
