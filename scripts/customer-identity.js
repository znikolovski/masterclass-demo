import { clearPersonBinding, getPersonBinding } from './person-binding.js';

// The alias collection adapter is not released; signing in is not a linkage grant.
export const CUSTOMER_IDENTITY_CONFIG = Object.freeze({
  namespace: 'wkndCustomerId', serverBindingEnabled: false,
});
let revision = 0;

export function updateCustomerIdentity() {
  revision += 1;
  clearPersonBinding();
}

export async function restoreCustomerIdentity(getProfile, getStatus) {
  const started = revision;
  try {
    const profile = await getProfile();
    if (revision === started) {
      updateCustomerIdentity();
      if (profile && CUSTOMER_IDENTITY_CONFIG.serverBindingEnabled && getStatus) {
        try {
          await getStatus();
        } catch {
          clearPersonBinding();
          // eslint-disable-next-line no-console
          console.warn('WKND identity linking is unavailable; account sign-in is unchanged.');
        }
      }
    }
    return profile;
  } catch (error) {
    if (revision === started) updateCustomerIdentity(null);
    throw error;
  }
}

export function applyCustomerIdentity(content) {
  delete content.xdm?.identityMap?.[CUSTOMER_IDENTITY_CONFIG.namespace];
  if (!CUSTOMER_IDENTITY_CONFIG.serverBindingEnabled) return;
  const receipt = getPersonBinding();
  if (!receipt) return;
  content.xdm ||= {};
  content.xdm.identityMap ||= {};
  content.xdm.identityMap[CUSTOMER_IDENTITY_CONFIG.namespace] = [{
    id: receipt.personAlias, authenticatedState: 'authenticated', primary: true,
  }];
}
