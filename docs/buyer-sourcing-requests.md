# Buyer sourcing requests

The public **header** action is now “Sourcing request” / “Yêu cầu tìm nguồn”. It authenticates through the existing minimal buyer modal before displaying a bottom-right composer. Product/supplier quote and question entry points remain RFQ flows.

## Separation and workflow

- POST `/api/buyer/sourcing` stores a `sourcing_requests` record, never an RFQ, RFQ match, supplier invitation or supplier email.
- Only nonempty content is required (max 6,000 characters). Verified buyer identity is read server-side, not from submitted fields. Optional attachments: three files, max 2 MiB each, PDF/JPEG/PNG/WEBP checked by byte signatures. This is not antivirus scanning.
- CRM `/crm/sourcing` is a separate inbox, available to existing `rfq.view` staff; edits require `rfq.manage`. Suppliers have neither access. Assign only active staff with manage permission. New / In progress / Needs information / Closed; a buyer-visible latest response is required for Needs information. Internal notes are never rendered in buyer history/details. This is not a chat thread and does not promise email notification.
- CRM sidebar and bell count **new** sourcing requests independently. Existing topbar refresh updates counts. Unavailable sidebar counts show `!`, not a false zero.
- Buyer My enquiries includes a separate, clearly labelled sourcing section and account-owned `/buyer/account/sourcing/[id]` details. Exact normalized verified email ownership is required. No anonymous tracking-token access.
- Optimistic version checks prevent stale staff forms overwriting newer updates. Buyer-scoped submission UUIDs deduplicate retries, including concurrent inserts via the database unique constraint. Composer drafts remain in component memory when closed or when delivery fails; they are not persistent browser/server drafts.

## Private files

`storage.buckets.sourcing-files` is private, with no client policies. File content is served only via `/api/buyer/sourcing/[id]/files/[fileId]` after verified owner or authorized staff checks. Downloads use attachment disposition, no-sniff, sandbox and private/no-store headers; there are no public file URLs. Paths are opaque request/file UUID pairs. Incoming multipart bodies, including chunked requests, are bounded at 7 MiB before parsing. Same-origin and the sourcing-specific proof-of-work/rate-limit policy protect submission.

Uploads precede the database insert. Known pre-insert failures clean staged files; concurrent duplicate insert losers clean only their own unused files. If an insert result is uncertain, uploaded files are retained deliberately to avoid breaking a request that committed. This can leave orphan objects; reconcile against saved attachment keys before any future cleanup. No destructive automatic orphan cleanup or historical backfill is included.

## Rollout prerequisite

Apply `supabase/migrations/20261104_buyer_sourcing_requests.sql` **before deployment**, after the base schema containing `app_users`. It creates the independent table/indexes, enables RLS/revokes browser roles, grants server service-role access and creates/restricts the private bucket. The migration has not been applied to a live database in this coding session.

Sourcing uses the configured Supabase adapter directly, with **no live-to-local fallback**. Missing table/bucket, bad credentials or a network failure returns a real error, retaining the draft; never fake delivery. Local disk storage is supported only when Supabase is unconfigured and the runtime is development. An unconfigured production runtime fails closed. Buyer dashboard sourcing-read failures are isolated so existing RFQ history still works.

## Validation

- `npm run check:sourcing`: actual route handlers with mocked external dependencies; bounded-file policy, byte types, owner spoof rejection, same-origin, auth, rate limit, buyer-scoped dedup, private owner/staff downloads, failed insert and RFQ separation. Actual React DOM composer tests cover login-first, bottom-right classes, short content, failed-send draft retention, stable retry key, success/history and close/scroll cleanup.
- `npm run check:buyer-account`: actual EN/VI buyer page/history privacy, existing owned enquiry/auth suites and real local-store sourcing ownership, dedup, optimistic updates and durable-write rollback (mock filesystem).
- `npm run check:rfq`, typecheck and production build for regression coverage.

Live Supabase storage/RLS, production identity providers and deployment are not validated by these local tests. No production data, supplier messages or database migrations are sent automatically.
