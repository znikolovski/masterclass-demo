import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../../scripts/person-binding.js', import.meta.url), 'utf8');
const {
  clearPersonBinding, getPersonBinding, requestPersonBinding, validatePersonBindingResponse,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const now = Date.parse('2026-11-24T00:00:00.000Z');
const endpoint = 'https://28538-wkndcommerce.adobeioruntime.net/api/v1/web/commerce/target-diagnostic';

function receipt() {
  return {
    apiVersion: 'wknd.person-binding/v1',
    purpose: 'idLinkage',
    status: 'ok',
    consent: 'granted',
    environment: 'production',
    evidence: false,
    financialAuthorization: false,
    semanticAllowlist: [],
    binding: {
      source: 'server-issued',
      purpose: 'idLinkage',
      personAlias: `wpa_${'a'.repeat(32)}`,
      environment: 'production',
      runtimeNamespace: '28538-wkndcommerce',
      orgId: '28260E2056581D3B7F000101@AdobeOrg',
      dpid: '1547309',
      namespace: 'wkndCustomerId',
      issuer: endpoint,
      consentGeneration: '12345678-1234-4234-8234-123456789012',
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 300000).toISOString(),
      freshnessMs: 300000,
    },
  };
}

function options(result = receipt()) {
  return {
    getToken: async () => 'test-shopper-bearer',
    now: () => now,
    fetchImpl: async () => ({ ok: true, json: async () => result }),
  };
}

test('binding and read-only status send only frozen operations with direct shopper authentication', async () => {
  async function verify(operation) {
    let calls = 0;
    const opts = options();
    opts.fetchImpl = async (url, request) => {
      calls += 1;
      assert.equal(url, endpoint);
      assert.deepEqual(JSON.parse(request.body), { op: operation });
      assert.deepEqual(request.headers, {
        'Content-Type': 'application/json', Authorization: 'Bearer test-shopper-bearer',
      });
      assert.equal(request.credentials, 'omit');
      assert.equal(request.redirect, 'error');
      assert.equal(request.cache, 'no-store');
      return { ok: true, json: async () => receipt() };
    };
    await requestPersonBinding(operation, opts);
    assert.equal(calls, 1);
    assert.equal(getPersonBinding(now).personAlias, receipt().binding.personAlias);
    assert.equal(getPersonBinding(now + 299999).personAlias, receipt().binding.personAlias);
    assert.equal(getPersonBinding(now + 300000), undefined);
  }
  await verify('person-binding');
  await verify('person-status');
});

test('scope, generation, exact freshness and non-semantic contract are enforced', () => {
  const invalid = [
    { purpose: undefined },
    { purpose: 'email' },
    { environment: 'stage' },
    { evidence: true },
    { financialAuthorization: true },
    { semanticAllowlist: ['unapproved-event'] },
    { binding: { ...receipt().binding, personAlias: 'raw-auth0-sub' } },
    { binding: { ...receipt().binding, purpose: undefined } },
    { binding: { ...receipt().binding, purpose: 'email' } },
    { binding: { ...receipt().binding, runtimeNamespace: '28538-wkndcommerce-stage' } },
    { binding: { ...receipt().binding, orgId: 'other-org' } },
    { binding: { ...receipt().binding, dpid: 1547309 } },
    { binding: { ...receipt().binding, namespace: 'ECID' } },
    { binding: { ...receipt().binding, issuer: 'https://unapproved.example.invalid' } },
    { binding: { ...receipt().binding, consentGeneration: 'unverified-generation' } },
    { binding: { ...receipt().binding, freshnessMs: 300001 } },
    { binding: { ...receipt().binding, issuedAt: new Date(now + 1).toISOString() } },
    { binding: { ...receipt().binding, expiresAt: new Date(now + 299999).toISOString() } },
  ];
  invalid.forEach((change) => {
    assert.throws(() => validatePersonBindingResponse({ ...receipt(), ...change }, 'person-status', now));
  });
  assert.throws(() => validatePersonBindingResponse(receipt(), 'person-status', now + 300000));
});

test('absence, withdrawal and failures clear identity without upstream removal claims', async () => {
  async function verifyAbsence(consent) {
    await requestPersonBinding('person-binding', options());
    await requestPersonBinding('person-status', options({ ...receipt(), consent, binding: null }));
    assert.equal(getPersonBinding(now), undefined);
  }
  await verifyAbsence('absent');
  await verifyAbsence('withdrawn');
  const withdrawn = {
    ...receipt(),
    consent: 'withdrawn',
    binding: null,
    changed: false,
    revoked: true,
    upstreamDeletionConfirmed: false,
  };
  await requestPersonBinding('person-binding', options());
  await requestPersonBinding('person-withdrawal', options(withdrawn));
  assert.equal(getPersonBinding(now), undefined);
  assert.throws(() => validatePersonBindingResponse({
    ...withdrawn, upstreamDeletionConfirmed: true,
  }, 'person-withdrawal', now));
  await requestPersonBinding('person-binding', options());
  await assert.rejects(requestPersonBinding('person-status', {
    ...options(),
    fetchImpl: async () => ({ ok: false, json: async () => { throw new Error('Private response must not be read'); } }),
  }), /unavailable/);
  assert.equal(getPersonBinding(now), undefined);
});

test('logout or withdrawal invalidates pending token and response work', async () => {
  let releaseToken;
  let sent = false;
  const pendingToken = requestPersonBinding('person-status', {
    ...options(),
    getToken: () => new Promise((resolve) => { releaseToken = resolve; }),
    fetchImpl: async () => { sent = true; },
  });
  clearPersonBinding();
  releaseToken('test-shopper-bearer');
  await assert.rejects(pendingToken, /invalidated/);
  assert.equal(sent, false);

  let releaseResponse;
  const pendingResponse = requestPersonBinding('person-status', {
    ...options(),
    fetchImpl: () => new Promise((resolve) => { releaseResponse = resolve; }),
  });
  await new Promise(setImmediate);
  clearPersonBinding();
  releaseResponse({ ok: true, json: async () => receipt() });
  await assert.rejects(pendingResponse, /invalidated/);
  assert.equal(getPersonBinding(now), undefined);
});
