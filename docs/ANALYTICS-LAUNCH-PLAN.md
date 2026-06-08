# WKND EDS Analytics plan — `ags050wknd` + Launch

Measurement plan for [masterclass-demo](https://main--masterclass-demo--znikolovski.aem.page/) on report suite **`ags050wknd`**, using **Web SDK (martech)** for transport and **Adobe Experience Platform Tags (Launch)** for variable and event mapping.

See also [MARTECH.md](./MARTECH.md) for datastream and site wiring.

---

## Architecture

| Layer | Owner | Role |
|-------|--------|------|
| Datastream `56dee4fc-...` | AEP | Routes hits to `ags050wknd` + Target |
| [martech](../plugins/martech/) + [scripts/scripts.js](../scripts/scripts.js) | Code | Load `alloy`, consent, page view, delayed Launch |
| Launch property | You | ACDL, data elements, rules → `data.__adobe.analytics.*` |
| Thin ACDL page object | Code (recommended) | Expose template, content type, environment to Launch |
| Workspace / segments | Analytics | Reporting on `ags050wknd` |

**Do not** embed a second full Web SDK from Launch. Instance name must stay **`alloy`**. See [martech integration](https://www.aem.live/developer/martech-integration).

---

## Report suite inventory (`ags050wknd`)

Reuse these slots (rename descriptions in **Admin → Report suites → Edit settings**):

| Slot | Current name | EDS meaning |
|------|--------------|-------------|
| eVar5 | Page Template | Metadata `template` |
| eVar1 | Internal Campaign | `cid` / promo id |
| eVar2 | Internal Search Terms | Reserved or retire |
| eVar3 | Custom Conversion 3 | Content type (`homepage`, `blog-article`, …) |
| eVar4 | Custom Conversion 4 | **Adventure category** (climbing, trekking, water, winter, …) — see [Phase 4](#phase-4--audience-segments-ags050wknd) |
| prop1 | Custom Insight 1 | Environment (`preview` / `live` / `local`) |
| prop2 | Custom Insight 2 | Metadata `theme` |
| prop3 | Custom Insight 3 | **Journey stage** (`inspiration`, `discovery`, `planning`, `community`) |
| prop4 | Custom Insight 4 | Site section (URL bucket) |
| prop5 | Custom Insight 5 | Interaction block / URL on link hits; fragment path on page views (optional) |

Standard dimensions (Page, Page URL, Referrer, Device, Marketing channel) need no Launch mapping.

---

## Phase 0 — Report suite admin

1. Rename eVar/prop descriptions per table above.
2. **Internal URL filters** — exclude or segment `localhost`, DA/UE hosts; optionally tag `*.aem.page` as preview via prop1 rather than filtering out.
3. Update **marketing channels** for host `masterclass-demo--znikolovski.aem.live`.
4. Disable legacy **processing rules** for old AppMeasurement context data.

### Permissions (if you see “Access to this resource has not been granted”)

Phase 0 and **Marketing channels** (`Admin → Marketing channels`) require **Adobe Analytics administrator** rights on login company **`adobeae7`** and report suite **`ags050wknd`**. **Analyst** access (Real-Time, Workspace, segments) is not enough.

| Task | Admin path | Can skip temporarily? |
|------|------------|------------------------|
| eVar/prop rename | Admin → Report suites → Edit settings | ✅ Yes — data still maps to eVar1–5 / prop1–5 |
| Internal URL filters | Report suite → Traffic filters | ✅ Yes — use segments to exclude preview/local |
| **Marketing channels** | **Admin → Marketing channels** | ✅ Yes — hits still collect; channel = default rules until configured |
| Processing rules | Admin → Processing rules | ✅ Yes if no legacy AppMeasurement rules exist |
| Rename events (Phase 3) | Admin → Events | ✅ Yes — use event1–6 labels in docs until renamed |

**Who to contact:** your company **Supported Users** (Adobe Admin Console product admin for Analytics on org `28260E2056581D3B7F000101@AdobeOrg`).

**Request to send:**

> Grant **Adobe Analytics Admin** (or Report Suite Admin on **`ags050wknd`**) for user **nikolovs** on login company **adobeae7**, including **Marketing Channel Manager** access, for WKND EDS Web SDK implementation (variable labels, traffic filters, marketing channels, event names).

**Continue without Phase 0:** Phase 1 Launch, martech code, Launch rules (§4d), segments, and Real-Time validation do **not** require Analytics Admin. Revisit Phase 0 when access is granted.

**Marketing channel workaround until admin access:** report by **prop1** (environment: preview/live/local), **Page URL**, **Referrer**, or **First Touch** dimensions in Workspace instead of Marketing Channel — then apply channel rules once an admin configures them.

---

## Phase 1 — Launch property setup

### 1. Create property

1. **Data Collection → Tags → New property**
2. **Name:** e.g. `masterclass-demo-eds`
3. **Domains** — see below (no wildcards).
4. **Advanced:** enable **Run rule components in sequence** (recommended).

#### Domains field (corrected)

Launch **does not accept wildcards** (`*.aem.page`), **localhost**, or full URLs. The UI expects **real base domain names** (e.g. `example.com`, `aem.page`) — no `https://`, no branch prefix, no `*`, no port.

Per [Create a tag property](https://experienceleague.adobe.com/en/docs/platform-learn/implement-in-websites/configure-tags/create-a-property): this field is mainly for **organizing rules and pre-populating the rule builder**. The property **runs on any site where you embed the library**; listed domains do **not** restrict where tags execute.

**Enter only these for this EDS site** (one per line if the UI allows multiple):

| Domain | Use |
|--------|-----|
| `aem.page` | All preview hosts (`main--masterclass-demo--znikolovski.aem.page`, feature branches, etc.) |
| `aem.live` | Production Helix hosts (`main--masterclass-demo--znikolovski.aem.live`) |

If the UI only allows **one** domain, use **`aem.page`** (QA Launch on preview first). Production on `.aem.live` still works once the embed URL is in [martech-config.js](../scripts/martech-config.js).

**Do not enter:**

- `*.aem.page` / `*.aem.live` — invalid (wildcards)
- `localhost` / `127.0.0.1` — invalid in current Tags UI (not a registrable domain)
- `main--masterclass-demo--znikolovski.aem.page` — full hostname; branch names change per feature
- `https://...` — invalid

#### Local development (`aem up` on `localhost:3000`)

You **do not** need `localhost` in the property Domains field.

| Approach | When to use |
|----------|-------------|
| **Test on preview** (recommended) | Push branch → validate Launch on `https://{branch}--masterclass-demo--znikolovski.aem.page` |
| **Martech without Launch locally** | Leave `launchUrls` empty or use staging embed; Web SDK + Analytics still work on localhost |
| **Chrome DevTools → Local Overrides** | Override `assets.adobedtm.com/.../launch-....js` with a saved copy while editing rules |
| **`localhost.local`** (optional) | Some teams use this placeholder if their Tags UI accepts it; not required if you use preview |

Local hits can be tagged **`prop1 = local`** via ACDL/environment logic in rules when hostname is `localhost` — no Launch domain entry needed.

### 2. Extensions

| Extension | Settings |
|-----------|----------|
| **Adobe Client Data Layer** | Inject if not present; name `adobeDataLayer` |
| **Adobe Experience Platform Web SDK** | **Use a self-hosted alloy.js instance:** ✅ On · **Instance name:** `alloy` · Same datastream as [martech-config.js](../scripts/martech-config.js) · **Migrate Target from at.js:** ❌ Off · Do not inject/configure SDK on every page (martech owns `configure`) |

### 3. Data elements

Data elements are reusable variables Launch rules read at runtime. For this site, most values live under `adobeDataLayer` in a `page` object (see [Phase 2](#phase-2--thin-acdl-contract-recommended-code)).

#### Prerequisite: ACDL extension

1. **Data Collection → Tags → your property → Extensions**
2. Open **Adobe Client Data Layer** → **Configure**
3. **Data layer object name:** `adobeDataLayer` (must match martech)
4. **Inject the data layer if it is not already on the page:** leave **unchecked** — [martech](../plugins/martech/) already loads ACDL in the lazy phase
5. **Save**

Reference: [ACDL extension overview](https://experienceleague.adobe.com/en/docs/experience-platform/tags/extensions/client/client-data-layer/overview)

#### How to create one ACDL data element (repeat for each row below)

1. **Data Collection → Tags → your property → Data Elements → Add Data Element**
2. **Name:** use the name in the table (e.g. `EDS - Page Template`)
3. **Extension:** **Adobe Client Data Layer**
4. **Data Element Type:** **Data Layer Computed State**
5. **Path:** enter the path from the table (dot notation, e.g. `page.template`)
   - Leave Path **empty** only for a debug element that returns the full state
6. **Default Value:** optional fallback string if the path is missing (often leave blank)
7. **Storage duration:** **Page view** (recommended for page attributes)
8. **Save**

In the browser console you can verify paths after the site pushes ACDL data:

```js
adobeDataLayer.getState('page.template')
```

#### ACDL data elements (primary)

Create one data element per row. Paths match the [Phase 2](#phase-2--thin-acdl-contract-recommended-code) `page` object.

| Data element name | ACDL path | Analytics slot | Example value |
|-------------------|-----------|----------------|---------------|
| `EDS - Page Name` | `page.pageName` | pageName | `WKND Adventures` |
| `EDS - Page Template` | `page.template` | eVar5 | `blog-article` |
| `EDS - Content Type` | `page.contentType` | eVar3 | `homepage` |
| `EDS - Environment` | `page.environment` | prop1 | `preview` / `live` / `local` |
| `EDS - Site Section` | `page.siteSection` | prop4 | `blog` |
| `EDS - Adventure Category` | `page.adventureCategory` | eVar4 | `climbing` |
| `EDS - Journey Stage` | `page.journeyStage` | prop3 | `inspiration` |
| `EDS - Theme` | `page.theme` | prop2 | `dark` |

Naming tip: prefix with `EDS -` so data elements sort together in the Launch UI.

#### Web SDK Variable data element (required for Update variable)

**Update variable** does not use ACDL data elements directly. It needs one **Web SDK Variable** data element — an empty container (like the old AppMeasurement `s` object) that rules fill and then send.

If you see *“No `variable` type data elements are available”*, create this **before** adding Update variable actions:

1. **Data Elements → Add Data Element**
2. **Name:** `EDS - Analytics Variable`
3. **Extension:** **Adobe Experience Platform Web SDK** (not ACDL, not Core)
4. **Data Element Type:** **Variable**
5. Right panel:
   - Select **Data** (not XDM)
   - Check **Adobe Analytics**
   - Check **Adobe Target** if Target rules will reuse the same object
6. Leave all Analytics fields empty — rules populate them via **Update variable**
7. **Storage duration:** **Page view**
8. **Save**

Reference: [Create a Variable data element](https://experienceleague.adobe.com/en/docs/platform-learn/migrate-analytics-to-websdk/create-a-variable-data-element)

**Two-layer model:**

| Layer | Extension | Type | Role |
|-------|-----------|------|------|
| Sources | ACDL / Core | Computed State, Page Info, Custom Code | Read `page.template`, hostname, title, etc. |
| Container | Web SDK | **Variable** | Holds `data.__adobe.analytics` across Update variable → Send event |

ACDL elements feed **into** the Variable container; they are not substitutes for it.

#### Fallback data elements (until Phase 2 code ships)

Use these from the **Core** extension when ACDL paths are empty. You can swap rule mappings from fallbacks to ACDL elements later without changing rule logic.

| Data element name | Extension | Type | Setting |
|-------------------|-----------|------|---------|
| `EDS - Page Title (fallback)` | Core | **Page Info** | **Page Title** |
| `EDS - Hostname (fallback)` | Core | **Page Info** | **Hostname** |
| `EDS - Environment (fallback)` | Core | **Custom Code** | see below |

**Custom code for `EDS - Environment (fallback)`:**

```js
const h = window.location.hostname;
if (h === 'localhost' || h === 'localhost.local') return 'local';
if (h.endsWith('.aem.page')) return 'preview';
if (h.endsWith('.aem.live')) return 'live';
return 'other';
```

Optional fallbacks if metadata is not yet in ACDL:

| Data element name | Extension | Type | Notes |
|-------------------|-----------|------|-------|
| `EDS - URL Path (fallback)` | Core | **Page Info** | **Pathname** — derive site section (first path segment) |
| `EDS - Template (fallback)` | Core | **Custom Code** | `document.querySelector('meta[name="template"]')?.content \|\| ''` |

#### Timing note (martech + delayed Launch)

Martech sends the **first page view** in the **lazy** phase. Launch loads in the **delayed** phase (~3 seconds later). Launch data elements and rules therefore **do not run on that first page-view hit**.

| Hit type | Where to map eVars/props |
|----------|---------------------------|
| First page view | [Phase 2](#phase-2--thin-acdl-contract-recommended-code) code: push `page` to ACDL **before** lazy page view, plus `onBeforeEventSend` in [martech-config.js](../scripts/martech-config.js) (see below) |
| Clicks / interactions after ~3s | Launch rules + data elements (this section) |

Do not skip data elements — they are still required for interaction rules once Launch is on the page.

### 4. Rules (minimum)

#### 4a. Page attributes on first page view (code, not Launch)

Add to `WEB_SDK_CONFIG` in [martech-config.js](../scripts/martech-config.js) so the first hit gets custom variables (Launch is not loaded yet):

```js
onBeforeEventSend(content) {
  content.data = content.data || {};
  content.data.__adobe = content.data.__adobe || {};
  content.data.__adobe.analytics = content.data.__adobe.analytics || {};
  const s = content.data.__adobe.analytics;
  const page = window.adobeDataLayer?.getState?.('page') || {};
  if (page.pageName) s.pageName = page.pageName;
  if (page.template) s.eVar5 = page.template;
  if (page.contentType) s.eVar3 = page.contentType;
  if (page.environment) s.prop1 = page.environment;
  if (page.theme) s.prop2 = page.theme;
  if (page.siteSection) s.prop4 = page.siteSection;
  if (page.adventureCategory) s.eVar4 = page.adventureCategory;
  if (page.journeyStage) s.prop3 = page.journeyStage;
  return true;
},
```

Until Phase 2 pushes `page`, `onBeforeEventSend` can derive `prop1` from hostname using the same logic as the fallback data element above.

#### 4b. Page attributes rule (Launch — for ACDL `pageView` events)

Use this rule when the site fires a **`pageView`** ACDL event (supplemental hits, SPAs, or after you route page views through ACDL only). Skip if you rely solely on martech auto page view + `onBeforeEventSend`.

**Prerequisite:** `EDS - Analytics Variable` (Web SDK Variable type) exists.

1. **Rules → Add Rule**
2. **Name:** `EDS - Page View Attributes`
3. **Event — Add:**
   - **Extension:** Adobe Client Data Layer
   - **Event Type:** listen to a specific event pushed to the Data Layer
   - **Event name:** `pageView`
   - **Scope:** `all` (default; safe for async martech)
4. **Action — Add (Update variable):**
   - **Extension:** Adobe Experience Platform Web SDK
   - **Action Type:** **Update variable**
   - **At the top of the action panel:** select **`EDS - Analytics Variable`** in the Data element dropdown — this clears the “No variable type data elements” error
   - Under the **Data** object, expand **Adobe Analytics**
   - Choose **one** mapping mode:

   **Option A — UI fields (uses your ACDL data elements):**

   Switch to **Provide individual attributes** and set:

   | Analytics field | Value |
   |-----------------|-------|
   | pageName | `%EDS - Page Name%` — or `%EDS - Page Title (fallback)%` if ACDL empty |
   | eVar5 | `%EDS - Page Template%` |
   | eVar3 | `%EDS - Content Type%` |
   | prop1 | `%EDS - Environment (fallback)%` |
   | prop2 | `%EDS - Theme%` |
   | prop4 | `%EDS - Site Section%` |

   **Option B — Custom code (reads ACDL directly):**

   Open **Custom Code** at the bottom of the Update variable action and paste:

   ```js
   content.__adobe = content.__adobe || {};
   content.__adobe.analytics = content.__adobe.analytics || {};
   const s = content.__adobe.analytics;
   const page = window.adobeDataLayer?.getState?.('page') || {};
   const h = window.location.hostname;
   s.pageName = page.pageName || document.title;
   s.eVar5 = page.template || '';
   s.eVar3 = page.contentType || '';
   s.prop1 = page.environment
     || (h.endsWith('.aem.page') ? 'preview' : h.endsWith('.aem.live') ? 'live' : 'local');
   s.prop2 = page.theme || '';
   s.prop4 = page.siteSection || '';
   ```

   Reference: [Migrate custom code to Web SDK](https://experienceleague.adobe.com/en/docs/platform-learn/migrate-analytics-to-websdk/migrate-custom-code-to-the-web-sdk)

5. **Action — Add (Send event)** — same rule, runs after Update variable:
   - **Extension:** Adobe Experience Platform Web SDK
   - **Action Type:** **Send event**
   - **Type:** **Page view** / `web.webPageDetails.pageViews`
   - **Data object:** click the data-element picker → select **`EDS - Analytics Variable`**
   - Leave XDM minimal unless you have schema fields to set

6. **Save**

Reference: [Migrate your default page load rule](https://experienceleague.adobe.com/en/docs/platform-learn/migrate-analytics-to-websdk/migrate-your-default-page-load-rule) · [data object mapping](https://experienceleague.adobe.com/en/docs/analytics/implementation/aep-edge/data-var-mapping)

#### 4c. CTA click rule

Use the [§4d master walkthrough](#4d-interaction-rules--launch-ui-walkthrough) and the [4d-1 recipe](#recipe-4d-1--eds---cta-click) below. Skip ACDL until block code pushes `ctaClick`.

#### 4d. Interaction rules — Launch UI walkthrough

Build these **after** `EDS - Analytics Variable` exists ([§3](#3-data-elements)). Use **Core → Click** rules for now (site blocks do not push ACDL interaction events yet).

---

##### Before you start (one-time)

**1. Create click helper data elements** (required for 4d-2 and 4d-3 conditions)

| Step | Field | Value |
|------|-------|-------|
| Data Elements → **Add** | Name | `EDS - Click Text (fallback)` |
| | Extension | **Core** |
| | Type | **Custom Code** |
| | Code | see below |
| | Storage duration | **Page view** |

```js
const el = event && event.element;
if (!el) return '';
const clickable = el.closest ? el.closest('a, button') : el;
return (clickable.textContent || '').trim().slice(0, 100);
```

| Step | Field | Value |
|------|-------|-------|
| Data Elements → **Add** | Name | `EDS - Click Href (fallback)` |
| | Extension | **Core** |
| | Type | **Custom Code** |
| | Code | see below |
| | Storage duration | **Page view** |

```js
const el = event && event.element;
if (!el) return '';
const a = el.closest ? el.closest('a') : (el.tagName === 'A' ? el : null);
return a ? a.href : '';
```

**2. Open your working library**

Tags → **Publishing** → open the active **Development** library (or create one) so you can test before Production.

---

##### Master walkthrough (every 4d rule uses this skeleton)

**A. Create the rule**

1. Left nav → **Rules** → **Add Rule**
2. **Name:** e.g. `EDS - CTA Click` → **Save** (top right)

**B. Add the Event (left column “Events”)**

1. Click **Add** under Events
2. **Extension:** `Core` (installed by default — not ACDL, not Web SDK)
3. **Event type:** `Click`
4. Right panel — **Which clicks?**
   - Choose **Specific Elements** (wording may be “Elements matching the CSS selector”)
   - Paste the **CSS selector** from the recipe table for this rule (e.g. `main a.button`)
   - Leave **delay / wait for tags** **unchecked** for buttons; for **links that leave the page** (4d-2, 4d-3), check **Delay next page navigation** and set **500** ms
5. **Keep Changes** (or **Save** on the event)

**C. Add Conditions (optional — only when recipe lists them)**

1. Click **Add** under **Conditions** (between Events and Actions)
2. **Extension:** `Core`
3. **Condition type:** `Value Comparison`
4. Right panel:
   - **Left operand:** click the **data element** icon → pick e.g. `EDS - Click Href (fallback)`
   - **Operator:** `contains` / `does not contain` / `matches RegEx` (per recipe)
   - **Right operand:** type the literal string (no quotes in UI), e.g. `aem.page`
5. Repeat for each condition row in the recipe
6. **Keep Changes**

**D. Action 1 — Update variable (set Analytics fields)**

1. Click **Add** under **Actions**
2. **Extension:** `Adobe Experience Platform Web SDK`
3. **Action type:** `Update variable`
4. Right panel — **top dropdown “Data element”:** select **`EDS - Analytics Variable`**
   - If empty, create the Variable data element first ([§3](#web-sdk-variable-data-element-required-for-update-variable))
5. Scroll to **Custom Code** (bottom of the action) → **Open Editor** → paste the **Custom Code** block from the recipe → **Save** in editor
6. **Keep Changes**

Use **Custom Code only** for interaction rules — do not use the individual attribute picker unless you prefer it. The code block is copy-paste ready.

**E. Action 2 — Send event (fire the hit)**

1. **Add** another **Action** (must be **below** Update variable in the list)
2. **Extension:** `Adobe Experience Platform Web SDK`
3. **Action type:** `Send event`
4. Right panel:
   - **Type / Event type:** `Link click` (value `web.webInteraction.linkClicks`)
   - **Instance name:** `alloy` (if shown)
   - **Data** or **Data object:** click data-element icon → **`EDS - Analytics Variable`**
   - Leave **XDM** empty unless you map schema fields deliberately
5. **Keep Changes**

**F. Finish**

1. **Save** the rule
2. **Publishing** → add rule to library → **Build & Publish** to Development
3. Test on preview **≥ 5 seconds after page load** (martech loads Launch in the delayed phase)

---

##### Recipe index

| Recipe | Rule name | Build now? |
|--------|-----------|------------|
| [4d-1](#recipe-4d-1--eds---cta-click) | `EDS - CTA Click` | ✅ Yes |
| [4d-2](#recipe-4d-2--eds---outbound-link) | `EDS - Outbound Link` | ✅ Yes |
| [4d-3](#recipe-4d-3--eds---file-download) | `EDS - File Download` | ✅ Yes |
| [4d-4](#recipe-4d-4--eds---carousel-change) | `EDS - Carousel Change` | ✅ Yes |
| [4d-7](#recipe-4d-7--eds---faq-expand) | `EDS - FAQ Expand` | ✅ Yes |
| [4d-8](#recipe-4d-8--eds---tab-select) | `EDS - Tab Select` | ✅ Yes |
| [4d-5 / 4d-6](#recipe-4d-5--4d-6--eds---video-start--complete) | Video Start / Complete | ⏸ After block JS |
| [ACDL mode](#when-site-code-pushes-acdl-events-later) | same rule names | Later |

---

##### Recipe 4d-1 — `EDS - CTA Click`

| Step | What to enter |
|------|----------------|
| **Event → CSS selector** | `main a.button, main .button-container a, main .hero-adventure a` |
| **Event → Delay navigation** | Off (buttons may not navigate) |
| **Conditions** | None |

**Action 1 — Update variable → Custom Code:**

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event1';
s.linkName = '%EDS - Click Text (fallback)%';
s.linkType = 'o';
s.prop5 = 'cta';
```

**Action 2 — Send event:** Type = **Link click** · Data object = **`EDS - Analytics Variable`**

**Admin:** rename Custom Event 1 → **CTA Click**

---

##### Recipe 4d-2 — `EDS - Outbound Link`

| Step | What to enter |
|------|----------------|
| **Event → CSS selector** | `main a[href^="http"]` |
| **Event → Delay navigation** | **On** · **500** ms |
| **Conditions** (all required, AND logic) | |

| # | Left operand | Operator | Right operand |
|---|--------------|----------|---------------|
| 1 | `%EDS - Click Href (fallback)%` | does not contain | `aem.page` |
| 2 | `%EDS - Click Href (fallback)%` | does not contain | `aem.live` |
| 3 | `%EDS - Click Href (fallback)%` | does not contain | `localhost` |

**Action 1 — Custom Code:**

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.linkName = '%EDS - Click Text (fallback)%';
s.linkType = 'e';
s.prop5 = '%EDS - Click Href (fallback)%';
```

**Action 2 — Send event:** Link click · **`EDS - Analytics Variable`**

Note: no `events = event1` here so outbound clicks stay separate from CTA Click (event1).

---

##### Recipe 4d-3 — `EDS - File Download`

| Step | What to enter |
|------|----------------|
| **Event → CSS selector** | `main a[href]` |
| **Event → Delay navigation** | **On** · **500** ms |
| **Conditions** | |

| # | Left operand | Operator | Right operand |
|---|--------------|----------|---------------|
| 1 | `%EDS - Click Href (fallback)%` | matches RegEx | `\.(pdf|zip|docx?|xlsx?|pptx?)(\?|$)` |

**Action 1 — Custom Code:**

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event1';
s.linkName = '%EDS - Click Text (fallback)%';
s.linkType = 'd';
s.prop5 = '%EDS - Click Href (fallback)%';
```

**Action 2 — Send event:** Link click · **`EDS - Analytics Variable`**

---

##### Recipe 4d-4 — `EDS - Carousel Change`

| Step | What to enter |
|------|----------------|
| **Event → CSS selector** | `.carousel-hero-slide-indicator button, .carousel-hero .slide-prev, .carousel-hero .slide-next, .carousel-blog-slide-indicator button, .carousel-blog .slide-prev, .carousel-blog .slide-next` |
| **Event → Delay navigation** | Off |
| **Conditions** | None |

**Action 1 — Custom Code:**

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event2';
s.linkName = 'carousel-change';
s.linkType = 'o';
s.prop5 = (event && event.element && event.element.closest('.carousel-hero')) ? 'carousel-hero' : 'carousel-blog';
```

**Action 2 — Send event:** Link click · **`EDS - Analytics Variable`**

**Admin:** rename Custom Event 2 → **Carousel Interaction**

---

##### Recipe 4d-7 — `EDS - FAQ Expand`

| Step | What to enter |
|------|----------------|
| **Event → CSS selector** | `.accordion-faq-item summary, summary.accordion-faq-item-label` |
| **Event → Delay navigation** | Off |
| **Conditions** | None |

**Action 1 — Custom Code:**

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event5';
s.linkName = '%EDS - Click Text (fallback)%';
s.linkType = 'o';
s.prop5 = 'accordion-faq';
```

**Action 2 — Send event:** Link click · **`EDS - Analytics Variable`**

**Admin:** rename Custom Event 5 → **FAQ Expand**

---

##### Recipe 4d-8 — `EDS - Tab Select`

| Step | What to enter |
|------|----------------|
| **Event → CSS selector** | `.tabs-activity-tab` |
| **Event → Delay navigation** | Off |
| **Conditions** | None |

**Action 1 — Custom Code:**

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event6';
s.linkName = '%EDS - Click Text (fallback)%';
s.linkType = 'o';
s.prop5 = 'tabs-activity';
```

**Action 2 — Send event:** Link click · **`EDS - Analytics Variable`**

**Admin:** rename Custom Event 6 → **Tab Select**

---

##### Recipe 4d-5 / 4d-6 — `EDS - Video Start` & `Complete`

**Do not build in Launch yet** — YouTube runs in an iframe; Core Click cannot see play/complete.

When [youtube-video.js](../blocks/youtube-video/youtube-video.js) pushes ACDL, create two rules using [ACDL event mode](#when-site-code-pushes-acdl-events-later):

| Rule | ACDL event name | Custom Code `s.events` | Admin event name |
|------|-----------------|------------------------|------------------|
| Video Start | `videoStart` | `event3` | Video Start |
| Video Complete | `videoComplete` | `event4` | Video Complete |

Shared Custom Code body (adjust `s.events`):

```js
content.__adobe = content.__adobe || {};
content.__adobe.analytics = content.__adobe.analytics || {};
const s = content.__adobe.analytics;
s.events = 'event3'; // or event4
s.linkName = '%EDS - Interaction Label%';
s.linkType = 'o';
s.prop5 = 'youtube-video';
```

---

##### When site code pushes ACDL events (later)

Replace **Core → Click** with **Adobe Client Data Layer** event:

1. **Events → Add**
2. **Extension:** `Adobe Client Data Layer`
3. **Event type:** `Listen to a specific event pushed to the Data Layer` (wording may vary)
4. **Event name:** exact string, e.g. `ctaClick`, `carouselChange`
5. **Scope:** `All` (default)
6. Keep the same **Update variable** Custom Code and **Send event** actions; swap `%EDS - Click Text (fallback)%` for `%EDS - Interaction Label%` where noted

Create ACDL data elements first: `interaction.label`, `interaction.block`, `interaction.detail` ([§3 paths](#acdl-data-elements-primary)).

---

##### Troubleshooting in the Launch UI

| Problem | Fix |
|---------|-----|
| “No variable type data elements” on Update variable | Select **`EDS - Analytics Variable`** in the **top** dropdown of the action |
| Rule never fires | Wait **≥ 5 s** after page load; confirm library published to **Development**; confirm embed URL in [martech-config.js](../scripts/martech-config.js) |
| `%EDS - Click Text%` empty in hits | Data element must use **`event.element`**; rule must include **Core Click** event (not DOM Ready) |
| Outbound rule fires on internal links | Add the three **does not contain** conditions in 4d-2 |
| Link click fires but no Analytics event | Check **Send event** action is **second** and Data object = **`EDS - Analytics Variable`** |
| Double hits on one click | Only one rule should match; narrow CSS selectors; split CTA vs outbound (4d-1 vs 4d-2) |

##### Rules to skip

| Skip | Reason |
|------|--------|
| Page view on DOM Ready | Martech already sends page views |
| Video 4d-5/4d-6 | Needs ACDL from block code |
| Target impression rule | Use Target reporting |

##### Validate each rule

1. Preview site → open [Experience Cloud Debugger](https://experienceleague.adobe.com/en/docs/debugger/home) or **Assurance**
2. Wait for Launch (`assets.adobedtm.com` or `launch-*.min.js`) — ~3–5 s after load
3. Perform the interaction once
4. Debugger → **Rules** tab: confirm your rule name → **Update variable** then **Send event** fired in order
5. **Analytics → Real-Time** → Custom event counter (event1, event2, …) increments


### 5. Publish and connect to site

1. Publish library to **Development** → **Staging** → **Production**.
2. Copy embed URL(s) into [martech-config.js](../scripts/martech-config.js) `launchUrls`.
3. Push code; martech loads Launch in the **delayed** phase (~3s).

Use **separate Launch environments** (staging embed for QA on `.aem.page`, production embed for `.aem.live`) if your team promotes libraries that way — both domains are covered by the property above.

---

## Phase 2 — Thin ACDL contract (recommended code)

Push once after page metadata is available:

```js
window.adobeDataLayer.push({
  page: {
    pageName: '…',
    template: '…',
    theme: '…',
    contentType: '…',
    environment: 'preview' | 'live' | 'local',
    siteSection: '…',
    adventureCategory: 'climbing',   // primary adventure interest for this page
    journeyStage: 'inspiration',   // inspiration | discovery | planning | community
  },
  event: 'pageView',
});
```

Authors set **`adventureCategory`** and **`journeyStage`** in page metadata (Universal Editor) so segments describe *who the content is for*, not what buttons they clicked. Map `adventureCategory` → **eVar4**, `journeyStage` → **prop3** in Launch / `onBeforeEventSend`.

**Suggested adventure category values** (align with WKND editorial):

| `adventureCategory` | Example content |
|---------------------|-----------------|
| `climbing` | Rock / ice / sport climbing stories |
| `trekking` | Multi-day hikes, Patagonia, backpacking |
| `winter-alpine` | Mountaineering, snow, alpine conditions |
| `cycling` | Road, gravel, alpine cycling |
| `water` | Kayaking, surfing, wild swimming |
| `desert` | Desert travel, survival, arid environments |
| `photography` | Mountain / adventure photography |
| `general-outdoor` | Homepage, broad “adventures” hub when no single category fits |

**Suggested journey stage values** (intent, not page template):

| `journeyStage` | Example pages |
|----------------|-----------------|
| `inspiration` | Homepage, blog, field-notes |
| `discovery` | `/adventures`, `/destinations`, activity tabs |
| `planning` | `/expeditions`, `/gear`, `/faq`, `/basecamp` |
| `community` | `/community`, `/sustainability`, `/about` |

Launch rules read ACDL only — avoids brittle DOM scraping.

---

## Phase 3 — Events (Admin)

| Event | Name | Trigger |
|-------|------|---------|
| event1 | CTA Click | Primary buttons |
| event2 | Carousel Interaction | Slide change |
| event3 | Video Start | YouTube block |
| event4 | Video Complete | YouTube block |
| event5 | FAQ Expand | Accordion |
| event6 | Tab Select | tabs-activity |
| event7 | Asset Impression | Asset analytics — see [ASSET-ANALYTICS-PLAN.md](./ASSET-ANALYTICS-PLAN.md) |
| event8 | Asset Click | Asset analytics |
| event9–15 | Form funnel | Form impression → success — see [FORM-ANALYTICS-PLAN.md](./FORM-ANALYTICS-PLAN.md) |
| eVar7 | Form ID | `form.formSlug` |
| prop8 | Form step | `form.step` (field name) |

Map via `data.__adobe.analytics.events` in Launch ([data object mapping](https://experienceleague.adobe.com/en/docs/analytics/implementation/aep-edge/data-var-mapping)).

---

## Phase 4 — Audience segments (`ags050wknd`)

Segments should answer: **who is visiting WKND, and what kind of adventure are they looking for?** — not whether they clicked a carousel or started a video.

WKND’s core audience is **outdoor adventure seekers** at different stages (browsing inspiration → narrowing destinations → planning gear and trips) with distinct **activity interests** (climbing, trekking, water, winter, etc.). Build segments around that taxonomy.

Create segments in **Analytics → Components → Segments → Create** on report suite **`ags050wknd`**.

Apply **EDS - Live Traffic** on executive Workspaces so preview/dev data does not skew audience mix.

### How to create a segment

1. **Analytics → Components → Segments → Create**
2. **Name:** use names below (prefix `WKND -` for audience segments, `EDS -` for operational filters)
3. **Container:** **Visit** for “looked at climbing content this session”; **Visitor** for “returns for trekking over time”; **Hit** only for environment filters
4. **Definition:** drag dimensions; combine with **OR** within a category, **AND** when narrowing (e.g. Live **and** Climbing interest)
5. **Share** to company `adobeae7` · **Save**

Reference: [Segment Builder](https://experienceleague.adobe.com/en/docs/analytics/components/segmentation/seg-overview)

### Data foundation (do this first)

Segments work best when every adventure page carries metadata. Until then, use **URL / page title fallbacks** in the definitions below (works for imported blog slugs; brittle as URLs change).

| Variable | Source | Segment use |
|----------|--------|-------------|
| **eVar4** | `page.adventureCategory` | Primary **activity interest** |
| **prop3** | `page.journeyStage` | **Planning vs inspiration** intent |
| **prop4** | `page.siteSection` | Site area (`blog`, `destinations`, `gear`, …) |
| **eVar3** | `page.contentType` | Page type (`blog-article`, `homepage`, …) |

Add `adventureCategory` and `journeyStage` to page metadata in Universal Editor and map them in [Phase 2](#phase-2--thin-acdl-contract-recommended-code) / `onBeforeEventSend`.

---

### Workspace segment picker troubleshooting

If approved segments do not appear when you search in an Analysis Workspace project:

1. **Report suite** — Project must use **`ags050wknd`** (not another demo RSID).
2. **Component type** — Add a **Segment** filter (not a dimension).
3. **Page URL in segment definitions** — The **`Page URL`** dimension (`variables/pageurl`) is **not segmentable in Analysis Workspace** (Data Warehouse only). Segments that reference it are marked **`data_warehouse`** only and are hidden from the Workspace picker even when approved. Use **`Environment` (prop1)** for live/preview/local filters and **`Page`** (`variables/page`) for path-based fallbacks.

All **EDS** / **WKND** segments on `ags050wknd` were updated (2026-06-02) to Workspace-compatible definitions (`oberon` in `supported_products`).

---

### Tier 1 — Operational filters (not audience)

Keep these for data hygiene only — apply as Workspace include/exclude, not as “audiences.”

| Segment name | Container | Definition |
|--------------|-----------|------------|
| **EDS - Live Traffic** | Hit | `prop1` **equals** `live` |
| **EDS - Preview Traffic** | Hit | `prop1` **equals** `preview` |
| **EDS - Non-Production (exclude)** | Hit | `prop1` **equals** `preview` **OR** `local` |

---

### Tier 2 — Adventure interest (core audience)

**Container: Visit** — “Visited at least one page about this adventure type during the session.”

Prefer **`eVar4` equals** when metadata is live. **Fallback** uses **`Page`** **contains** (not Page URL — not Workspace-segmentable).

| Segment name | Primary (`eVar4`) | URL / title fallback (OR within row) |
|--------------|-------------------|--------------------------------------|
| **WKND - Climbing Seekers** | `climbing` | `climbing`, `yosemite`, `ice-climbing` |
| **WKND - Trekking & Hiking** | `trekking` | `trek`, `backpacking`, `patagonia`, `hiking` |
| **WKND - Winter & Alpine** | `winter-alpine` | `winter`, `mountaineering`, `alpine` |
| **WKND - Cycling Adventurers** | `cycling` | `cycling`, `alpine-cycling` |
| **WKND - Water Adventurers** | `water` | `kayak`, `surfing`, `swimming`, `norway` |
| **WKND - Desert Explorers** | `desert` | `desert`, `survival` |
| **WKND - Photography & Story** | `photography` | `photography`, `field-notes` |
| **WKND - Broad Outdoor Browse** | `general-outdoor` | Entry `/` **OR** `/adventures` without a narrower category hit |

**Example (Climbing Seekers, Visit container):**

```
eVar4 equals climbing
OR Page contains climbing
OR Page contains yosemite
OR Page contains ice-climbing
```

**Composite:**

| Segment name | Container | Definition |
|--------------|-----------|------------|
| **WKND - Multi-Interest Explorers** | Visit | Two or more distinct adventure categories in same visit (use nested segment OR + distinct eVar4 breakdown in Workspace) |
| **WKND - Single-Interest Focused** | Visit | Visit hits only one `eVar4` value (or one URL fallback family) |

---

### Tier 3 — Journey stage (what they’re trying to do)

**Container: Visit** — which part of the adventure journey did they engage with?

| Segment name | Primary (`prop3`) | Fallback (`prop4` / URL) |
|--------------|-------------------|----------------------------|
| **WKND - Inspiration Readers** | `inspiration` | `/blog`, `/field-notes`, homepage entry |
| **WKND - Discovery Browsers** | `discovery` | `/adventures`, `/destinations`, activity tabs |
| **WKND - Planners & Prep** | `planning` | `/expeditions`, `/gear`, `/faq`, `/basecamp` |
| **WKND - Community & Values** | `community` | `/community`, `/sustainability`, `/about` |

**Cross-stage journeys:**

| Segment name | Container | Definition | Why it matters |
|--------------|-----------|------------|----------------|
| **WKND - Inspired → Planning** | Visit | **Inspiration Readers** **AND** **Planners & Prep** same visit | Story → trip prep — strong intent signal |
| **WKND - Discovery → Planning** | Visit | **Discovery Browsers** **AND** **Planners & Prep** | Picked a direction, looked at expeditions/gear |
| **WKND - Gear-Focused Planners** | Visit | **Planners & Prep** **AND** URL contains `/gear` | Equipment research audience |
| **WKND - Destination Researchers** | Visit | URL contains `/destinations` **OR** `/expeditions` | Location / trip comparison |

---

### Tier 4 — Audience archetypes (interest + journey)

Use in Workspace **Segment Comparison** and as Target audiences.

| Segment name | Container | Definition | Persona |
|--------------|-----------|------------|---------|
| **WKND - Aspiring Climber** | Visit | **Climbing Seekers** **AND** (**Inspiration** OR **Discovery**) | Learning about climbing, not yet deep planning |
| **WKND - Climber Ready to Book** | Visit | **Climbing Seekers** **AND** **Planners & Prep** | Climbing + expeditions/gear/FAQ |
| **WKND - Trekker Planner** | Visit | **Trekking & Hiking** **AND** **Planners & Prep** | Multi-day hike / trek research |
| **WKND - Water Trip Planner** | Visit | **Water Adventurers** **AND** (**Discovery** OR **Planning**) | Surf / kayak / swim trip research |
| **WKND - Winter Expedition Interest** | Visit | **Winter & Alpine** **AND** (**Discovery** OR **Planning**) | Cold-weather adventure audience |
| **WKND - Weekend Browser** | Visit | **Broad Outdoor Browse** **AND** **Inspiration only** (no Planning hit) | Top-of-funnel; needs inspiration content |
| **WKND - Returning Adventure Reader** | Visitor | Repeat visit **AND** includes **Inspiration Readers** | Loyal editorial audience |
| **WKND - Returning Planner** | Visitor | Repeat visit **AND** includes **Planners & Prep** | Repeat trip planners |

---

### Tier 5 — Acquisition context (how they found WKND)

**Container: Visit** — compare *which channels bring which adventure interests*.

| Segment name | Definition |
|--------------|------------|
| **WKND - Search-Driven Adventurers** | `Marketing Channel` = Natural Search **AND** any Tier 2 interest segment |
| **WKND - Social Inspiration Traffic** | `Marketing Channel` = Social Networks **AND** **Inspiration Readers** |
| **WKND - Direct Loyal Audience** | `Marketing Channel` = Direct **AND** repeat visit |
| **WKND - Campaign-Driven Visit** | `eVar1` **exists** OR `Campaign` **exists** |

Pair with a Tier 2 segment in Workspace: e.g. Social + Climbing Seekers vs Search + Trekking.

---

### Tier 6 — Target & personalization (optional)

| Segment name | Use |
|--------------|-----|
| **WKND - Target Test Audience** | Target impression exists — QA only |
| **WKND - Climbing + Preview** | **Climbing Seekers** on `.aem.page` — activity QA |

Use **Tier 4 archetypes** as Target audience definitions (e.g. hero test for **Aspiring Climber**).

---

### Appendix — Behavioral segments (secondary)

For **component optimization** and Launch QA only — not executive audience reporting.

| Segment | Container | Definition |
|---------|-----------|------------|
| EDS - CTA Clickers | Visit | `event1` exists |
| EDS - Video Starters | Visit | `event3` exists |
| EDS - Carousel Engaged | Visit | `event2` exists |

---

### Segment application (recommended)

```
Executive / marketing Workspace
  └── Include:  EDS - Live Traffic
  └── Exclude:  EDS - Non-Production
  └── Compare:  Tier 2 adventure interests
  └── Compare:  Tier 4 archetypes (Aspiring Climber vs Climber Ready to Book)

Content strategy Workspace
  └── Breakdown:  Tier 2 interest × Tier 3 journey stage
  └── Flow:       Inspiration → Planning sequential segments

Target / personalization
  └── Audiences from Tier 4
```

### Segment inventory checklist

**Operational**

- [ ] EDS - Live Traffic  
- [ ] EDS - Non-Production (exclude)  

**Adventure interest (Tier 2)**

- [ ] WKND - Climbing Seekers  
- [ ] WKND - Trekking & Hiking  
- [ ] WKND - Winter & Alpine  
- [ ] WKND - Cycling Adventurers  
- [ ] WKND - Water Adventurers  
- [ ] WKND - Desert Explorers  
- [ ] WKND - Photography & Story  
- [ ] WKND - Broad Outdoor Browse  

**Journey stage (Tier 3)**

- [ ] WKND - Inspiration Readers  
- [ ] WKND - Discovery Browsers  
- [ ] WKND - Planners & Prep  
- [ ] WKND - Community & Values  
- [ ] WKND - Inspired → Planning  
- [ ] WKND - Destination Researchers  

**Archetypes (Tier 4 — start with 3–5)**

- [ ] WKND - Aspiring Climber  
- [ ] WKND - Climber Ready to Book  
- [ ] WKND - Trekker Planner  
- [ ] WKND - Weekend Browser  
- [ ] WKND - Returning Adventure Reader  

**Metadata dependency:** add `adventureCategory` + `journeyStage` to pages, then replace URL fallbacks with `eVar4` / `prop3` for cleaner segments.

---

## Phase 5 — Workspace project

Create on **`ags050wknd`**:

**Project name:** `WKND — Adventure Audiences`

**Default filters:** Include **EDS - Live Traffic** on each panel (exclude **EDS - Non-Production** only if you add a Quick segment with **Exclude** — see [build guide](#phase-5--workspace-build-guide-step-by-step)).

**Step-by-step panel instructions:** [Phase 5 — Workspace build guide](#phase-5--workspace-build-guide-step-by-step)

| Panel | What to show | Segments / dimensions |
|-------|--------------|----------------------|
| **Audience overview** | Visits, unique visitors, mix | Tier 2 interests compared side-by-side |
| **Interest × journey** | Freeform table | Rows: `eVar4` · Columns: `prop3` |
| **Archetype comparison** | Segment comparison | Aspiring Climber vs Climber Ready to Book vs Weekend Browser |
| **Journey progression** | Fallout or sequential | Inspiration → Discovery → Planning |
| **Content by interest** | Top pages | Filter each Tier 2 segment · dim: Page |
| **Destinations & expeditions** | Page views, time | **WKND - Destination Researchers** |
| **Gear & planning** | Entries, bounce | **WKND - Gear-Focused Planners** |
| **Blog & field notes** | Pages, categories | **WKND - Inspiration Readers** + `eVar4` |
| **Channel × interest** | Stacked bar | Marketing Channel × Tier 2 segment |
| **New vs returning by interest** | Cohort view | Visitor container · Tier 2 segments |
| **Environment QA** | prop1, sample URLs | EDS - Preview (small separate panel) |
| **Target (when live)** | Activity performance | Tier 4 archetypes as breakdown |

**Starter calculated metrics (optional):**

- **Planning rate** = visits with **Planners & Prep** / total live visits  
- **Inspired-to-plan rate** = visits **Inspired → Planning** / visits **Inspiration Readers**

Reference: [Analysis Workspace overview](https://experienceleague.adobe.com/en/docs/analytics/analyze/analysis-workspace/home)

### Phase 5 — Workspace build guide (step-by-step)

Use these instructions for each panel. Adobe Workspace visualizations are named **Key metric summary**, **Summary number**, **Summary change** (there is no standalone **Summary** viz). **Key metric summary** combines the line trend, percent change, and total number in one tile.

#### Shared project setup (once)

1. **Analytics → Analysis Workspace → Create new project → Blank project**.
2. **Project settings** (gear, top right):
   - **Name:** `WKND — Adventure Audiences`
   - **Report suite:** `ags050wknd`
3. **Date range** (top right): e.g. **Last 30 days** (extend after more live data accumulates).
4. For **every panel except Environment QA** (below):
   - Rename the panel (click panel title).
   - Drag **`EDS - Live Traffic`** from **Components → Segments** into the **panel segment drop zone** (top of panel). Dragging a saved segment always **includes** that audience; there is no exclude toggle on the chip. Including live-only is enough for production reporting (preview/local are already excluded).
5. **Optional exclude:** add a **Quick segment** on the panel (**+** or filter icon → Quick segment builder → set **Exclude** → **Environment** equals `preview` OR `local`). See [Workspace segment picker troubleshooting](#workspace-segment-picker-troubleshooting).

**Tier 2 segments (copy-paste in segment search):**

`WKND - Climbing Seekers` · `WKND - Trekking & Hiking` · `WKND - Winter & Alpine` · `WKND - Cycling Adventurers` · `WKND - Water Adventurers` · `WKND - Desert Explorers` · `WKND - Photography & Story` · `WKND - Broad Outdoor Browse`

---

#### Panel 1 — Audience overview

**Goal:** Live-traffic headline KPIs + Tier 2 interest mix side-by-side.

1. Add panel → title **Audience overview** → apply **`EDS - Live Traffic`** filter.
2. **Key metric summary** (×2):
   - **Insert → Key metric summary** (or drag from **Visualizations**).
   - Configure: **Metric** = **Visits** · **Primary date range** = project range · **Comparison date range** = **Previous period** (optional).
   - **Settings** (gear on viz): **Emphasize number value** for a large center total.
   - Duplicate or add a second tile: **Metric** = **Unique Visitors** (or **Visitors**).
3. **Freeform table** — segment comparison:
   - **Insert → Freeform table**.
   - **Columns:** drag each **Tier 2** segment listed above (one column per segment).
   - **Rows:** **Visits**, **Unique Visitors**, **Page Views** (optional).
   - Optional: right-click metric row → **Column settings** → show **% of column** for share-of-audience (segments can overlap within a visit; totals may exceed 100%).
4. **Bar** or **Donut** — mix chart:
   - Select the **Visits** row across segment columns → right-click → **Create visualization from selection** → **Bar** or **Donut**; **or**
   - New **Bar**: **Dimension** = **Adventure category** (`eVar4`) · **Metric** = **Visits** (uses hit-level metadata when populated).
5. **Text** (optional): note “Production only · Tier 2 segments may overlap per visit.”

---

#### Panel 2 — Interest × journey

**Goal:** Cross-tab adventure interest against journey stage.

1. New panel → **Interest × journey** → **`EDS - Live Traffic`**.
2. **Freeform table**:
   - **Rows:** **Adventure category** (`eVar4`).
   - **Columns:** **Journey stage** (`prop3`).
   - **Metrics:** **Visits** (primary), **Unique Visitors** (optional second metric via **Metrics** drag or metric picker).
3. **Heat map** (optional): select table → right-click → **Create visualization from selection** → **Heat map** for density view.
4. **Interpretation:** strong cells = e.g. `climbing` × `planning`; empty cells = missing metadata or no traffic yet.

---

#### Panel 3 — Archetype comparison

**Goal:** Compare Tier 4 personas on the same metrics.

1. New panel → **Archetype comparison** → **`EDS - Live Traffic`**.
2. **Freeform table** (segment comparison):
   - **Columns** (segments):
     - `WKND - Aspiring Climber`
     - `WKND - Climber Ready to Book`
     - `WKND - Weekend Browser`
     - Optional: `WKND - Trekker Planner`, `WKND - Returning Adventure Reader`
   - **Rows:** **Visits**, **Unique Visitors**, **Page Views**, **Bounce Rate**, **Average Time on Site**.
3. **Bar** (horizontal): select **Visits** row → **Create visualization from selection** → **Bar**.
4. **Key metric summary** (optional): one tile per archetype is heavy; prefer the table + one bar for exec readouts.

---

#### Panel 4 — Journey progression (the funnel panel)

**Goal:** See movement from inspiration → discovery → planning within visits.

> **Panel numbering:** This is **Panel 4** in the build guide. **Panel 5** is *Content by interest* (top pages table, not a funnel). If you are building a funnel, stay on this panel.

**Important:** Do **not** drag **`WKND - Inspiration Readers`** (and other Tier 3 segments) directly into Fallout touchpoints. Those segments use a **Visit** container. A **Visit**-context Fallout requires **Hit**-level touchpoints — incompatible segments show a warning and **100% fallout**. Use **Journey stage** (`prop3`) values or **Page** paths as touchpoints instead (see Option A), or use Option B/C.

---

**Option A — Fallout visualization (recommended path)**

1. **Create the panel**
   - **Insert → Panel** (or duplicate an existing panel).
   - Rename: **Journey progression**.
   - Drag **`EDS - Live Traffic`** into the **panel segment drop zone** (top of panel).

2. **Add Fallout**
   - **Insert → Fallout** (left rail **Visualizations → Fallout**, or **+** on panel).
   - You should see an empty funnel with **Add touchpoint** and a baseline (often **All Visits**).

3. **Set Fallout container to Visits** (same-session journey)
   - Click the **gear** on the Fallout visualization.
   - Find **Fallout container** (or **Container**) → choose **Visits** (not Visitors).
   - **Why:** Inspiration → discovery → planning usually happens in **one visit**. **Visitors** spreads steps across multiple visits and understates in-session progression.

4. **Choose touchpoint type** — pick **one** approach below.

   **A1 — Journey stage (`prop3`)** — best when metadata is on pages

   | Step | What to add |
   |------|-------------|
   | 1 | Left rail → **Dimensions** → **Journey stage** → click **›** (expand) → drag value **`inspiration`** onto **Add touchpoint** |
   | 2 | Drag **`discovery`** as second touchpoint |
   | 3 | Drag **`planning`** as third touchpoint |

   If values do not appear under **Journey stage**, metadata is not populated yet — use A2.

   **A2 — Page paths** — works with URL/page names today

   For each step, add **one touchpoint** with **multiple pages OR’d together** (drag the next page onto the **same** touchpoint until you see **Combine** / multiple chips):

   | Step | Drag onto the **same** touchpoint (OR) |
   |------|----------------------------------------|
   | 1 Inspiration | **Page** items whose names contain `blog` or `field-notes`, or homepage (use **Page** dimension **›** to pick specific pages) |
   | 2 Discovery | **Page** contains `/adventures` or `/destinations` (search in Page dimension items) |
   | 3 Planning | **Page** contains `/expeditions`, `/gear`, `/faq`, or `/basecamp` |

   How to pick a single page: **Dimensions → Page → ›** next to Page → select one page (e.g. `WKND | Blog`) → drag to touchpoint.

5. **Touchpoint timing (under each step)**
   - Default: **Eventual path** — visitor hits step 3 **at some point after** step 1 in the visit (order flexible). Use this for WKND browsing.
   - **Next hit** — step must be the **very next** page view. Stricter; use only for tight click paths (e.g. checkout).

6. **Read the chart**
   - **Green %** on a bar = fall-through from **previous** step to this step.
   - **Gray %** between bars = fallout (left before completing the path).
   - First bar = starting population (after panel filter **Live Traffic**).

7. **Optional: compare segments at top of Fallout**
   - Drag **`EDS - Live Traffic`** (or Tier 2 segments) into the **segment drop zone on the Fallout viz** (top of funnel) to compare paths side-by-side — not into touchpoint slots.
   - Reference: [Compare segments in Fallout](https://experienceleague.adobe.com/en/docs/analytics/analyze/analysis-workspace/visualizations/fallout/compare-segments-fallout)

8. **QA**
   - If every step shows **100% fallout**, touchpoints are wrong or too narrow — switch A1 ↔ A2 or widen Page OR rules.
   - **Right-click** a step → **Fallthrough** to see what visitors viewed between two steps.

---

**Option B — Segment comparison table (no Fallout UI — easiest)**

Use when Fallout is empty or too fiddly; shows **how many visits** match each stage, not strict step order.

1. Panel **Journey progression** + **`EDS - Live Traffic`**.
2. **Freeform table**:
   - **Columns:** `WKND - Inspiration Readers` · `WKND - Discovery Browsers` · `WKND - Planners & Prep` · `WKND - Inspired → Planning` · `WKND - Discovery → Planning`
   - **Rows:** **Visits**, **Unique Visitors**
3. **Interpretation:** **Inspired → Planning** count ≤ **Inspiration Readers**; ratio ≈ “inspired then planned” rate.

---

**Option C — Sequential segment in Segment Builder (true ordered funnel)**

1. **Components → Segments → Create**.
2. Enable **Sequential segmentation** (clock icon / sequential mode).
3. **Visit** container, **Then**:
   - Touch 1: **Journey stage** equals `inspiration` (or Page contains `/blog`)
   - **Then** Touch 2: **Journey stage** equals `discovery` (or Page contains `/adventures`)
   - **Then** Touch 3: **Journey stage** equals `planning`
4. Save as **`WKND - Funnel Inspiration → Discovery → Planning`**.
5. In Workspace: **Key metric summary** or **Summary number** with that segment vs **Visits** (live) for conversion rate.

---

#### Panel 5 — Content by interest

**Goal:** Top pages per adventure interest — **not a funnel**.

**Option A — Segment drop-down (one panel, switch interest)**

1. New panel → **Content by interest** → **`EDS - Live Traffic`**.
2. In panel drop zone, hold **Shift** and drag multiple **Tier 2** segments → creates a **segment drop-down** ([drop-down filters](https://experienceleague.adobe.com/en/docs/analytics-learn/tutorials/analysis-workspace/using-panels/using-drop-down-filters)).
3. **Freeform table:** **Rows** = **Page** · **Metrics** = **Page Views**, **Visits**, **Entries**.
4. Users pick **Climbing Seekers**, **Trekking & Hiking**, etc. from the drop-down to refresh the table.

**Option B — Static table per interest (duplicate viz)**

1. Add **Freeform table** filtered by dragging **`WKND - Climbing Seekers`** into the table **segment drop zone** (table header), not only the panel zone.
2. **Rows** = **Page** · sort by **Page Views** descending · limit 10–15 rows.
3. Duplicate table per Tier 2 segment (8 tables) — clearer for screenshots, more maintenance.

---

#### Panel 6 — Destinations & expeditions

**Goal:** Behavior for destination/expedition researchers.

1. New panel → **Destinations & expeditions** → **`EDS - Live Traffic`**.
2. Panel filter: add **`WKND - Destination Researchers`** **in addition to** live traffic, **or** use only the segment on the panel (segment already implies visit-level interest; live filter still recommended via **AND** — panel live + table segment, or rely on segment-only if all hits are live).
   - Simplest: panel **`EDS - Live Traffic`** only; drag **`WKND - Destination Researchers`** onto the **visualization** segment zone.
3. **Key metric summary:** **Page Views**, **Visits** (two tiles).
4. **Freeform table:** **Rows** = **Page** (filter: contains `/destinations` or `/expeditions` via table filter icon if needed) · **Metrics** = **Page Views**, **Time Spent on Page** (or **Average Time on Site**).
5. **Bar:** top 10 pages by **Page Views**.

---

#### Panel 7 — Gear & planning

**Goal:** Planning audience focused on gear.

1. New panel → **Gear & planning** → **`EDS - Live Traffic`**.
2. Apply segment **`WKND - Gear-Focused Planners`** on panel or viz.
3. **Key metric summary:** **Entries**, **Bounce Rate** (two tiles; comparison period optional).
4. **Freeform table:** **Rows** = **Page** · **Metrics** = **Entries**, **Bounce Rate**, **Page Views** · sort by **Entries** desc.
5. Optional: **Summary change** — select this period vs previous period cells from a small date-comparison table → **Create visualization from selection** → **Summary change**.

---

#### Panel 8 — Blog & field notes

**Goal:** Editorial / inspiration content performance.

1. New panel → **Blog & field notes** → **`EDS - Live Traffic`**.
2. Segment: **`WKND - Inspiration Readers`** on panel or viz.
3. **Freeform table:**
   - **Rows** = **Page** (or **Site section** / **Content type** `eVar3`).
   - **Columns** = **Adventure category** (`eVar4`) as breakdown (drag to column header).
   - **Metrics** = **Page Views**, **Visits**.
4. **Line** or **Key metric summary:** trend **Page Views** over project date range for the segment.

---

#### Panel 9 — Channel × interest

**Goal:** Which channels drive which adventure interests.

1. New panel → **Channel × interest** → **`EDS - Live Traffic`**.
2. **Bar (stacked)**:
   - **Dimension** = **Marketing Channel** (or **Last Touch Channel** if Marketing Channel is empty).
   - **Breakdown** = **Adventure category** (`eVar4`) — drag breakdown into breakdown drop zone on the bar chart.
   - **Metric** = **Visits**.
3. If Marketing Channel has little data, use **Referring Domain** or **Environment** (`prop1`) temporarily ([Phase 0 workaround](#phase-0--report-suite-admin)).
4. **Freeform table** backup: **Rows** = **Marketing Channel** · **Columns** = **Adventure category** · **Metric** = **Visits**.

**Tier 5 segment pairs (optional second table):** columns = `WKND - Search-Driven Adventurers`, `WKND - Social Inspiration Traffic`, etc., rows = **Visits**.

---

#### Panel 10 — New vs returning by interest

**Goal:** Loyalty split within each interest segment.

1. New panel → **New vs returning by interest** → **`EDS - Live Traffic`**.
2. **Freeform table:**
   - **Rows** = **New/Repeat** (or **Customer Loyalty** / **Visitor frequency** — use whichever your suite exposes).
   - **Columns** = **Tier 2** segments (or **Adventure category** `eVar4` if cleaner).
   - **Metric** = **Unique Visitors** (preferred) or **Visits**.
3. **Stacked bar:** **Dimension** = **Adventure category** · **Breakdown** = **New/Repeat** · **Metric** = **Unique Visitors**.
4. **Cohort table** (optional, advanced): **Insert → Cohort table** · retention by **Adventure category** — requires enough return traffic; use 30+ day range.

**Pre-built segments:** `WKND - Returning Adventure Reader` and `WKND - Returning Planner` can be added as extra columns in a second comparison table (Visitor-container segments).

---

#### Panel 11 — Environment QA

**Goal:** Validate preview/staging tagging — **not** for executive reporting.

1. New panel → **Environment QA** — **do not** use **`EDS - Live Traffic`**.
2. Panel filter: **`EDS - Preview Traffic`** (or Quick segment: **Environment** equals `preview`).
3. **Freeform table:**
   - **Rows** = **Environment** (`prop1`) · **Page** (secondary breakdown or separate table).
   - **Metrics** = **Visits**, **Page Views**.
4. **Summary number** tiles for quick totals: **Visits** where **Environment** = `preview` / `local`.
5. Keep this panel at the **bottom** of the project or on a separate **QA** tab so stakeholders do not confuse it with live KPIs.

---

#### Panel 12 — Target (when live)

**Goal:** Personalization performance by archetype (after Target activities deliver impressions).

1. New panel → **Target (when live)** → **`EDS - Live Traffic`**.
2. **Freeform table:**
   - **Rows** = **Target Activities** (or **Target Activity > Experience** under **Analytics for Target**).
   - **Columns** = Tier 4 segments (`WKND - Aspiring Climber`, etc.) **or** breakdown **Adventure category**.
   - **Metrics** = **Visits**, **Activity conversions** (if configured), **Orders** (if applicable).
3. **Bar:** **Target Activities** with **Breakdown** = **Control vs Targeted**.
4. QA segment: **`WKND - Climbing + Preview`** on a **duplicate QA panel** with **`EDS - Preview Traffic`**, not on the exec panel.

---

#### Optional calculated metrics (Components → Calculated metrics)

| Name | Formula (concept) |
|------|-------------------|
| **Planning rate** | **Visits** in segment `WKND - Planners & Prep` ÷ **Visits** (global or live segment) |
| **Inspired-to-plan rate** | **Visits** in `WKND - Inspired → Planning` ÷ **Visits** in `WKND - Inspiration Readers` |

Add these as **Metrics** in **Archetype** or **Journey progression** panels once base tables show non-zero visits.

---

#### Project checklist

- [ ] Project RSID = `ags050wknd`
- [ ] All 12 panels created and titled
- [ ] Panels 1–10 and 12: **`EDS - Live Traffic`** on panel
- [ ] Panel 11: **`EDS - Preview Traffic`** only
- [ ] Tier 2 / Tier 4 segments searchable in picker ([troubleshooting](#workspace-segment-picker-troubleshooting))
- [ ] Date range covers live traffic period
- [ ] **Share** / **Save** project

---

## Order of work

1. Admin renames + filters  
2. Launch property with domains **`aem.page`** and **`aem.live`** only  
3. ACDL extension + Web SDK extension (`alloy`)  
4. **Web SDK Variable** data element + ACDL source elements + page rule → validate in Real-Time / Debugger  
5. `launchUrls` in martech-config → deploy  
6. Interaction rules ([§4d](#4d-interaction-and-navigation-rules)) + [Phase 3 events](#phase-3--events-admin) renamed in Admin  
7. [Phase 4 audience segments](#phase-4--audience-segments-ags050wknd)  
8. [Phase 5 Workspace](#phase-5--workspace-project)  

---

## What stays in code vs Launch

| In code | In Launch |
|---------|-----------|
| Martech, datastream, consent | eVar/prop/event mapping on **interaction** hits |
| ACDL `page` push + `onBeforeEventSend` for **first** page view | Data elements, interaction rules, libraries |
| `launchUrls` embed | ACDL `pageView` rule (optional / supplemental) |
