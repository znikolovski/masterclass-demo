import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFormSubmission, FORM_SCHEMAS } from '../src/forms.js';

describe('wknd form submissions', () => {
  it('defines all three WKND forms', () => {
    assert.ok(FORM_SCHEMAS['wknd-contact-b2b']);
    assert.ok(FORM_SCHEMAS['wknd-adventure-interest']);
    assert.ok(FORM_SCHEMAS['wknd-adventure-interest-b2b']);
  });

  it('validates contact b2b payload', () => {
    const result = validateFormSubmission('wknd-contact-b2b', {
      company: 'Acme',
      contactName: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello',
    });
    assert.equal(result.ok, true);
    assert.equal(result.site, 'wknd-business');
  });

  it('rejects missing required fields', () => {
    const result = validateFormSubmission('wknd-adventure-interest', {
      name: 'Sam',
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('Email')));
  });

  it('rejects unknown form slug', () => {
    const result = validateFormSubmission('unknown-form', { name: 'x' });
    assert.equal(result.ok, false);
  });
});
