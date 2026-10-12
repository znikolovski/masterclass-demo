import { registerHooks } from 'node:module';

export default async function loadTestAeroWorker() {
  // Wrangler bundles JSON imports; Node 24 requires an explicit import attribute.
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      return specifier.endsWith('.json')
        ? { ...result, importAttributes: { type: 'json' } } : result;
    },
  });
  try {
    // eslint-disable-next-line import/no-relative-packages -- test the actual Worker entry point
    const { default: worker } = await import('../../../workers/wknd-aero-api/src/index.js');
    return worker;
  } finally {
    hooks.deregister();
  }
}
