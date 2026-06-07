import {
  getApiBase,
  registerBusiness,
  setSessionToken,
} from '../../scripts/b2b-api.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * @param {Element} block
 */
function parseConfig(block) {
  const rows = [...block.children];
  return {
    title: rows[0]?.children?.[1]?.textContent?.trim() || rows[0]?.textContent?.trim() || 'Register Your Business',
    subtitle: rows[1]?.children?.[1]?.textContent?.trim() || '',
    apiBase: rows[2]?.children?.[1]?.textContent?.trim() || '',
    redirectUrl: rows[3]?.children?.[1]?.textContent?.trim() || '/dashboard',
  };
}

/**
 * @param {File} file
 */
function readLogoAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_TYPES.has(file.type)) {
      reject(new Error('Logo must be PNG, JPEG, WebP, or GIF'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error('Logo must be 2MB or smaller'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read logo file'));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {string} message
 */
function showError(form, message) {
  let el = form.querySelector('.business-register-error');
  if (!el) {
    el = document.createElement('p');
    el.className = 'business-register-error';
    el.setAttribute('role', 'alert');
    form.prepend(el);
  }
  el.textContent = message;
}

function clearError(form) {
  form.querySelector('.business-register-error')?.remove();
}

/**
 * @param {Element} block
 */
function buildForm(block, config) {
  block.textContent = '';
  block.classList.add('business-register-loaded');

  const header = document.createElement('div');
  header.className = 'business-register-header';
  header.innerHTML = `<h2>${config.title}</h2>${config.subtitle ? `<p>${config.subtitle}</p>` : ''}`;
  block.append(header);

  const form = document.createElement('form');
  form.className = 'business-register-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="business-register-grid">
      <label>Company name <input name="companyName" type="text" required maxlength="120" autocomplete="organization"></label>
      <label>Company logo <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
      <label>Contact name <input name="contactName" type="text" required maxlength="120" autocomplete="name"></label>
      <label>Contact email <input name="contactEmail" type="email" required maxlength="254" autocomplete="email"></label>
      <label>Phone <input name="phone" type="tel" required maxlength="40" autocomplete="tel"></label>
      <label>Login email <input name="loginEmail" type="email" required maxlength="254" autocomplete="username"></label>
      <label>Password <input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
      <label>Confirm password <input name="confirmPassword" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>
    </div>
    <button type="submit" class="button">Create business account</button>
  `;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    const fd = new FormData(form);
    const payload = {
      companyName: String(fd.get('companyName') || '').trim(),
      contactName: String(fd.get('contactName') || '').trim(),
      contactEmail: String(fd.get('contactEmail') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      loginEmail: String(fd.get('loginEmail') || '').trim(),
      password: String(fd.get('password') || ''),
      confirmPassword: String(fd.get('confirmPassword') || ''),
    };

    const logoFile = fd.get('logo');
    if (logoFile && logoFile instanceof File && logoFile.size > 0) {
      try {
        payload.logoDataUrl = await readLogoAsDataUrl(logoFile);
      } catch (err) {
        showError(form, err.message);
        btn.disabled = false;
        return;
      }
    }

    try {
      const apiBase = getApiBase(config.apiBase);
      const result = await registerBusiness(apiBase, payload);
      if (result?.token) setSessionToken(result.token);
      window.location.href = config.redirectUrl;
    } catch (err) {
      const details = err.data?.details?.join(', ');
      showError(form, details || err.message || 'Registration failed');
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
  buildForm(block, config);
}
