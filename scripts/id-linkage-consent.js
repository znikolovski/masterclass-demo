import { getAccessToken } from './wknd-auth.js';
import { getIdLinkageConfig } from './id-linkage-config.js';

const STATES = new Set(['granted', 'withdrawn', 'absent', 'unknown']);
const STATUS_TEXT = {
  granted: 'Identity linking is allowed.',
  withdrawn: 'Identity linking is withdrawn.',
  absent: 'You have not allowed identity linking.',
  unknown: 'Your identity-linking preference could not be confirmed.',
};
const ERRORS = {
  unauthenticated: 'Please sign in again before changing this preference.',
  'not-allowlisted': 'Identity linking is not available for this account.',
  'linkage-disabled': 'Identity linking is not enabled.',
  'wording-not-approved': 'This consent wording is not enabled. Your preference was not saved.',
  conflict: 'Your preference changed during this request. Reload its status before trying again.',
  'activation-pending': 'Your consent is awaiting confirmation. Retry after reloading its status.',
  'evidence-failed': 'We could not confirm the consent record. Reload its status before trying again.',
};
const DIAGNOSTIC_SCHEMA = 'wknd.target-aam-diagnostic-result/v1';
const DIAGNOSTIC_MARKERS = {
  'climbing-planner': 'Target selected the Climbing Planner diagnostic.',
  'climbing-interest': 'Target selected the Climbing Interest diagnostic.',
  control: 'Target selected the control experience. This is not negative audience membership.',
};

class ConsentError extends Error {}

function endpointFor(config) {
  const url = new URL(config.endpoint);
  if (!['stage', 'production'].includes(config.environment)
    || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.hostname.endsWith('.adobeioruntime.net')
    || url.pathname !== '/api/v1/web/commerce/target-diagnostic'
    || (config.environment === 'stage') !== url.hostname.endsWith('-stage.adobeioruntime.net')) {
    throw new Error('Identity-linking configuration is invalid.');
  }
  return url;
}

export default async function mountIdLinkageConsent(block, {
  config = getIdLinkageConfig(),
  getToken = (url) => getAccessToken(url),
  fetchImpl = fetch,
} = {}) {
  if (!config || config.enabled !== true || !config.origins.includes(window.location.origin)) {
    return null;
  }
  const content = block.querySelector('.account__content');
  if (!content) return null;
  const existing = content.querySelector('#identity-linking');
  if (existing) return existing;

  const section = document.createElement('section');
  section.id = 'identity-linking';
  section.className = 'account__section';
  section.setAttribute('aria-labelledby', 'account-linkage-title');
  section.innerHTML = `
    <h2 id="account-linkage-title">Identity linking</h2>
    <p class="account__linkage-status" role="status" aria-live="polite"></p>
    <form class="account__linkage-form">
      <label class="account__linkage-choice">
        <input type="checkbox" name="identity-linkage">
        <span></span>
      </label>
      <p class="account__linkage-help"></p>
      <div class="account__linkage-actions">
        <button type="submit" class="button primary">Allow identity linking</button>
        <button type="button" class="button secondary" data-linkage="withdraw">Withdraw permission</button>
        <button type="button" class="button secondary" data-linkage="reload">Reload status</button>
      </div>
    </form>
    <p class="account__error" role="alert"></p>`;
  content.append(section);
  const nav = block.querySelector('.account__nav ul');
  if (nav) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#identity-linking';
    link.textContent = 'Identity linking';
    li.append(link);
    nav.append(li);
  }
  const status = section.querySelector('.account__linkage-status');
  const error = section.querySelector('.account__error');
  const form = section.querySelector('form');
  const choice = form.querySelector('input');
  const grant = form.querySelector('[type="submit"]');
  const withdraw = form.querySelector('[data-linkage="withdraw"]');
  const reload = form.querySelector('[data-linkage="reload"]');
  const canGrant = typeof config.wording === 'string' && config.wording.trim().length > 0
    && typeof config.wordingVersion === 'string' && config.wordingVersion.trim().length > 0;
  section.querySelector('.account__linkage-choice span').textContent = canGrant
    ? config.wording : 'Consent wording is not enabled. You can still withdraw an existing permission.';
  section.querySelector('.account__linkage-help').textContent = 'This is optional and separate from email preferences. No permission is granted by signing in.';
  let busy = false;
  let confirmed = false;
  let consentState = 'unknown';
  let endpoint;
  let diagnosticButton;
  let diagnosticStatus;
  if (config.environment === 'stage' && config.diagnosticEnabled === true) {
    const diagnostic = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = 'Stage audience check';
    const help = document.createElement('p');
    help.textContent = 'An optional Target diagnostic, not complete AAM membership evidence or discount authorization.';
    const actions = document.createElement('div');
    actions.className = 'account__linkage-actions';
    diagnosticButton = document.createElement('button');
    diagnosticButton.type = 'button';
    diagnosticButton.className = 'button secondary';
    diagnosticButton.textContent = 'Check Stage Target audience';
    actions.append(diagnosticButton);
    diagnosticStatus = document.createElement('p');
    diagnosticStatus.id = 'account-linkage-diagnostic-status';
    diagnosticStatus.setAttribute('role', 'status');
    diagnosticStatus.setAttribute('aria-live', 'polite');
    diagnostic.append(heading, help, actions, diagnosticStatus);
    section.append(diagnostic);
  }

  function controls() {
    choice.disabled = busy || !canGrant || !confirmed;
    grant.disabled = busy || !canGrant || !confirmed || !choice.checked;
    withdraw.disabled = busy || !endpoint;
    reload.disabled = busy || !endpoint;
    if (diagnosticButton) {
      diagnosticButton.disabled = busy || !endpoint || !confirmed || consentState !== 'granted';
    }
    form.setAttribute('aria-busy', String(busy));
  }

  function showError(message) {
    confirmed = false;
    consentState = 'unknown';
    choice.checked = false;
    status.textContent = STATUS_TEXT.unknown;
    error.textContent = message;
  }

  async function request(body) {
    const token = await getToken(new URL('/api/v1/web/commerce/auth-config', endpoint).href);
    if (typeof token !== 'string' || !token) throw new ConsentError(ERRORS.unauthenticated);
    const response = await fetchImpl(endpoint.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (!result || Array.isArray(result) || result.environment !== config.environment
      || result.evidence !== false || result.financialAuthorization !== false) {
      throw new ConsentError('The consent service returned an unexpected environment or contract. No preference was confirmed.');
    }
    if (!response.ok) {
      throw new ConsentError(typeof result?.reason === 'string' && Object.hasOwn(ERRORS, result.reason)
        ? ERRORS[result.reason] : 'We could not confirm this preference. Reload its status before trying again.');
    }
    if (body.op === 'decide') {
      const decided = result.status === 'decided' && typeof result.marker === 'string'
        && Object.hasOwn(DIAGNOSTIC_MARKERS, result.marker);
      const unavailable = result.status === 'unavailable' && typeof result.reason === 'string'
        && result.marker === undefined;
      if (result.schema !== DIAGNOSTIC_SCHEMA || (!decided && !unavailable)) {
        throw new ConsentError('The Stage Target service returned an unexpected diagnostic response.');
      }
      return result;
    }
    if (result.status !== 'ok' || !STATES.has(result.consent)
      || (body.op === 'consent' && (typeof result.changed !== 'boolean'
        || (body.optIn ? result.consent !== 'granted' : !['withdrawn', 'absent'].includes(result.consent))))) {
      throw new ConsentError('The consent service returned an unexpected response. Reload its status.');
    }
    return result;
  }

  async function update(body) {
    if (busy) return;
    busy = true;
    error.textContent = '';
    if (diagnosticStatus) diagnosticStatus.textContent = '';
    controls();
    try {
      const result = await request(body);
      confirmed = true;
      consentState = result.consent;
      choice.checked = false;
      status.textContent = STATUS_TEXT[result.consent];
    } catch (e) {
      showError(e instanceof ConsentError
        ? e.message : 'The consent service is unavailable. Reload its status before trying again.');
    } finally {
      busy = false;
      controls();
    }
  }

  async function checkTarget() {
    if (busy || !diagnosticButton || diagnosticButton.disabled) return;
    busy = true;
    diagnosticStatus.textContent = 'Checking Stage Target...';
    controls();
    try {
      const result = await request({ op: 'decide' });
      diagnosticStatus.textContent = result.status === 'decided'
        ? DIAGNOSTIC_MARKERS[result.marker]
        : 'No Target decision is available. This does not establish non-membership.';
    } catch {
      diagnosticStatus.textContent = 'The Stage Target check is not ready or is unavailable. No audience or discount is confirmed.';
    } finally {
      busy = false;
      controls();
    }
  }

  if (diagnosticButton) diagnosticButton.addEventListener('click', checkTarget);
  choice.addEventListener('change', controls);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!grant.disabled && choice.checked) {
      update({
        op: 'consent', optIn: true, wordingVersion: config.wordingVersion, source: 'account-settings',
      });
    }
  });
  withdraw.addEventListener('click', () => update({
    op: 'consent', optIn: false, source: 'account-settings',
  }));
  reload.addEventListener('click', () => update({ op: 'consent-status' }));
  try {
    endpoint = endpointFor(config);
    controls();
    await update({ op: 'consent-status' });
  } catch {
    showError('Identity-linking configuration is invalid. No preference was sent.');
    controls();
  }
  return section;
}
