export const CUSTOMER_IDENTITY_CONFIG = { namespace: 'wkndCustomerId', auth0SubjectApproved: true };
let customerId;
let revision = 0;

export function updateCustomerIdentity(profile) {
  revision += 1;
  const { namespace, auth0SubjectApproved } = CUSTOMER_IDENTITY_CONFIG;
  customerId = auth0SubjectApproved && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(namespace)
    && typeof profile?.sub === 'string' && profile.sub.length > 0 && profile.sub.length <= 256
    ? profile.sub : undefined;
}

export async function restoreCustomerIdentity(getProfile) {
  const started = revision;
  try {
    const profile = await getProfile();
    if (revision === started) updateCustomerIdentity(profile);
    return profile;
  } catch (error) {
    if (revision === started) updateCustomerIdentity(null);
    throw error;
  }
}

export function applyCustomerIdentity(content) {
  if (!customerId) return;
  content.xdm ||= {};
  content.xdm.identityMap ||= {};
  content.xdm.identityMap[CUSTOMER_IDENTITY_CONFIG.namespace] = [{
    id: customerId, authenticatedState: 'authenticated', primary: true,
  }];
}
