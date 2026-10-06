import { loadScript } from './aem.js';
import stylingConfigurations from './concierge-config.js';
import { WEB_SDK_CONFIG } from './martech-config.js';

function notify(type) {
  window.parent.postMessage({ source: 'wknd-sherpa', type }, window.location.origin);
}

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
    defaultConsent: 'pending',
    edgeDomain: 'edge.adobedc.net',
    edgeBasePath: 'ee',
    debugEnabled: window.location.hostname === 'localhost',
    idMigrationEnabled: false,
    thirdPartyCookiesEnabled: false,
    conversation: { stickyConversationSession: false, region: 'aus5' },
  });
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
  notify('error');
});
