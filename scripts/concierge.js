import { loadCSS } from './aem.js';

export default async function initConcierge() {
  if (document.querySelector('.wknd-sherpa')) return;
  await loadCSS(`${window.hlx.codeBasePath}/styles/concierge.css`);
  if (document.querySelector('.wknd-sherpa')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'wknd-sherpa';
  wrapper.innerHTML = `
    <button type="button" class="wknd-sherpa-launcher" aria-label="Chat with WKND Sherpa"
      aria-haspopup="dialog" aria-controls="wknd-sherpa-dialog" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="m15.5 8.5-2 5-5 2 2-5z"></path>
      </svg>
      <span>WKND Sherpa</span>
    </button>
    <dialog id="wknd-sherpa-dialog" class="wknd-sherpa-panel" aria-labelledby="wknd-sherpa-title">
      <div class="wknd-sherpa-header">
        <div><h2 id="wknd-sherpa-title">WKND Sherpa</h2><p>Your AI adventure guide</p></div>
        <button type="button" class="wknd-sherpa-close" aria-label="Close WKND Sherpa" autofocus>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m6 6 12 12M6 18 18 6"></path>
          </svg>
        </button>
      </div>
      <div class="wknd-sherpa-notice">
        <p role="status" aria-live="polite">Loading WKND Sherpa...</p>
        <button type="button" class="wknd-sherpa-retry" hidden>Try again</button>
      </div>
      <iframe class="wknd-sherpa-frame" title="Chat with WKND Sherpa" hidden></iframe>
    </dialog>`;
  document.body.append(wrapper);

  const launcher = wrapper.querySelector('.wknd-sherpa-launcher');
  const dialog = wrapper.querySelector('dialog');
  const notice = wrapper.querySelector('.wknd-sherpa-notice');
  const status = notice.querySelector('[role="status"]');
  const retry = notice.querySelector('button');
  const frame = wrapper.querySelector('iframe');
  let loading = false;
  let ready = false;
  let timeout;

  function showError(message) {
    clearTimeout(timeout);
    loading = false;
    notice.hidden = false;
    status.textContent = message;
    retry.hidden = false;
    frame.hidden = true;
  }

  function initialize() {
    if (loading || ready) return;
    loading = true;
    retry.hidden = true;
    notice.hidden = false;
    status.textContent = 'Loading WKND Sherpa...';
    frame.src = `${window.hlx.codeBasePath}/tools/concierge/index.html`;
    timeout = setTimeout(() => {
      // Stop the incomplete document so a late bootstrap cannot race a retry.
      frame.src = 'about:blank';
      showError('WKND Sherpa took too long to load. Please check your connection and consent settings, then try again.');
    }, 30000);
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow
      || event.data?.source !== 'wknd-sherpa') return;
    if (event.data.type === 'ready' && loading) {
      clearTimeout(timeout);
      loading = false;
      ready = true;
      notice.hidden = true;
      frame.hidden = false;
    } else if (event.data.type === 'error' && loading) {
      showError('WKND Sherpa is unavailable right now. Please try again.');
    } else if (event.data.type === 'close') {
      dialog.close();
    }
  });
  launcher.addEventListener('click', () => {
    dialog.showModal();
    launcher.setAttribute('aria-expanded', 'true');
    initialize();
  });
  retry.addEventListener('click', initialize);
  wrapper.querySelector('.wknd-sherpa-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus({ preventScroll: true });
  });
}
