# Account identity-linking preference

The existing `/account` block adds an optional identity-linking section only after restoring the
signed-in profile and selecting an enabled, exact-origin configuration in
`scripts/id-linkage-config.js`. Production is enabled only on `https://wknd-adventures.run.place`;
the default Stage configuration remains OFF. Environment configurations stay separate.
No authoring change is required: the `commerce-account` block retains its empty cell.

The project owner has approved implementation for Stage and Production; legal review is not a
project prerequisite. Operational approval is not shopper consent. Each shopper must explicitly check
the separate identity-linking checkbox and choose **Allow identity linking**. Email preferences and
sign-in never grant it. **Withdraw permission** remains available without enabled grant wording.

## Configuration and activation

For each environment, supply an exact origin list, its own Runtime diagnostic endpoint, the consent
wording, and the wording version enabled by that backend. Production's site origin is
`https://wknd-adventures.run.place`, not the EDS live backend hostname. The endpoint must be HTTPS,
under `adobeioruntime.net`, at `/api/v1/web/commerce/target-diagnostic`, without URL credentials,
query or fragment. Stage requires a `-stage` Runtime namespace; Production refuses that namespace.
An empty or disabled config makes no consent, authentication or diagnostic requests.

The action must independently verify its platform namespace/environment, Auth0 token, shopper
allowlist and wording version. Its exact CORS origins must match the storefront config. Backend flags
and final inputs cannot be overridden by this UI.

Production uses its own Commerce diagnostic action and environment-isolated consent records.
Enabling the account section does not grant permission, activate an audience, or authorize a discount.
The backend must independently enable its consent wording and identity-linking configuration;
unavailable configuration is surfaced as an error rather than a successful grant.
The proposed wording version is `wknd-id-linkage-v1`. It describes cross-channel identity linking for
personalization and audience measurement; it does not promise a discount or infer email permission.

## Requests and errors

The UI calls only `consent-status` and `consent`, using the existing Auth0 SDK for an access token.
It never calls `decide`, sends Adobe IDs, stores membership, or authorizes offers/discounts.
Tokens are not logged or put in URLs. Requests have an eight-second timeout and do not automatically
retry a mutation: a timeout can mean the server committed before the response was lost.
The response must match the configured environment and carry `evidence:false` and
`financialAuthorization:false`; mismatched or missing metadata is rejected rather than confirming
another environment's consent. This requires the Production-capable Commerce diagnostic contract.
Failed/unknown status never appears as denied or granted. Errors remain visible and the shopper can
reload status; no preference is changed optimistically. Server and SDK error text is not echoed.

## Validation

`node --test tools/tests/id-linkage-consent.test.mjs` runs real Chromium against local fixtures with
mock authentication and responses. It makes no live Auth0, consent, Adobe or Commerce calls.
Coverage includes OFF behavior, Production/Stage endpoint isolation, explicit grant, independent
withdrawal, unavailable/malformed responses and responsive layout. The authored account fixture is
`drafts/tmp/id-linkage-account.plain.html`.
