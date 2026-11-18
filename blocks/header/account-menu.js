/**
 * Header account menu (disclosure panel under the account button). Loaded on first use; the
 * sign-in code (scripts/shop-auth.js → Auth0) only loads when a sign-in/out action is chosen.
 */
import { ACCOUNT_EVENT, ACCOUNT_PATH, getAccountState } from '../../scripts/account-state.js';

let panel;
let button;

function isOpen() {
  return button?.getAttribute('aria-expanded') === 'true';
}

function close({ focus = false } = {}) {
  if (!panel || !isOpen()) return;
  button.setAttribute('aria-expanded', 'false');
  panel.hidden = true;
  if (focus) button.focus();
}

function onKeydown(e) {
  if (e.key === 'Escape' && isOpen()) {
    e.stopPropagation();
    close({ focus: true });
  }
}

function onPointerDown(e) {
  if (isOpen() && !button.parentElement.contains(e.target)) close();
}

async function runAuth(action, trigger) {
  const error = panel.querySelector('.nav-account-menu__error');
  error.textContent = '';
  trigger.disabled = true;
  try {
    const shopAuth = await import('../../scripts/shop-auth.js');
    if (action === 'signout') {
      await shopAuth.signOutOfShop();
      return;
    }
    await shopAuth.signInToShop({ signup: action === 'signup' });
    close({ focus: true });
    // rebuild the account page for the signed-in state; elsewhere the drop-ins react to the event
    if (window.location.pathname.replace(/\/$/, '') === ACCOUNT_PATH) window.location.reload();
  } catch (e) {
    error.textContent = e?.message && !/cancel|closed/i.test(e.message)
      ? e.message
      : 'Sign-in was cancelled. Try again when you are ready.';
  } finally {
    trigger.disabled = false;
  }
}

function render() {
  const state = getAccountState();
  panel.classList.toggle('nav-account-menu--signed-in', !!state);
  panel.innerHTML = state ? `
    <p class="nav-account-menu__eyebrow">WKND account</p>
    <p class="nav-account-menu__title"></p>
    <ul class="nav-account-menu__links">
      <li><a href="${ACCOUNT_PATH}">Account overview</a></li>
      <li><a href="${ACCOUNT_PATH}#orders">Orders</a></li>
      <li><a href="${ACCOUNT_PATH}#addresses">Saved addresses</a></li>
    </ul>
    <button type="button" class="button secondary" data-action="signout">Sign out</button>
    <p class="nav-account-menu__error" role="alert"></p>` : `
    <p class="nav-account-menu__eyebrow">WKND account</p>
    <p class="nav-account-menu__title">Sign in to WKND</p>
    <p class="nav-account-menu__copy">Track your gear orders, check out faster and keep your addresses. One account for WKND Adventures and WKND Aero.</p>
    <button type="button" class="button primary" data-action="signin">Sign in</button>
    <button type="button" class="button secondary" data-action="signup">Create account</button>
    <p class="nav-account-menu__error" role="alert"></p>`;
  if (state) {
    panel.querySelector('.nav-account-menu__title').textContent = state.firstName ? `Hi, ${state.firstName}` : 'Hi there';
  }
  panel.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => runAuth(el.dataset.action, el));
  });
}

function build(trigger) {
  button = trigger;
  panel = document.createElement('div');
  panel.id = 'nav-account-menu';
  panel.className = 'nav-account-menu';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Your WKND account');
  panel.hidden = true;
  button.after(panel);
  button.parentElement.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !button.parentElement.contains(e.relatedTarget)) close();
  });
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onPointerDown);
  window.addEventListener(ACCOUNT_EVENT, () => { if (panel) render(); });
}

/** @param {HTMLButtonElement} trigger header account button */
export default function toggleAccountMenu(trigger) {
  if (!panel) build(trigger);
  if (isOpen()) {
    close();
    return;
  }
  render();
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  panel.querySelector('a, button')?.focus();
}
