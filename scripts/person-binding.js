const ENDPOINT = 'https://28538-wkndcommerce.adobeioruntime.net/api/v1/web/commerce/target-diagnostic';
const VERSION = 'wknd.person-binding/v1';
const FRESHNESS_MS = 300000;
const OPERATIONS = new Set(['person-binding', 'person-status', 'person-withdrawal']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let binding;
let revision = 0;

export function clearPersonBinding() {
  revision += 1;
  binding = undefined;
}

export function getPersonBinding(now = Date.now()) {
  if (binding && (now < Date.parse(binding.issuedAt) || now >= Date.parse(binding.expiresAt))) {
    clearPersonBinding();
  }
  return binding;
}

export function validatePersonBindingResponse(result, operation, now = Date.now()) {
  if (!OPERATIONS.has(operation) || !result || Array.isArray(result)
    || result.apiVersion !== VERSION || result.purpose !== 'idLinkage'
    || result.environment !== 'production'
    || result.evidence !== false || result.financialAuthorization !== false
    || result.status !== 'ok' || !Array.isArray(result.semanticAllowlist)
    || result.semanticAllowlist.length !== 0) {
    throw new Error('The identity service returned an unexpected contract.');
  }
  if (operation === 'person-withdrawal') {
    if (result.consent !== 'withdrawn' || result.binding !== null
      || typeof result.changed !== 'boolean' || result.revoked !== true
      || result.upstreamDeletionConfirmed !== false) {
      throw new Error('The identity service did not confirm withdrawal.');
    }
    return result;
  }
  if (['absent', 'withdrawn'].includes(result.consent) && result.binding === null) return result;
  const receipt = result.binding;
  const issued = Date.parse(receipt?.issuedAt);
  const expires = Date.parse(receipt?.expiresAt);
  if (result.consent !== 'granted' || !receipt || Array.isArray(receipt)
    || receipt.source !== 'server-issued' || receipt.purpose !== 'idLinkage'
    || !/^wpa_[0-9a-f]{32}$/.test(receipt.personAlias)
    || receipt.environment !== 'production' || receipt.runtimeNamespace !== '28538-wkndcommerce'
    || receipt.orgId !== '28260E2056581D3B7F000101@AdobeOrg' || receipt.dpid !== '1547309'
    || receipt.namespace !== 'wkndCustomerId' || receipt.issuer !== ENDPOINT
    || !UUID.test(receipt.consentGeneration) || receipt.freshnessMs !== FRESHNESS_MS
    || typeof receipt.issuedAt !== 'string' || typeof receipt.expiresAt !== 'string'
    || !Number.isFinite(issued) || !Number.isFinite(expires)
    || new Date(issued).toISOString() !== receipt.issuedAt
    || new Date(expires).toISOString() !== receipt.expiresAt
    || expires - issued !== FRESHNESS_MS || issued > now || expires <= now) {
    throw new Error('The identity service returned an invalid or expired binding.');
  }
  return result;
}

export async function requestPersonBinding(operation, {
  getToken, fetchImpl = fetch, now = Date.now,
} = {}) {
  if (!OPERATIONS.has(operation) || typeof getToken !== 'function') {
    throw new Error('A supported identity operation and shopper authentication are required.');
  }
  clearPersonBinding();
  const started = revision;
  const token = await getToken();
  if (typeof token !== 'string' || !token) throw new Error('Sign in to confirm identity linking.');
  if (started !== revision) throw new Error('The identity request was invalidated. Reload its status.');
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ op: operation }),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error('Identity linking is unavailable. Reload its status before trying again.');
  }
  const result = validatePersonBindingResponse(await response.json(), operation, now());
  if (started !== revision) throw new Error('The identity request was invalidated. Reload its status.');
  if (result.binding) binding = Object.freeze({ ...result.binding });
  return result;
}
