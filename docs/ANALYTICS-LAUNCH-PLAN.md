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

### Tier 1 — Operational filters (not audience)

Keep these for data hygiene only — apply as Workspace include/exclude, not as “audiences.”

| Segment name | Container | Definition |
|--------------|-----------|------------|
| **EDS - Live Traffic** | Hit | `prop1` **equals** `live` **OR** `Page URL` **contains** `.aem.live` |
| **EDS - Preview Traffic** | Hit | `prop1` **equals** `preview` **OR** `Page URL` **contains** `.aem.page` |
| **EDS - Non-Production (exclude)** | Hit | Preview **OR** Local (`prop1` = `local` / URL contains `localhost`) |

---

### Tier 2 — Adventure interest (core audience)

**Container: Visit** — “Visited at least one page about this adventure type during the session.”

Prefer **`eVar4` equals** when metadata is live. **Fallback** uses `Page URL` / `Page` **contains** (from current WKND blog paths).

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
OR Page URL contains climbing
OR Page URL contains yosemite
OR Page URL contains ice-climbing
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

**Default filters:** Include **EDS - Live Traffic** · Exclude **EDS - Non-Production**

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
