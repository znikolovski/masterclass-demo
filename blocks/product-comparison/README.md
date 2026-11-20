# Product comparison

An API-driven block used by product-first OF1 results. Commerce remains the source of
product details, prices, imagery, options and availability; do not author copies of them.
This generated-result block is not registered in the author block library.

## Content model

| Product comparison | |
|---|---|
| skus | WKND-JKT-001,WKND-JKT-003 |
| heading | Compare your gear |
| max-price | 500 |

- `skus`: up to three distinct parent/simple product SKUs, comma-separated. An empty
  list renders a no-match message. Invalid identities or more than three show an error.
- `heading`: optional; defaults to “Your gear” or “Compare your gear”.
- `max-price`: optional non-negative AUD amount, inclusive. For “under $300”, discovery
  supplies `299.99`. It gates the **selected variant**, not just the parent minimum.

Configuration uses two cells per row because the content is fetched, not authored.
One product renders without a comparison table. Missing catalog facts are labelled
“Not specified”; wholly missing comparison rows are omitted.

Shoppers select all required options inline before adding a configurable product.
The existing cart drop-in handles the cart mutation and its successful-add analytics.
Failures are displayed; uncertain writes are never automatically repeated.

## Presentation

The comparison uses the shop's Syncopate headings, dark-green introduction, orange
accents and pill buttons in a bounded 1200px layout. Compact image frames contain
rather than crop product photography. Cards show up to two available catalog
specifications, with labelled inline options and aligned purchase actions.
The comparison shortcut scrolls to and focuses the semantic specification table;
reduced-motion preferences are respected. On narrow screens the table scrolls
locally, without widening the page. A single result uses a split image/content
layout on tablet and desktop.

Local fixture: `/drafts/of1-products`. Start AEM with `--html-folder drafts`.
The end-to-end test uses the real OF1 SDK, gateway and drop-ins with an isolated
in-memory backend, never a live cart:

```sh
node tools/scripts/test-of1-products.mjs http://localhost:3001
```

The test requires the sibling `wknd-commerce` and `wknd-automation` workspaces.
