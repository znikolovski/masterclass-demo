/**
 * The iOS app installs this bounded context before document scripts execute.
 * Standalone browsers retain the existing website consent and identity policy.
 */
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
  if (!context) return true;
  if (!context.collect) return false;
  const { identity } = context;
  if (identity && typeof identity.namespace === 'string' && typeof identity.id === 'string'
    && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(identity.namespace)
    && identity.id.length > 0 && identity.id.length <= 256) {
    content.xdm ||= {};
    content.xdm.identityMap ||= {};
    content.xdm.identityMap[identity.namespace] = [{
      id: identity.id, authenticatedState: 'authenticated', primary: true,
    }];
  }
  return true;
}
