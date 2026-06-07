import {
  getApiBase,
  getSessionToken,
  loginBusiness,
} from '../../scripts/b2b-api.js';

/**
 * @param {Element} block
 */
function parseConfig(block) {
  const rows = [...block.children];
  return {
    title: rows[0]?.children?.[1]?.textContent?.trim() || rows[0]?.textContent?.trim() || 'Business Sign In',
    subtitle: rows[1]?.children?.[1]?.textContent?.trim() || '',
    apiBase: rows[2]?.children?.[1]?.textContent?.trim() || '',
    redirectUrl: rows[3]?.children?.[1]?.textContent?.trim() || '/dashboard',
  };
}

/**
 * @param {string} message
 * @param {HTMLFormElement} form
 */
function showError(form, message) {
  let el = form.querySelector('.business-login-error');
  if (!el) {
    el = document.createElement('p');
    el.className = 'business-login-error';
    el.setAttribute('role', 'alert');
    form.prepend(el);
  }
  el.textContent = message;
}

/**
 * @param {Element} block
 * @param {ReturnType<typeof parseConfig>} config
 */
function buildForm(block, config) {
  block.textContent = '';
  block.classList.add('business-login-loaded');

  const header = document.createElement('div');
  header.className = 'business-login-header';
  header.innerHTML = `<h2>${config.title}</h2>${config.subtitle ? `<p>${config.subtitle}</p>` : ''}`;
  block.append(header);

  const form = document.createElement('form');
  form.className = 'business-login-form';
  form.noValidate = true;
  form.innerHTML = `
    <label>Email <input name="email" type="email" required maxlength="254" autocomplete="username"></label>
    <label>Password <input name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password"></label>
    <button type="submit" class="button">Sign in</button>
    <p class="business-login-register">No account? <a href="/register">Register your business</a></p>
  `;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelector('.business-login-error')?.remove();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    const fd = new FormData(form);
    try {
      const apiBase = getApiBase(config.apiBase);
      await loginBusiness(
        apiBase,
        String(fd.get('email') || '').trim(),
        String(fd.get('password') || ''),
      );
      window.location.href = config.redirectUrl;
    } catch {
      showError(form, 'Sign in failed. Check your email and password.');
      btn.disabled = false;
    }
  });

  block.append(form);
}

/**
 * @param {Element} block
 */
export default async function decorate(block) {
  const config = parseConfig(block);
  if (getSessionToken()) {
    block.classList.add('business-login-authenticated');
    block.innerHTML = '<p class="business-login-signed-in">You are signed in. <a href="/dashboard">Go to dashboard</a></p>';
    return;
  }
  buildForm(block, config);
}
