# Product-addressed RFQs: delivery and notifications (historical)

> **Historical implementation note; do not follow its email fallback, CRM retry,
> single-supplier or Reply-To instructions for new RFQs.** The current direct
> flow supports multiple selected suppliers through their approved portals;
> Vexim does not dispatch or manage direct transactions. See the
> [current RFQ runbook](./rfq-van-hanh.md).

## Bugs fixed

1. CRM RFQ detail passed an inline `onChange` from a Server Component into an interactive select. The field is now a small client component receiving only serializable status/options; existing server actions retain all authorization. The dispatch form also contained nested quote/status forms. Those forms are now siblings; dispatch checkboxes bind to the outer dispatch form by `form="rfq-dispatch"`.
2. Preferred supplier matches used to remain `proposed`, while supplier dashboard/notifications deliberately exclude proposed matches. A clean, validated product-addressed quote now creates the match and publishes it durably to that supplier's private portal.
3. CRM never included RFQs in its bell/sidebar queues, and the supplier sidebar had no RFQ task badge. Both now have one. The supplier's existing scoped notification feed supplies the badge count; polling updates the badge and refreshes server-rendered dashboard KPIs when the count changes.

## Routing safeguards

`lib/rfq/submit.ts` resolves the source product from the existing published buyer catalog. If supplier IDs were omitted, it derives the owner from that product and confirms the owner is publicly listed. It never infers attribution from the buyer's free text. An explicit mismatching supplier cannot claim that source product. Duplicate preferred IDs are removed.

`releaseTargetedQuoteToPortal` only releases a `new` quote with a validated source product and exactly one preferred supplier. That supplier must be published and approved for portal access. General RFQs, profile-only requests, multi-supplier requests, questions, spam, moderation-required and unapproved suppliers retain the existing review flow. Staff still control manual dispatch and its staff-sender authorization.

Before publishing, verify that the existing invitation/read-receipt migrations can be read. Failure leaves the saved RFQ/match available to staff, not a false successful portal delivery. No new migration is introduced. The existing portal migration is required.

On release, write a real `sent_to_supplier` match, portal-delivery timestamp, three-day response deadline and `matching` RFQ status. This is **in-app delivery**, not a fabricated SMTP success. The supplier task/report/bell are derived from that match.

An anonymised email copy is sent by the configured system `FROM_ADDRESS`, not a fabricated employee identity. Reply-To uses the existing RFQ match routing address. Buyer contacts and unshared target prices remain protected by the existing email builder. The actual email outcome is logged independently; a failure/simulated send has no email `sent_at` and does not retract the already-available portal invitation. The staff can see/retry delivery from CRM. Repeated processing of an already released match does not send another initial copy.

## Queues and refresh

- CRM: permission-gated `countPendingRfqs()` counts new/review/in-progress/matching RFQs; both sidebar and bell receive that same count. Supabase uses an exact head-count, not a truncated 1,000-row list. Existing CRM refresh cadence is 30 seconds and window focus.
- Supplier: invitation ownership filtering and private projection stay in the existing dashboard model. The notifications endpoint adds `pendingRfqs` and `rfqsKnown`. Sidebar uses the same 20-second/focus polling response as the bell, not a second data reader. A failed RFQ read is shown as unknown (`!`), not a fake zero. New counts trigger dashboard refresh.
- Read receipts, task counts and delivery counts remain distinct: marking a notification read does not mark an RFQ answered.
- Direct product questions keep their separate email/consent flow and are not silently converted into quote tasks or quote-report metrics.

## Verification and rollout

`check:rfq` now includes real React DOM notification UI tests, server-page event-handler/nested-form AST checks, targeted publisher + dashboard + notification API integration checks, and the existing supplier-dashboard/security suite. Coverage includes approved-owner isolation, source-owner recovery, moderation/migration gates, one-time publication, genuine mail status, anonymised routing, badge/bell updates and dashboard refresh.

Existing historical `proposed` matches are **not automatically bulk-published or emailed**. Staff can use the repaired CRM dispatch controls to review and send those records. No live database records or mail were modified during testing. Production deployment and real sender/provider validation remain separate steps.

Local verification: `check:rfq`, `check:buyer-account`, `check:entry`, `check:i18n`, TypeScript, UI copy, email copy, portal notice links/resilience and production build passed. One additional older `check-supplier-portal-shell.mjs` check still expects the old profile label “Công suất mỗi tháng”; it stops on that unrelated label assertion after its sidebar render checks. The supplier profile form was not changed for this fix. Actual production data, live SMTP and provider configuration were not exercised.
