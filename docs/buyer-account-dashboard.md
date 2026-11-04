# Buyer account dashboard

Implemented route: `/buyer/account`, with `?tab=requests`, `?tab=saved`, `?tab=profile`.
This is the current, deliberately smaller implementation of the `/my` concept in the
November account planning documents. It does not implement all items in those plans.

## Included

- Public header account menu, overview counters from actual data, own request list.
- Links to existing request status pages. No orders, payments, coupons or shipping UI.
- Account-backed saved products, with save controls on product cards and detail pages.
- Account email (read-only) and company name (editable). No changes to CRM business profiles.
- Category-based product suggestions, excluding saved, demo and non-public products.
- EN/VI account UI and responsive sidebar/main/secondary-column layout.
- Existing general-login redirect to home and quote-flow return paths remain unchanged.

Requests are resolved by exact, verified session email across all matching CRM buyer
records. Account IDs, CRM IDs and emails are never accepted from the browser for reads
or writes. Internal RFQ notes and supplier contacts are not rendered in the dashboard.
Saved snapshots are not trusted for display: current public catalogue records are resolved
again. Unavailable products can still be removed. Saving while signed out first requires
sign-in; there is no guest localStorage list or automatic pending save in this version.

The existing `buyer_users.saved` JSON field is reused. Updates lock the account row and
modify only the product list, preserving saved comparisons. The limit is 100 products.
Cards share one account-state provider; it resets when the signed-in email changes and
refreshes on navigation and window focus. A failed write does not change the local state.

## Deployment

Apply `supabase/migrations/20261107_buyer_saved_products.sql` before deploying the code.
It adds a service-role-only RPC, without changing or deleting existing account data.
Prerequisite: the existing `20261105_buyer_accounts.sql` migration and its `buyer_users`
table. An environment missing that prerequisite must apply it first.

No live database migrations were applied during this implementation. In the connected
staging project, a metadata-only check found that `buyer_users` is not yet present.
Do not deploy this dashboard to that environment without the prerequisite migration.

## Checks

- `npm run check:buyer-account`: real async page SSR in EN/VI, action guards, input
  validation, hidden-product removal, request ownership, recommendations, and real
  local-store concurrent/idempotent saves, cap, comparison preservation, duplicate
  CRM profiles, literal wildcard characters in email addresses.
- `npm run typecheck`, `npm run check:entry`, `npm run check:buyer-auth-i18n`,
  `npm run check:product-card`, `npm run build`.
- Browser acceptance on staging: sign in, open the header menu, save from a card and
  a product detail page, check saved products, remove one, change the company name,
  reload and check persistence. Use two distinct verified test accounts to confirm
  isolation. Test the layout on mobile and desktop. These browser checks and live
  PostgreSQL RPC execution remain deployment acceptance steps, not completed tests.

Additional regression runs: platform legal strip, Google legal pages, and sponsored
category slots passed. Three broader existing checks are not green: `check-loading-port`
and `check-supplier-profile-seo` stop at an existing missing price-display mock;
`check-l2-public-scope` still expects a sky-colored verification chip, while the current
shared verification component uses the previously approved navy branding. These paths
were not changed to alter pricing or verification styling for this feature.
