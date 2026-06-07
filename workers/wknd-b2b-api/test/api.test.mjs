import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('wknd-b2b-api contract', () => {
  it('exports fetch handler', async () => {
    const mod = await import('../src/index.js');
    assert.equal(typeof mod.default.fetch, 'function');
  });
});
