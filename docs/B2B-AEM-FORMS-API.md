# AEM Forms API — wknd-business (mandatory research)

Author: `author-p115476-e1135027.adobeaemcloud.com`  
Program: A Perfectr Circle (p115476-e1135027)

## Key finding

**There is no public REST API to create Adaptive Forms on AEM as a Cloud Service.** The AEM MCP on this program exposes page, fragment, asset, and publishing capabilities only — not forms authoring.

## What works today

Document-based sheet JSON in [`forms/`](../forms/) rendered by the EDS `form` block:

```bash
npm run b2b:forms
```

## Runtime API (direct HTTP, not MCP)

Base: `https://{author|publish}-p115476-e1135027.adobeaemcloud.com/adobe/forms`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/adobe/forms/` | List forms |
| GET | `/adobe/forms/{formId}` | Get definition (Base64URL JCR path) |
| POST | `/adobe/forms/af/submit/{id}` | Submit |

`formId` = Base64URL of `/content/forms/af/{name}`.

### EDS form block URL after authoring

```
https://publish-p115476-e1135027.adobeaemcloud.com/content/forms/af/wknd-business/wknd-contact-b2b/jcr:content/guideContainer.model.json
```

## Creation options

### 1. Forms Manager UI (recommended)

1. **Experience Manager → Forms → Forms & Documents**
2. Folder: `/content/dam/formsanddocuments/wknd-business`
3. **Create → Adaptive Form** (Core Components blank template)
4. Add fields per [`form-sheet.mjs`](../tools/scripts/lib/form-sheet.mjs)
5. Configure submit action
6. Publish

### 2. MCP publish (after UI creation)

```javascript
// write-api with confirmed: true
return await aem.post(
  '/adobe/experimental/aemmcpserver-expires-20991231/publish',
  { path: '/content/forms/af/wknd-business/wknd-contact-b2b' }
);
```

### 3. Package import

Export ZIP from another env → **Create → File Upload** in Forms Manager.

### 4. Early-adoption Java API

`CoreComponentFormGenerator` — server-side only, not HTTP. Request early access from Adobe.

## Three forms — field specs

| Form | Slug | Site |
|------|------|------|
| Contact B2B | `wknd-contact-b2b` | wknd-business |
| Adventure interest | `wknd-adventure-interest` | masterclass-demo |
| Adventure interest B2B | `wknd-adventure-interest-b2b` | wknd-business |

Full field lists: [`tools/scripts/lib/form-sheet.mjs`](../tools/scripts/lib/form-sheet.mjs)

## Migration from sheet JSON to AEM forms

1. Create forms in Forms Manager
2. Publish to publish tier
3. Update `FORM_URLS` in [`seed-b2b-da.mjs`](../tools/scripts/seed-b2b-da.mjs) to `guideContainer.model.json` URLs
4. Re-run `npm run b2b:seed`

## Blockers

| Blocker | Mitigation |
|---------|------------|
| MCP has no forms create endpoints | UI or package import |
| `/adobe/forms/*` blocked in MCP read-api | Direct curl with IMS token |
| No public create REST API | Early-adopter Java SDK or UI |
