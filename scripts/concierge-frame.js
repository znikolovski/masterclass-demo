import { loadScript } from './aem.js';
import stylingConfigurations from './concierge-config.js';
import { WEB_SDK_CONFIG } from './martech-config.js';
import { isAeroUrl } from './journey-context.js';
import { prepareAeroUrl } from './journey-analytics.js';

function notify(type, detail = {}) {
  window.parent.postMessage({ source: 'wknd-sherpa', type, ...detail }, window.location.origin);
}

let aeroRequestId = 0;
const aeroRequests = new Map();
let lastMessageAttempt = 0;
function messageAttempt() {
  const now = Date.now();
  if (now - lastMessageAttempt < 250) return;
  lastMessageAttempt = now;
  notify('message-attempt');
}
function handleClick(event) {
  if (event.button > 1) return;
  const button = event.target.closest?.('#brand-concierge-mount button[aria-label="Send message"]');
  const input = document.querySelector('#brand-concierge-mount .chat-input');
  if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
    && input?.value.trim()) messageAttempt();
  const link = event.target.closest?.('#brand-concierge-mount a[href]');
  if (!link || !isAeroUrl(new URL(link.href))) return;
  link.href = prepareAeroUrl(link.href, 'wknd-sherpa');
  if (event.defaultPrevented) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    || (link.target && link.target !== '_self')) {
    notify('aero-link-opened', { url: link.href });
    return;
  }
  event.preventDefault();
  aeroRequestId += 1;
  const requestId = aeroRequestId;
  aeroRequests.set(requestId, link.href);
  notify('aero-link', { requestId, url: link.href });
  setTimeout(() => {
    if (!aeroRequests.delete(requestId)) return;
    // eslint-disable-next-line no-console
    console.error('WKND Sherpa flight handoff timed out.');
    const status = document.createElement('p');
    status.setAttribute('role', 'alert');
    status.textContent = 'Unable to open flight options. Please try the link again.';
    link.after(status);
  }, 4000);
}
document.addEventListener('click', handleClick, true);
document.addEventListener('auxclick', handleClick, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing
    && event.target.matches?.('#brand-concierge-mount .chat-input')
    && event.target.value.trim()) messageAttempt();
}, true);

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent
    || event.data?.source !== 'wknd-sherpa') return;
  if (event.data.type === 'aero-link-ready') {
    const original = aeroRequests.get(event.data.requestId);
    if (!original || typeof event.data.url !== 'string') return;
    const url = new URL(event.data.url);
    if (!isAeroUrl(url) || url.origin !== new URL(original).origin
      || url.pathname !== new URL(original).pathname) return;
    aeroRequests.delete(event.data.requestId);
    window.top.location.assign(url.href);
    return;
  }
  if (event.data.type !== 'prefill' || typeof event.data.prompt !== 'string') return;
  const { prompt, requestId } = event.data;
  const input = [...document.querySelectorAll('#brand-concierge-mount .chat-input')]
    .find((element) => element.getClientRects().length && !element.disabled);
  if (!input || input.readOnly) {
    notify('prefill-error', { requestId, message: 'WKND Sherpa is not ready for a new question. Please try the link again when it is ready.' });
    return;
  }
  if (input.maxLength >= 0 && prompt.length > input.maxLength) {
    notify('prefill-error', { requestId, message: `This question exceeds WKND Sherpa's ${input.maxLength}-character limit. Please use a shorter question.` });
    return;
  }
  input.value = prompt;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (event.data.focus) {
    input.focus({ preventScroll: true });
    input.setSelectionRange(prompt.length, prompt.length);
  }
  if (event.data.send === true) {
    const sendButton = document.querySelector('#brand-concierge-mount button[aria-label="Send message"]');
    if (!sendButton || sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true') {
      notify('prefill-error', { requestId, message: 'WKND Sherpa could not send this question automatically. The question is ready to edit or send when Sherpa is available.' });
      return;
    }
    sendButton.click();
  }
  notify('prefilled', { requestId });
});

async function initialize() {
  // A separate browsing context prevents Launch from replacing the Concierge SDK.
  const queue = [];
  window.__alloyNS = ['alloy']; // eslint-disable-line no-underscore-dangle
  window.alloy = (...args) => new Promise((resolve, reject) => {
    queue.push([resolve, reject, args]);
  });
  window.alloy.q = queue;
  await loadScript('https://cdn1.adoberesources.net/alloy/2.35.0/alloy.min.js');
  const { datastreamId, orgId } = WEB_SDK_CONFIG;
  await window.alloy('configure', {
    datastreamId,
    orgId,
    // Opening Sherpa opts into chat; saved Adobe consent still overrides this default.
    defaultConsent: 'in',
    edgeDomain: 'edge.adobedc.net',
    edgeBasePath: 'ee',
    debugEnabled: window.location.hostname === 'localhost',
    idMigrationEnabled: false,
    thirdPartyCookiesEnabled: false,
    conversation: { stickyConversationSession: false, region: 'aus5' },
  });
  // The vendor continues bootstrap even when getIdentity returns {} after an opt-out.
  const { identity } = await window.alloy('getIdentity', { namespaces: ['ECID'] });
  if (!identity?.ECID) {
    const error = new Error('The SDK did not provide a chat identity. Check consent settings.');
    error.code = 'identityUnavailable';
    throw error;
  }
  await loadScript('https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js');
  if (typeof window.adobe?.concierge?.bootstrap !== 'function') {
    throw new Error('The Brand Concierge client is not available.');
  }
  await window.adobe.concierge.bootstrap({
    instanceName: 'alloy',
    stylingConfigurations,
    selector: '#brand-concierge-mount',
    stickySession: false,
  });
  // The vendor catches bootstrap errors internally; verify that it actually rendered.
  if (!document.querySelector('#brand-concierge-mount .brand-concierge-container')) {
    throw new Error('The Brand Concierge interface did not initialize.');
  }
  notify('ready');
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.defaultPrevented) notify('close');
});

initialize().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('WKND Sherpa initialization failed:', error);
  notify('error', { reason: error?.code });
});
