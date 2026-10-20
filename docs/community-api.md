# Community API

All community/account responses use `Cache-Control: no-store` and vary by Cookie/Authorization. Use existing family cookie or native Bearer session; family membership is not required. Mutations require `X-TryggPuls-Action: 1`, same-origin browser requests and JSON except raw image uploads. Expected errors: 400 invalid input, 401 signed out, 403 ineligible/role/suspension, 404 inaccessible/blocked, 409 closed/idempotency conflict, 413 oversize, 415 invalid media/request, 422 text filter, 429 durable contributor limit, 503 unconfigured/disabled.

| Method/path | Body or query |
|---|---|
| GET/HEAD `/api/community-reports` | `limit` 1–100, opaque `cursor`, optional `category`, `bbox=west,south,east,north`, or signed-in `mine=1` (30-day private history) |
| POST `/api/community-reports` | `{requestId,category,title,body,lat,lon,observedAt}`; requestId 20–80 alphanumeric/hyphen/underscore characters; category traffic/disturbance/hazard/other; title 3–120, body 3–600; observedAt ISO within preceding 24h. Returns `{report}` after commit. Stores only a 100m SWEREF/UTM grid center. |
| GET `/api/community-reports/{id}` | `{report}`; resolved discussions are read-only until expiry; only author sees expired/removed private history |
| POST `/{id}/resolve`, DELETE `/{id}` | Author only, `{}`; closes discussion; delete removes public visibility and queues media deletion |
| GET `/{id}/comments` | `limit`, opaque `cursor`; chronological `{items,nextCursor,closed,fetchedAt}` |
| POST `/{id}/comments` | `{requestId,body,parentId?}`; root parent only; same contribution eligibility; returns committed `{id}` |
| POST `/{id}/photo` | Raw JPEG/PNG/WebP bytes ≤5MB, one photo, not multipart. Returns pending; actual content decoded, resized ≤1600px and stripped of metadata. Retry identical sanitized bytes returns prior state. |
| GET/HEAD `/{id}/photo` | Sanitized JPEG, approved only and report accessible; public pending/rejected is always 404, including author |
| DELETE `/api/community/comments/{id}` | Author only, `{}`; tombstones body, preserving reply structure |
| GET `/api/community/me` | Private alias/eligibility state |
| POST `/api/community/eligibility` | `{atLeast16:true,rulesVersion:"2026-09-29"}` |
| POST `/api/community/flags` | `{targetType:"report"|"photo"|"comment"|"author",targetId,reason}`; signed-in abuse reporting, unique flag per target/reporter |
| GET/POST/DELETE `/api/community/blocks` | Mutation `{authorKey}`; persistent bidirectional visibility/interaction block for community only |
| GET `/api/admin/community` | Reviewer/admin queue, public-alias evidence and audit; no emails/family names |
| GET `/api/admin/community/reports/{id}/photo` | Authenticated reviewer/admin private preview |
| POST `/api/admin/community/actions` | `{action,targetId,reason}`; approve-photo/reject-photo/remove-report/remove-comment/suspend-author/restore-author/dismiss-flag/action-flag; author targetId is public authorKey |
| GET `/api/account/config`, `/api/account/me` | Public configured feature flags; private account plus community eligibility |
| POST `/api/account/verification/request` | Signed in `{}`; sends one-use link |
| POST `/api/account/password/request` | `{email}`; same public response for known/unknown accounts |
| POST `/api/account/verification/confirm` | `{token}` |
| POST `/api/account/password/confirm` | `{token,password}` (12–200 chars); revokes sessions and native devices |
| DELETE `/api/account` | `{}`; deletes account/community data; transfers family creator role to next member |
| POST/DELETE `/api/account/notifications` | `{token,alarms:boolean,replies:boolean}` / `{token}`; opt-in native device |
| GET `/api/account/alarms/{id}/delivery` | Sender only: recipient provider delivery state/error; separate from family acknowledgement |

The report DTO fixes `origin:"community"`, `verification:"unverified"`, `label:"Obekräftad användarrapport"`; location includes `precisionMeters:100`; lifecycle is active/resolved/expired/removed; photo review state never verifies a report. Exact input coordinates, internal author ID, private names, email and object keys are excluded. Photo approval changes only image visibility. Default durable contribution limits: 3 reports/hour, 10/day, 10 comments/minute. Report/comment request IDs are unique per author; changing payload for a reused ID returns 409. Account/rule eligibility and ownership are enforced server-side on every write.

Server text filtering is a conservative configurable first pass, not a claim that abusive text can be perfectly recognized. Staff must review reports/flags, expand blocked terms carefully, and reject identifiable people/personal details in photos. Report content/comments/media purge after 30 days; moderation audit after 90 days; deletion and recovery of provider backup copies follow the separately configured backup policy.
