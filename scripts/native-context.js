/**
 * The iOS app installs this bounded context before document scripts execute.
 * Standalone browsers retain the existing website consent and identity policy.
 */
import { applyCustomerIdentity, CUSTOMER_IDENTITY_CONFIG } from './customer-identity.js';
import { validatePersonBindingResponse } from './person-binding.js';

export function getNativeContext() {
  if (typeof window === 'undefined'
    || window.location.origin !== 'https://wknd-adventures.run.place') return null;
  const context = window.wkndNativeContext;
  if (!context || typeof context.collect !== 'boolean'
    || typeof context.personalize !== 'boolean') return null;
  return context;
}

export function applyNativeContext(content) {
  const context = getNativeContext();
  if (!context) {
    if (typeof window !== 'undefined'
      && window.location.origin === 'https://wknd-adventures.run.place'
      && window.wkndNativeContext != null) {
      delete content.xdm?.identityMap?.wkndCustomerId;
      console.warn('Native privacy context is invalid; collection is disabled.'); // eslint-disable-line no-console
      return false;
    }
    applyCustomerIdentity(content);
    return true;
  }
  if (!context.collect) return false;
  // Legacy identity context carries neither a verified server alias nor a linkage grant.
  delete content.xdm?.identityMap?.wkndCustomerId;
  if (!CUSTOMER_IDENTITY_CONFIG.serverBindingEnabled || !context.personalize
    || context.personBinding == null) return true;
  try {
    const result = validatePersonBindingResponse(context.personBinding, 'person-status');
    if (result.consent !== 'granted') throw new Error('Native binding is not granted.');
    content.xdm ||= {};
    content.xdm.identityMap ||= {};
    content.xdm.identityMap.wkndCustomerId = [{
      id: result.binding.personAlias, authenticatedState: 'authenticated', primary: true,
    }];
  } catch {
    console.warn('Native identity linking is unavailable; collection consent is unchanged.'); // eslint-disable-line no-console
  }
  return true;
}
