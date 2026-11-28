# Product Kit: products with add-all

The Product Kit block displays catalog images, names and current prices with one
**Add all to cart** button. It uses the existing Commerce catalog and cart SDK;
SKU-list mode does not require the unreleased promotion-kit backend API.

## Authoring

Place your heading and introduction above this one-column block. Each row is a SKU:

| Product Kit |
| --- |
| WKND-PNT-002 |
| WKND-TRV-007 |

The Commerce extension can insert multiple selected products using these repeated
SKU rows. A two-column configuration with a SKU list is also supported:

| Product Kit | |
| --- | --- |
| skus | WKND-PNT-002, WKND-TRV-007 |

Separate SKUs with commas or whitespace. Duplicate SKUs are displayed once.
An unknown SKU produces an explicit error rather than adding an incomplete set.
Names, prices and images are fetched, not copied into the document.

Configurable parents such as `WKND-PNT-002` show option selectors. Shoppers must
choose every required option and an in-stock variant before adding. The block
adds one of each selected product, including one more when that exact variant is
already in the cart. A successful addition disables the button to prevent accidental
repeat additions; reload the page to intentionally add another set.

Discounts, tax and shipping remain backend-authoritative. The block grants no
audience membership, coupon or discount. Failed or partial additions display an
alert and require reviewing the cart before retrying.

## Experience Workspace Commerce extension

Select products in the Commerce extension, choose **Product kit (add all)**, then
insert them into your document. The extension combines selected SKUs into one
Product Kit block using the repeated-row format above.

The site configuration sheet `commerce-templates` contains this format:

```html
<div class="product-kit"><div><div>{{sku}}</div></div></div>
```

Use `{{sku}}`, not `{{skus}}`: the extension repeats the row for each selected
product. Existing site formats and customizations are preserved. Browser-local
format overrides take precedence; if this format is missing there, add it to your
override or intentionally restore the site formats.

Registering the format does not deploy storefront code. Deploy the block before
publishing pages that use it; SKU-list mode needs no additional backend release.

## Promotion mode

Alternatively, author `promotion-id` instead of `skus`:

| Product Kit | |
| --- | --- |
| promotion-id | prm_252c7a623a5a0e42ac91e565a5d04d8c |

This mode requires the separately deployed `wkndPromotionKits` backend query.
It retains the existing **Add remaining products** behavior: variants already in
the cart count against their targeted parents and are not added again.
Do not combine `skus` and `promotion-id`. A validated `?promotion=` URL parameter
can supply the ID when neither field is authored.

## Acceptance and validation

- Render every requested product in authored order, with catalog images/prices.
- Require complete, in-stock configurable choices; never submit a parent SKU.
- Submit one multi-product SDK addition and verify actual quantity increments.
- Allow new guests without a cached cart; preserve fresh reads for existing carts.
- Prevent repeated clicks and report catalog, stock, read/write and partial errors.
- Preserve promotion-kit behavior; do not depend on it for SKU lists.
- Keep keyboard controls usable and avoid overflow at 375, 768 and 1280 pixels.

Local content: `drafts/shop/product-set.plain.html`.
The browser fixture uses an in-memory Commerce store and real cart SDK, never
mutating deployed customer carts.

Set `WKND_COMMERCE_TEST_ROOT` to a local `wknd-commerce` backend checkout that
includes the promotion-kit query for its compatibility test, then run:

```sh
node --test tools/tests/product-set-browser.test.mjs tools/scripts/test-commerce-catalog.mjs
```

For a local preview at `/shop/product-set`, mount the draft content at `/`:

```sh
aem up --port 3002 --no-stop-other --html-folder drafts --html-mount / --no-open
```
