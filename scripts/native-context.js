/**
 * The iOS app installs this bounded context before document scripts execute.
 * Standalone browsers retain the existing website consent and identity policy.
 */
import { applyCustomerIdentity } from './customer-identity.js';

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
    applyCustomerIdentity(content);
    return true;
  }
  if (!context.collect) return false;
  // Legacy identity context carries neither a verified server alias nor a linkage grant.
  delete content.xdm?.identityMap?.wkndCustomerId;
  return true;
}
