# Grades in product names

Product names may contain one or multiple grade codes. A name is descriptive text, not the source of truth for the structured grade/price table. Vexim connects parties for quotation and direct negotiation; this change does not turn reference prices into binding offers or add transaction functionality.

## Changes

- Supplier create/edit and submit actions no longer reject a name because it contains category grades.
- Both quantity-entry validators accept grades in Vietnamese/English product names. Structured grade validity, currency, units, quantity/price tiers, price guardrails, consent and ownership checks remain unchanged.
- The supplier editor no longer marks names invalid for containing grades. EN/VI hints permit grades, and example names include multiple grades.
- AI translation preserves source grade codes instead of rejecting translated names that contain them. Empty-name rejection and stale-write guards remain. No grade code should be invented by the translation prompt.
- CRM can save an English name containing grades. Existing management permission, authentication and audit requirements remain.
- Shared public product cards no longer strip grade codes from names or title tooltips. This covers callers on home, category, search, storefront and sponsored listings. Grade chips are not reintroduced.
- Search ranking still treats structured grades as authoritative when there is a conflict with title text. Existing grade filtering and pricing projections are unchanged.

There is no single-grade restriction and no requirement that every title code match the currently selected structured grade. The structured table remains a separate field. Existing length, required-field, translation, review and publication requirements still apply.

## Existing data and rollout

No schema migration, backfill or remote data update is required. Existing stored names are not rewritten. If an existing English/display name does not contain a grade, this change does not invent or append one; users can edit/review it through the existing flow.

`npm run check:product-names` checks both quantity validators, AI translation and CRM edits, supplier create/edit/submit with multiple grades, unchanged pricing/security guards and grade-preserving card titles. The command is included in CI. Product translation, search relevance, grade pricing, supplier wizard, i18n, copy, TypeScript and production-build checks provide additional regression coverage.
