---
name: ew-send-to-adobe-target
description: >-
  Guides authors to export AEM Edge Delivery pages or fragments to Adobe Target
  using the Send to Adobe Target library extension in Experience Workspace. Use when
  the user asks to send to Target, export to Adobe Target, create or update a Target
  offer, delete a Target offer, or fix errors from the Target extension in EW chat.
  Does not use local scripts, da-auth, or .hlx tokens.
license: Apache-2.0
metadata:
  version: "1.1.0"
  environment: experience-workspace
---

# Send to Adobe Target (Experience Workspace)

Help authors export the **currently open** DA page or fragment to Adobe Target as an immutable HTML offer, using the in-browser **Send to Adobe Target** extension — the EW equivalent of [Prepare → Send to Adobe Target](https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target).

## Runtime constraints (read first)

This skill is for the **Experience Workspace agent**, not a local IDE agent.

| Available | Not available |
|-----------|----------------|
| User’s EW session (Adobe IMS already signed in) | Running `node`, shell scripts, or repo CLI tools |
| **Library → Send to Adobe Target** extension UI | Reading `.hlx/.da-token.json` or running **da-auth** |
| Coaching, checklists, troubleshooting | Calling `ims-na1.adobelogin.com` or `mc.adobe.io` directly from chat |

**The agent cannot perform the export.** It guides the author through the extension and interprets errors.

## When to use

- “Send this to Target” / “export to Adobe Target” while editing in EW
- Creating or updating an offer from a **page** or **fragment** (e.g. `/fragments/columns-featured`)
- Deleting a linked Target offer
- Extension errors: preview URL, CORS, missing config, empty `<main>`

## Prerequisites (confirm with the author)

Ask or verify before guiding export:

1. **Target credentials in DA** — Sheet `adobe-target` under the site’s `/.da` folder with `tenant`, `clientId`, `clientSecret`. Open in DA: `https://da.live/#/{org}/{site}/.da` → sheet **adobe-target**. Do **not** preview or publish this sheet.
2. **Library extension registered** — Site config **library** tab includes **Send to Adobe Target** pointing at the project’s `tools/adobe-target/adobe-target.html` on the preview host (code bus on `main`).
3. **Code synced** — After extension fixes ship, author may need a hard refresh in EW (~2–5 minutes after merge to `main`).
4. **Document previewed** — The page or fragment must be **previewed** in DA (export uses preview HTML).
5. **Supported content** — Pages and fragments only (not sheets or media).

**This site:** org `znikolovski`, site `masterclass-demo`, preview host `https://main--masterclass-demo--znikolovski.aem.page`.

## Author workflow (what you guide)

Walk the author through these steps in order:

1. **Open the document** in Experience Workspace (page or fragment they want to export).
2. **Preview** the document if it is not already on the preview tier (Sidekick / publish flow — use EW UI labels the author sees).
3. Open **Library** (sidebar).
4. Select **Send to Adobe Target** (fullsize dialog).
5. In the dialog:
   - If an offer is already linked, they see **Update offer** or **Delete offer**.
   - Otherwise enter an **offer name** (suggest a clear name from the path, e.g. `Columns Featured` for `/fragments/columns-featured`).
6. Click **Create offer** or **Update offer**.
7. Wait for success message; the extension writes `adobe.target.offerId` into the document **metadata** block.

### Suggested offer names

| Source path | Suggested name |
|-------------|----------------|
| `/fragments/columns-featured` | Columns Featured |
| `/index` | WKND Homepage |

Adjust if the author prefers their Target naming convention.

## Agent workflow (EW chat)

Use this checklist in the conversation — do not run terminal commands:

```
- [ ] Confirm which document is open (page vs fragment path)
- [ ] Confirm document is previewed
- [ ] Confirm adobe-target sheet exists in /.da (ask if unsure)
- [ ] Guide: Library → Send to Adobe Target
- [ ] Confirm offer name or update/delete intent
- [ ] If error: map to troubleshooting table below
- [ ] On success: remind author offer lives in Target; DA is source of truth
```

**If the author asks you to “do it for them”:** Explain that export runs only inside the extension in their browser session; provide the numbered steps above and stay on the thread while they click through.

## What gets exported

Per [DA documentation](https://docs.da.live/administrators/guides/prepare-menu/send-to-adobe-target):

- HTML inside **`<main>`** from the **preview** URL (undecorated section markup)
- Offer type: immutable **XF HTML** offer in Adobe Target
- DA stores `adobe.target.offerId` in a **metadata** table on the same document

## Troubleshooting (extension messages)

| What the author sees | What to tell them |
|----------------------|------------------|
| Preview did not return a URL | Ensure the doc is **previewed**; retry after preview completes. Extension expects `preview.url` from the preview API. |
| CORS / IMS token failed | Hard-refresh EW so the latest extension loads (uses DA **ETC CORS proxy**, not direct IMS). Confirm code sync on `main` completed. |
| Could not load `/.da/adobe-target.json` | Add or fix the **adobe-target** sheet under `/.da` with tenant, clientId, clientSecret. |
| Preview HTML has no `<main>` | Open the preview URL in a tab and confirm the page renders a full document; fragments should still include `<main>` on preview. |
| Extension / dialog 404 | Library path must resolve on preview host: `…/tools/adobe-target/adobe-target.html`. Wait for code sync, then hard-refresh. |
| Could not connect to the editor | Reload EW; reopen the document; open the extension again from Library. |

**Do not** suggest local token files, `da-auth`, or Node scripts to EW authors.

## Classic DA (optional)

If the author also uses classic Document Authoring, the same flow exists under **Prepare → Send to Adobe Target** (OOTB plugin, no custom path). EW uses the **Library** entry instead because there is no Prepare menu.

## Security reminders (tell admins, not secrets)

- `clientSecret` belongs only in the unpublished `/.da/adobe-target` sheet
- Never paste credentials into chat
- Offers in Target are immutable; update/delete from DA or the extension, not by editing HTML inside Target

## After export — delivery handoff

Export is only step 1. Tell the author what happens next (you cannot run Target MCP from EW):

1. **Page zone** — On the target page, open **Section metadata** on the section to personalize:
   - **Target zone**: On
   - **Target location ID**: e.g. `hero-mbox` (stable; used in Target CSS selector)
2. **Page metadata** — Set **Adobe Target** = **On** only while an activity is live on that page.
3. **Default content** — Keep a fragment block in the zone as control/fallback content.
4. **Target activity** — Human or **Claude with Target MCP** creates the activity (selector `#hero-mbox`, assign exported offers). Full plan: [docs/TARGET-PERSONALIZATION-PLAN.md](../../../docs/TARGET-PERSONALIZATION-PLAN.md).
5. **Claude skill** — `adobe-target-personalization` for activity/audience setup when the author leaves EW.

**Performance reminders for authors:**

- Export **HTML offers**, not links to `/fragments/...` in Target.
- One zone per personalized region; avoid whole-page Target unless necessary.
- Turn **Adobe Target** page metadata **Off** when the test ends.

## Out of scope unless asked

- **Creating Target activities** — Claude + Target MCP or Target UI (see plan above)
- **Fragment inclusion** on pages — use the Fragment block / Fragment Picker, not this skill
