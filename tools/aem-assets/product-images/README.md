# WKND shop product imagery

Product images come from **AEM Assets** and are delivered to the storefront **only through
Dynamic Media with OpenAPI** (`https://delivery-p115476-e1135027.adobeaemcloud.com/adobe/assets/{urn}`).
They are never served from AEM publish or the Edge Delivery media bus.

## 1. Generate prompts

```bash
npm run shop:image-prompts
```

This writes `image-prompts.csv` and `image-prompts.json`, one row per image.

| Tier | Images | What it gives you |
|------|--------|-------------------|
| `essential` | 99 | One studio hero per product. It is linked to the parent product and its first colour's variants. |
| `standard` | +204 (303 total) | Adds a hero per extra colour, used as variant and swatch images, plus one lifestyle shot per product. |

Start with **essential**. The storefront is complete with it, and colours without their own image fall back to the parent product's images.

## 2. Generate in Adobe Firefly

For each row:

1. In [Firefly](https://firefly.adobe.com) → **Text to image**, pick the **Gemini (Nano Banana)** partner model.
2. Set **Content type** to **Photo** and the aspect ratio to **4:5** (portrait).
3. Paste `prompt`. Add `negativePrompt` under *Exclude* if the model supports it.
4. Download the best result as JPG and save it as:

```
tools/aem-assets/product-images/drop/<parentSku>/<filename>
```

Use the `filename` from the CSV exactly, for example `drop/WKND-JKT-001/WKND-JKT-001__ember__1.jpg`.
The `drop/` folder is git-ignored.

## 3. Upload and link

```bash
export AEM_ACCESS_TOKEN="<bearer token from an AEM author session (DevTools → Network)>"
npm run shop:upload-images -- --dry-run      # check the mapping first
npm run shop:upload-images                   # upload, set metadata, approve
npm run shop:upload-images -- --only=WKND-JKT-001 --replace
```

For every image, the script:

- creates `/content/dam/wknd-adventures/products/<category>/<SKU>/`
- uploads the image
- sets the Adobe Commerce linking metadata: `commerce:isCommerce=yes`, `commerce:skus`, `commerce:roles` and `commerce:positions`
- sets `dc:description` (the alt text) and `dam:status=approved`

**Prerequisite:** the `commerce:` metadata namespace and form fields from the `assets-commerce` package must be installed on author.

Approved assets are picked up automatically:

- The `wknd-commerce` **asset-events** action (I/O Events: `metadata_updated` and `ready_for_delivery`) runs the custom matcher and updates the product gallery. It then re-renders the affected product pages.
- The nightly **reconcile** action repairs anything that was missed. To re-run linking for one product now, use **Admin UI → Product → Images → Re-run AEM matching**.

## Linking rules (for manual uploads)

| Rule | Example | Links to |
|------|---------|----------|
| Explicit metadata | `commerce:skus = WKND-PCK-001` | The listed SKUs |
| Folder | `…/products/accessories/packs/WKND-PCK-001/any.jpg` | `WKND-PCK-001` |
| Colour filename | `WKND-JKT-001__glacier__1.jpg` | All Glacier Blue variants, with the `swatch_image` role |
