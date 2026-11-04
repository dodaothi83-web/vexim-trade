# Account-owned enquiry links

## Decision

The user approved keeping “View enquiry” links but making the buyer account the authority for access. All new quote/question confirmations, dashboard cards, buyer status emails and buyer quote-comparison emails link to:

`/buyer/account/requests/[rfq-id]`

The path contains no bearer token. Knowing an ID is not sufficient to view a request. New links in CRM point to the same protected buyer view, not a staff bypass; staff continue to manage RFQs through CRM.

## Access

`lib/buyer/enquiry-access.ts` is server-only and shared by the new detail page and legacy redirect route:

1. Require a signed buyer session, preserving the exact return path through sign-in.
2. Require a verified buyer account matching that session email.
3. Resolve the request by ID or legacy token.
4. Resolve its linked CRM buyer and require the same normalized, exact email.
5. Render only after the check succeeds. Wrong owners, missing/orphan records and accounts that are not verified receive the same generic unavailable response, never a preview of the request.

No ownership inference from company name, contact name, CC recipients or possession of a token. Both RFQs and supplier questions use the same rule. Existing exact-email history lookup is unchanged. Both routes are dynamic and noindex/nofollow.

## Legacy email links

`/rfq/status/[token]` remains a functioning entry point. It requires sign-in **before looking up the token**, checks ownership, and only then redirects to the new detail page. It never renders the old anonymous status view.

Older records whose email still matches a newly verified account work without migration. Records with missing/mismatched email cannot be claimed automatically. The generic unavailable page directs the user to their account menu and Vexim support for manual ownership verification; no automatic reassignment or historical rewrite is performed. CC recipients are not automatically made account owners.

## Presentation

The existing status/details presentation is extracted into `components/buyer-enquiry-detail.tsx`, preserving genuine quote/question status meanings, submitted information and the warning that supplier-question replies go to email rather than a new chat inbox. Add an All enquiries link. Remove “without logging in” and “private unique link” claims. Question-success UI also links to all enquiries.

The client result field remains named `statusPageUrl` for compatibility but now points to the protected dashboard detail. Stored access tokens are retained solely for backward-compatible redirects; new buyer emails and links no longer expose them. Spam/quarantine acknowledgement suppression remains unchanged.

## Tests and rollout

`npm run check:buyer-account` runs the access tests plus the existing modal, dashboard and local-store ownership checks. Tests exercise anonymous/staff-only denial before lookup, exact-email owner access, wrong owner with valid ID/token, unverified accounts, missing records, orphan CRM buyers, legacy redirect, private field non-rendering and noindex metadata. RFQ tests assert updated submission destinations and real question/status-email HTML links without legacy tokens.

No database migration, live email or remote configuration change is required. Real provider/mail delivery testing still needs an authorised configured environment. These changes are local until reviewed and deployed.
