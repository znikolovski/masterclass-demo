# AEM Assets setup — WKND Adventures

Create the DAM folder structure and **Metadata Forms** in the **new Assets View** (not the legacy Admin UI at Tools → Assets → Metadata Schemas).

Related: [ASSET-ANALYTICS-PLAN.md](./ASSET-ANALYTICS-PLAN.md), [metadata spec](../tools/aem-assets/wknd-adventures-metadata-form.spec.json).

| Item | Value |
|------|-------|
| AEM author | `https://author-p115476-e1135027.adobeaemcloud.com` |
| Asset Selector repo | `author-p115476-e1135027.adobeaemcloud.com` |
| Root DAM path | `/content/dam/wknd-adventures` |

---

## 1. DAM folder structure

### Option A — Script (recommended)

```bash
# Obtain AEM_ACCESS_TOKEN: log into AEM author, open DevTools → Network,
# copy Authorization Bearer from any /api/assets request.

export AEM_ACCESS_TOKEN="<your-bearer-token>"
node tools/aem-assets/setup-wknd-dam.mjs
```

Dry run:

```bash
node tools/aem-assets/setup-wknd-dam.mjs --dry-run
```

### Option B — Assets View UI

1. Open [AEM author](https://author-p115476-e1135027.adobeaemcloud.com) → **Assets** (new UI).
2. Navigate to **Files** → **content** → **dam**.
3. **Create folder** → `wknd-adventures`.
4. Inside `wknd-adventures`, create:

| Folder | Purpose |
|--------|---------|
| `heroes` | Full-bleed hero backgrounds |
| `adventures` | Destination / adventure imagery |
| `activities` | Activity-specific photos |
| `magazine` | Magazine editorial |
| `blog` | Blog inline and hero images |
| `contributors` | Author portraits |

---

## 2. Metadata form (Assets View)

Use **Settings → Metadata Forms** in the Assets View left rail — **not** Tools → Assets → Metadata Schemas.

Reference: [Metadata in Assets View](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/assets-view/metadata-assets-view).

### 2.1 Create the form

1. Assets View → **Settings** → **Metadata Forms** → **Create**.
2. **Type:** `File`.
3. **Name:** `WKND Adventures — Image` (or `image` for automatic MIME matching on all image uploads).
4. Add a tab named **WKND**.
5. Drag components from the left rail and configure **Settings** (property mapping) per table below.

| Label | Component | Metadata property | Required |
|-------|-----------|-------------------|----------|
| Title | Single-line text | `dc:title` | Yes |
| Description | Multi-line text | `dc:description` | No |
| Adventure category | Drop-down | `wknd:adventureCategory` | No |
| Content usage | **Multi-select** dropdown | `wknd:contentUsage` | No |
| Alt text | Single-line text | `wknd:altText` | No |
| Asset status | Asset Status | `dam:assetStatus` | Yes |
| Keywords | Keywords | `dc:subject` | No |

**Adventure category** choices (static dropdown — Assets View does not support dynamic/JSON-backed dropdowns):

| Label | Value |
|-------|-------|
| Climbing | `climbing` |
| Trekking & hiking | `trekking` |
| Winter & alpine | `winter-alpine` |
| Cycling | `cycling` |
| Water | `water` |
| Desert | `desert` |
| Photography & story | `photography` |
| General outdoor | `general-outdoor` |

**Content usage** choices (multi-select — an asset can have several):

| Label | Value |
|-------|-------|
| Hero | `hero` |
| Card / teaser | `card` |
| Gallery | `gallery` |
| Blog inline | `blog` |
| Magazine | `magazine` |
| Contributor portrait | `contributor` |
| Icon / UI | `ui` |

When setting via API or `npm run migrate:metadata`, **`wknd:contentUsage` must be a JSON array of value strings**, not a single string:

```json
"wknd:contentUsage": ["blog", "card"]
```

A single value is still an array: `["blog"]`. Sending `"blog"` as a string will not populate the multi-select field in Assets View.

6. **Save** the form.

> **Assets View constraints:** Use only supported components (single/multi-line text, static dropdown, date, tags, keywords, asset status). Do not use legacy Admin View components (`metadataselect`, JSON-path dropdowns, or advanced multi-select) — they block import and may not render. See [KA-27535](https://experienceleague.adobe.com/en/docs/experience-cloud-kcs/kbarticles/ka-27535).

### 2.2 Register the `wknd` namespace (required for custom fields)

Assets View dropdowns (`wknd:adventureCategory`, `wknd:contentUsage`) only persist and display when the **`wknd` JCR namespace** is registered on the AEM program. Without this, `dc:title` may update but WKND tab fields stay empty after API upload.

In your **AEM Cloud Service** codebase (`ui.config`), add:

`ui.config/src/main/content/jcr_root/apps/wknd-adventures/osgiconfig/config/org.apache.sling.jcr.repoinit.RepositoryInitializer~wknd-adventures-namespaces.cfg.json`

```json
{
  "scripts": [
    "register namespace (wknd) https://site.wknd/1.0"
  ]
}
```

Deploy via Cloud Manager. Reference: [Custom namespaces](https://experienceleague.adobe.com/en/docs/experience-manager-learn/cloud-service/developing/advanced/custom-namespaces).

Confirm the metadata form field **property** is exactly `wknd:contentUsage` (not `contentUsage` without the prefix).

### 2.3 Assign form to the DAM root

Folder assignment overrides MIME-based auto-apply for that folder tree.

1. **Settings** → **Metadata Forms** → select **WKND Adventures — Image**.
2. Click **Assign to Folder**.
3. Select `/content/dam/wknd-adventures` (applies to all subfolders).
4. Click **Assign**.

Alternative: open the `wknd-adventures` folder → folder properties (right pane) → **Metadata Forms** → assign the form.

### 2.4 Verify

1. Upload a test image to `/content/dam/wknd-adventures/heroes`.
2. Open asset **Details** → confirm **WKND** tab fields appear.
3. Set **Asset status** to **Approved**.
4. Publish to Dynamic Media; confirm the asset appears in the DA **AEM Assets** library with a delivery URL.

---

## 3. Field alignment

| Asset metadata | Page / analytics | Notes |
|----------------|------------------|-------|
| `wknd:adventureCategory` | UE `adventureCategory` → Analytics **eVar4** | Same value list as `component-models.json` |
| `dc:title` | Alt fallback, search | Used when authors omit alt in DA |
| `dam:assetStatus` | DM delivery | Must be **Approved** for Asset Selector `copyMode: reference` |
| Asset path / DM URL | **eVar6** (asset ID) | Derived at runtime in `scripts/media.js` |

---

## 4. Permissions (optional)

Non-admin DAM users need read access to metadata form definitions:

- `/conf/global/settings/dam/adminui-extension/metadataschema` (legacy schemas, if imported)
- Assets View forms are managed in the Assets View service; ensure contributors have DAM folder write access on `/content/dam/wknd-adventures`.

---

## 5. Image migration (after folders + form)

The Asset Import API (`/adobe/assets/import/fromUrl`) is **not enabled** on program *A Perfect Circle*. Use **Direct Binary Upload** instead:

```bash
npm run migrate:manifest      # refresh inventory → manifest (85 assets)
npm run migrate:download      # download live images to tools/aem-assets/staging/
export AEM_ACCESS_TOKEN="<IMS bearer from AEM author DevTools>"
npm run migrate:upload        # upload staged files + apply metadata
npm run migrate:metadata      # re-apply metadata if a prior upload skipped WKND fields
```

**Metadata note:** Scripts try **`PATCH /adobe/assets/{assetId}/metadata`** first. On programs where that API returns **404** (including *A Perfect Circle*), they fall back to **Sling POST** on `jcr:content/metadata` with multi-select values sent as repeated fields. If **Content usage** is empty after upload:

```bash
npm run migrate:metadata              # re-apply all imported assets
npm run migrate:verify-metadata       # read-back check (shows wknd:contentUsage per file)
npm run migrate:verify-metadata -- --file=your-image.jpg
```

If verify shows `(missing)` for `wknd:*` fields but `dc:title` is present, deploy the **wknd namespace repoinit** (§2.2). If only **Content usage** is missing, confirm the form uses **multi-select** and the script sends `["blog"]` not `"blog"`.

Manual alternative: open `tools/aem-assets/output/UPLOAD-CHECKLIST.md` and drag-drop from `tools/aem-assets/staging/<folder>/` into Assets View.

After upload:

1. Set **Asset status** → **Approved** on each asset (or bulk workflow).
2. **Publish to Dynamic Media**.
3. `npm run migrate:resolve-delivery` then `npm run migrate:replace-da -- --preview`.

---

## 6. Checklist

- [ ] Folder tree under `/content/dam/wknd-adventures` (6 subfolders)
- [ ] Metadata form **WKND Adventures — Image** created in **Assets View**
- [ ] Form assigned to `/content/dam/wknd-adventures`
- [ ] Images migrated (`migrate:download` → `migrate:upload` or manual)
- [ ] Assets **Approved** and published to Dynamic Media
- [ ] DA content updated (`migrate:replace-da`)
- [ ] Run `npm run inventory:images` — no `wknd-adventures.com` URLs on live
