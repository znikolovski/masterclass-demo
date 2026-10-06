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
  let pendingRequest;
  let requestId = 0;

  function readDeepLink(url) {
    if (url.hash !== '#sherpa' && !url.hash.startsWith('#sherpa?')) return null;
    const params = new URLSearchParams(url.hash.slice(8));
    return { prompt: params.get('prompt')?.trim() || undefined, send: params.get('send') === 'true' };
  }

  function prefill() {
    if (!ready || !pendingRequest || pendingRequest.delivered) return;
    pendingRequest.delivered = true;
    frame.contentWindow.postMessage({
      source: 'wknd-sherpa',
      type: 'prefill',
      requestId: pendingRequest.id,
      prompt: pendingRequest.prompt,
      send: pendingRequest.send,
      focus: dialog.open,
    }, window.location.origin);
  }

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

  function openConcierge(prompt, send = false) {
    if (prompt !== undefined) {
      requestId += 1;
      pendingRequest = { id: requestId, prompt, send };
    }
    if (!dialog.open) dialog.showModal();
    launcher.setAttribute('aria-expanded', 'true');
    initialize();
    prefill();
  }

  function openFromHash() {
    const link = readDeepLink(new URL(window.location.href));
    if (link) openConcierge(link.prompt, link.send);
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
      prefill();
    } else if (event.data.type === 'error' && loading) {
      showError('WKND Sherpa is unavailable right now. Please try again.');
    } else if (event.data.type === 'prefilled' && pendingRequest
      && event.data.requestId === pendingRequest.id) {
      pendingRequest = undefined;
      notice.hidden = true;
    } else if (event.data.type === 'prefill-error' && pendingRequest
      && event.data.requestId === pendingRequest.id) {
      pendingRequest = undefined;
      notice.hidden = false;
      status.textContent = event.data.message;
      retry.hidden = true;
    } else if (event.data.type === 'close') {
      dialog.close();
    }
  });
  launcher.addEventListener('click', () => openConcierge());
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download')
      || (anchor.target && anchor.target !== '_self')) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname
      || url.search !== window.location.search) return;
    const link = readDeepLink(url);
    if (!link) return;
    event.preventDefault();
    if (url.hash !== window.location.hash) window.history.pushState(null, '', url);
    openConcierge(link.prompt, link.send);
  });
  window.addEventListener('hashchange', openFromHash);
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
  openFromHash();
}
