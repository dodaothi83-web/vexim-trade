# Quantity pricing previews

Both switches are off by default. Do not enable either on a public production deployment: this is an incomplete, opt-in staging experiment, not the final cutover.

- `VEXIM_QUANTITY_PRICING_PREVIEW=true` exposes an internal supplier editor link for signed-in, approved suppliers and their own eligible products. Submissions write real pending revisions to the configured database and are reviewed in the separate CRM queue. Use a dedicated staging database and test accounts.
- `VEXIM_QUANTITY_BUYER_PREVIEW=true` makes the shared category and ID-based catalog reads use approved quantity-price revisions when present. Home, search, category cards, product detail and comparison use those projected records. This changes the ordinary buyer pages and is **not** an access-control mechanism. Only enable it in an isolated, non-public staging environment.

Only approved revisions are projected; a pending revision never replaces one. The current supplier public-price consent gate is still applied. New approved prices remain visible past the configured staleness threshold, but do not contribute to category reference ranges or price ranking. When no new approved price exists, the legacy projection is retained. Errors reading settings or revisions fail closed rather than silently exposing an older price.

The supplier storefront has a separate legacy projection and is not yet switched. The main supplier form still uses legacy pricing, and normal versus abnormal automatic approval, English-name translation, product-family cloning, reminders, confirmation and promotions are not complete. Names without an approved new English revision currently keep the existing public name, which may contain a legacy grade. No production cutover should occur until all buyer paths, naming, edit and review workflows are consistent and end-to-end tests have passed against staging.
