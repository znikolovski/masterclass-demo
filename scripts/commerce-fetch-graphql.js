// eslint-disable-next-line import/no-unresolved -- Bypass this module's import-map entry.
import { FetchGraphQL as NativeFetchGraphQL } from './__dropins__/tools/fetch-graphql.js?native';
import installCartQuoteBatch from './cart-quote-batch.js';

// eslint-disable-next-line import/no-unresolved -- Preserve other public SDK exports.
export * from './__dropins__/tools/fetch-graphql.js?native';

let cartDependencies;
const adapters = new WeakMap();
const invalidators = new Set();

/** Enables quote batching only after the cart page has mounted its status UI. */
export function enableCartQuoteBatch(dependencies) {
  cartDependencies = dependencies;
}

export function invalidateCartQuoteBatch() {
  invalidators.forEach((invalidate) => invalidate());
}

/** Linked SDK clients bind this public method when obtaining their transport methods. */
export class FetchGraphQL extends NativeFetchGraphQL {
  async fetchGraphQl(query, options) {
    if (!cartDependencies) return super.fetchGraphQl(query, options);
    let adapter = adapters.get(this);
    if (!adapter) {
      const transport = { fetchGraphQl: (...args) => super.fetchGraphQl(...args) };
      installCartQuoteBatch(transport, {
        ...cartDependencies,
        getRequestContext: () => ({
          endpoint: this.endpoint, headers: this.fetchGraphQlHeaders,
        }),
        registerInvalidation: (invalidate) => { invalidators.add(invalidate); },
      });
      adapter = transport.fetchGraphQl;
      adapters.set(this, adapter);
    }
    return adapter(query, options);
  }
}
