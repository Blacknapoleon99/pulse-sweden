# TryggPuls admin, safety posts, BankID and Foundry setup

## What is implemented

- The web admin page at `/admin` and the mobile app's Profile → Administrationsverktyg both create short-lived map marker drafts. Markers require coordinates in Sweden, an approved Swedish agency source, a source excerpt and a validity end time. A safety notice can remain active for at most 14 days; a service point must be reviewed within 90 days.
- Markers become public only after an editor/reviewer workflow and are automatically hidden and ended when their validity expires. The public map labels them “TryggPuls-granskad kartpost · inte en myndighetsvarning”. They are not an emergency feed, risk score or instruction system.
- Staff access can be configured with `ZONE_ADMIN_TOKENS_JSON`, a server-only JSON array such as:

  ```json
  [{"id":"editor-jk","token":"a-long-random-secret-at-least-24-characters","role":"editor"},{"id":"reviewer-ml","token":"a-different-long-random-secret","role":"reviewer"}]
  ```

  Editors can create drafts. Reviewers can mark drafts reviewed, publish, and end posts. An `admin` role can do both. Audit entries store the configured staff ID. Do not reuse tokens between staff. The older `ZONE_ADMIN_TOKEN` is a full-access compatibility key; remove it from production after individual staff credentials are configured, because it bypasses role separation.

The admin interface accepts typed WGS84 latitude/longitude. It does not yet provide a drawing or click-to-drop polygon editor; official safety zones continue to use the existing GeoJSON form. Production staff should validate coordinates against the linked agency map before publishing.

## BankID

The login and registration screens now offer BankID. The server uses RP API v6.0 and polls `/collect`; the mobile app launches BankID with its autostart token. New BankID users receive an account automatically, without asking for an email address. Existing password accounts are not linked by name or email.

The user’s raw personal number is used only after a successful BankID completion to calculate an HMAC-SHA-256 account key. `BANKID_USER_HASH_KEY` must be a long, randomly generated server secret and must be backed up securely; rotating it breaks the lookup for existing BankID accounts. The raw number is not written to the database or application logs.

The integration is **disabled until server configuration is complete**. To enable test or production:

1. Arrange a BankID agreement with a selling bank or integrator and obtain the corresponding relying-party certificate. BankID states the agreement comes before certificate delivery and implementation; pricing is set by the contracting party.
2. Create and securely deploy the PFX/PKCS#12 certificate file, its passphrase, and a separate `BANKID_USER_HASH_KEY`. Set `BANKID_ENV=test` for BankID's test environment. For live users, set `BANKID_ENV=production` only with the production certificate and contract.
3. Set `BANKID_CERT_PATH`, `BANKID_CERT_PASSPHRASE`, `BANKID_USER_HASH_KEY` and, if required by your certificate chain, `BANKID_CA_CERT_PATH` as server secrets/file mounts. Never add them to Expo `EXPO_PUBLIC_*` variables or the repository.
4. The Render blueprint enables `BANKID_TRUST_PROXY=true` and reads the single-value `CF-Connecting-IP` header supplied through Render's Cloudflare edge. Local/direct deployments should leave it `false`; when using another proxy, change the code to a header that proxy overwrites and validate the origin cannot be reached around it. Set `BANKID_RETURN_URL` to an HTTPS URL only if the BankID order needs a browser return.
5. Start with the test certificate and BankID test app. Do not enable production traffic until BankID's test flows pass and the live credentials are installed.

Official references: [BankID business onboarding](https://www.bankid.com/en/business/channels/web), [RP API version guidance](https://developers.bankid.com/api-references/general-rules), [BankID autostart](https://developers.bankid.com/getting-started/autostart), [PFX certificate creation](https://developers.bankid.com/getting-started/order-certificate/create-file), and [BankID developer portal](https://developers.bankid.com/). BankID has discontinued RP API 5.0 and 5.1; this integration targets v6.0.

## Foundry AIP: what can be pushed

TryggPuls already has an optional server-side adapter that **reads** approved summary rows from a Foundry dataset. The app is not currently writing its live feeds to Foundry. It can be extended to send a deliberately selected set of public agency alerts to Foundry, but only after you configure a service identity/API access and approve the exact public dataset and retention policy. Family records, precise GPS positions and route queries remain outside the pilot.

The Foundry proof of value so far is not a production approval: the AIP Logic evaluation produced usable grades in only 3 of 17 event-summary cases and 3 of 17 advice cases, and 0 of 17 forecast cases. The summary dataset has not been populated with the review set. Do not turn these outputs into user-facing generated safety claims yet. The next step is to load a small, source-preserving set of public alerts, review reference summaries with a person, rerun Evals, then expose only approved outputs through the Node backend with source-text fallback.

This workload does not currently justify reserving two GPUs. The Foundry enrollment's GPU type, quota and price have not been verified, and the pilot can be evaluated with the available hosted AIP model access. See [Palantir assessment](palantir-foundry-aip-assessment.md), [Foundry GPU resource configuration](https://www.palantir.com/docs/foundry/transforms-python/configure-resources), [AIP overview](https://www.palantir.com/docs/foundry/aip), and [external model deployment](https://www.palantir.com/docs/foundry/manage-models/create-a-model-deployment).

## Expo development link

An `exp://…exp.direct` address is generated by the active Expo Metro tunnel. It is not a stable setting in the app or a backend API URL. Start `npx expo start --tunnel` from `mobile/` to generate a current link and keep that process running while using the link. The app's backend remains set by `EXPO_PUBLIC_API_BASE_URL`.
