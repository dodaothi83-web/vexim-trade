# Vexim interface identity

## Approved decision

The user approved **direction 02** on 2026-11-04: softer geometry, restrained duotone navy, less detail and more breathing room. Direction 01 was rejected as too similar to a generic outline-icon library. Do not revert to it or independently invent a replacement style during feature work.

Approved visual reference: `docs/brand-preview/index.html`. The previous proposal remains at `docs/brand-preview/direction-01.html` for comparison, not for implementation.

## Canonical implementation

- React source: `components/brand/vexim-icons.tsx`.
- Standalone SVG exports: `public/brand/vexim/`.
- Original logo remains `public/logo-vexim.png` / `public/logo-vexim-white-mark.png`. Do not redraw the V, replace it with an icon, or change its proportions.
- Palette remains `lib/brand/colors.json`, generated into `app/brand-colors.css`. Navy 700 is `#1F3E74`. Use existing semantic success/warning/error colours, not a new palette.
- Keep the site's existing Be Vietnam Pro typography. The standalone design study uses system fonts for convenience; do not bundle Apple's fonts or copy Apple marks/symbols.

## Visual rules

1. Softly rounded geometric forms; 48 x 48 source grid and rounded strokes.
2. A restrained translucent fill follows `currentColor`. No hard-coded approval green inside the artwork and no gradient/shadow/3D decoration.
3. Keep business labels neutral, modestly rounded and next to readable text. Do not turn every piece of metadata into a verification badge.
4. Retain accessible names, keyboard focus and semantic status colours. Do not rely only on the icon or colour to explain a check.
5. Use the domain set for business concepts. Keep familiar standard icons for search, close, arrows, edit, download, printing and other ordinary controls.
6. No decorative yellow. Green means a real completed/approved state, not a more prestigious supplier type.

## Meaning and usage

| Export | Meaning | Do not imply |
|---|---|---|
| VeximFactoryIcon | Manufacturer business type | Factory inspection or ownership approval |
| VeximTradeIcon | Trading/supplier account context | Manufacturer status |
| VeximCooperativeIcon | Cooperative business type | An approved check or a mandatory agricultural category |
| VeximDocumentIcon | Business documents, neutral by default | Document approval |
| VeximDocumentCheckedIcon | An actually approved document check only | General company reliability |
| VeximInspectionIcon | Factory/production-source review category | Automatically approved or necessarily an on-site visit |
| VeximDeliveryIcon | Delivery/export evidence review category | Vexim shipping goods or guaranteeing delivery |

`supplierTypeIcon` maps manufacturer/trading/cooperative separately. An unknown type uses a neutral document symbol, never defaults to a manufacturer. The cooperative sprout is the accepted direction, but text must remain next to it so non-agricultural cooperatives are not excluded by imagery.

The preview's document mark included a completion tick. Production has a neutral variant for unapproved/unknown/category contexts and an explicit checked variant for approved documents. This is a semantic safeguard, not a change in verification policy.

## Application in this change

The shared domain set is used in account entry/registration, public supplier type labels and verification descriptions, product-detail supplier fallback, supplier verification tabs/overview/panels/documents, and CRM verification/certificate/supplier sections. Existing text, scopes and routes remain unchanged.

The **small circular shield pips, cover seals, tier badges and their restored borders/backgrounds are retained**. The tiny pips are a deliberate compact exception: the 48px domain art is too detailed at a 10px glyph size. Do not remove their circles or silently convert every shield into a factory. Their existing status mapping and tooltips remain authoritative.

This is not a global change to every card, button, heading, company-building icon, category illustration or document attachment icon. Replace semantic instances deliberately, not by a repository-wide name replacement. Provider contracts and historical records do not change.

## Keeping the decision

- New domain UI should import the approved React icons instead of reaching for a default Factory/FileCheck/Truck icon.
- Maintain the meaning distinction between supplier type and approved checks.
- For new concepts, extend this same style and obtain visual approval before introducing artwork.
- Update source, SVG exports, brand checks and this guide together if the approved shapes change.
- Run `npm run check:brand` plus the affected UI tests and TypeScript.

The design-study company and verification results are illustrative only. They are not production facts and must never be imported as supplier data.

## Verification notes for this rollout

Passed locally: brand vectors/export/accessibility checks, palette check, account-entry checks, supplier-profile checks, portal/auth i18n, UI copy, TypeScript, production build, supplier storefront SSR, supplier detail layout, verification-pages checks, product comparison, inline-audit evidence, category-request checks and supplier self-verification checks.

Additional older checks are not all green: `check-display-name.mjs` expects an old catalog call signature; `check-l2-public-scope.mjs` expects old per-level sky colours instead of the existing shared success colour; `check-supplier-category-picker.mjs` omits required intro data; `check-supplier-account-ui.mjs` lacks its Google icon mock; `check-product-raw-material-profile.mjs` lacks an i18n mock. These assertions/fixtures are not rewritten to claim a full-suite pass. The palette, catalog, picker, signup form and raw-material component behind those failures were not changed in this rollout.

Production deployment and device-level visual review remain outstanding. No remote configuration, database migration or live records were changed.


## Commercial facts extension (approved 2026-11-04)

The user requested six matching direction-02 icons with slightly bolder strokes to balance the adjacent text. These are neutral commercial facts, not completed checks:

| Export | Fact |
|---|---|
| VeximMinimumOrderIcon | Minimum order — rounded carton |
| VeximExportPortIcon | Export ports / Incoterms — rounded vessel |
| VeximLeadTimeIcon | Lead time — clock |
| VeximCapacityIcon | Monthly capacity / annual output — rounded capacity columns |
| VeximPaymentIcon | Payment terms — neutral payment card (does not imply supported payment methods) |
| VeximMarketsIcon | Export markets — globe |

Use the same 48px grid, 0.09 duotone fill, rounded caps/joins and currentColor. In the shared supplier storefront commercial facts only, render at **20px with source strokeWidth 2.6** (rather than the original 16px slot / 1.8 stroke), retaining navy and adjacent readable labels. Do not globally thicken the existing six business/verification icons or change generic action/status icons. The capacity icon covers both annual and monthly branches without changing their data selection. All text, stored values, fallbacks and permissions remain unchanged. The supplier portal preview uses the same component as the public profile.

## Vexim shield study (2026-11-04 — visual approval pending)

The user requested a proprietary Vexim shield following the proposed soft shape and negative-space V. Review page: `docs/brand-preview/shield.html`; component: `components/brand/vexim-shield.tsx`; SVG exports: `shield-compact.svg` and `shield-duotone.svg`. Regenerate the page/exports with `node scripts/preview-vexim-shield.mjs`. The cutout uses even-odd fill, not a white overlay, so it works on dark/tinted backgrounds. This is a new identity motif, not a redraw of the official logo. It contains no checkmark or approval assertion.

As promised before the user's go-ahead, show compact and large samples for visual approval **before replacing the current production shields**. This study is not yet wired into verification-tier.tsx. Existing circles, colours, labels, tooltips and verification rules stay authoritative; the compact-shield exception above remains effective until visual approval and integration.

## Supplier-declared product capabilities — OEM / ODM / Samples

Use the same direction-02 artwork in `components/brand/vexim-icons.tsx` and its standalone SVG exports:

- `VeximOemIcon`: specification sheet with manufactured item — manufacturing to buyer specifications.
- `VeximOdmIcon`: design sheet and pencil — design and manufacturing scope, not an artist's paintbrush.
- `VeximSamplesIcon`: open sample box and small item — sample goods, not a laboratory test tube or a tested-product claim.

`ProductTradeLabels` is the single shared label renderer for public product details and buyer previews. Render these neutral metadata icons at 16px with source strokeWidth 2.6, rounded joins/caps and 0.09 currentColor duotone fill, matching the existing commercial-fact direction. Keep the existing grey/navy label surfaces, labels and supplier-stated tooltips; no green approval marks, shields or guarantees. Samples availability does not imply free samples. Compact labels intentionally remain text-only, retaining the existing OEM/ODM combination and card spacing. Do not add capability icons to unrelated controls or replace comparison-table availability indicators. Do not modify underlying capability booleans, permissions or verification artwork.

Capability-icon validation: `check:brand`, `typecheck`, production build and `check-product-card-grade.mjs` pass. Brand checks render all capability combinations (including compact/null states), retain supplier-stated semantics and compare standalone SVG paths with the real React artwork. The extra `check-supplier-product-wizard.mjs` still expects the removed legacy `name="packaging"` input in `sec-shipping`; it fails there before its later assertions. That form/test is not changed by this icon update.

## Sign-in account roles — filled concept extension

The buyer and supplier choice cards on `/sign-in` now use `VeximBuyerAccountIcon` and `VeximSupplierAccountIcon` from `components/brand/account-role-icons.tsx`. This is a scoped extension of the fuller navy/teal concept requested after reviewing the six connection icons. It does not replace the established currentColor outline business/verification set globally. Source grid is 64px; show at 32px within the existing 40px neutral container. Navy inherits currentColor; muted teal and pale neutral fills give the approved sample direction its depth. There are no success ticks or shields: teal is an illustrative role accent, not an approved state.

Buyer: requirements/profile with search. Supplier: business profile with a catalogue/package, not a factory ownership claim. Supplier roles include traders and cooperatives. Both icons remain decorative next to localized labels. The account links, buyer return path validation, staff sign-in, registration and authentication stay unchanged. Standalone exports are `public/brand/vexim/buyer-account.svg` and `supplier-account.svg`. The preview in `docs/brand-preview/account-role-icons.png` shows the actual exported artwork at large and production sizes.

The `/register` account-type chooser reuses these exact buyer/supplier role components at 32px inside 40px navy/neutral containers, matching `/sign-in`. Selected-state styling belongs to the radio card, not to icon approval colors. Both routes retain their existing account selection and navigation behavior.

## Buyer dashboard — selective decorative icons

On `/buyer/account`, keep the existing Lucide navigation (Overview / My enquiries / Saved products / Account details) and all action, support, image-fallback and status icons unchanged. Reuse `VeximBuyerAccountIcon` at 32px within the existing 48px header circle. Use `VeximBuyerEnquiriesIcon` and `VeximBuyerSavedProductsIcon` from `components/brand/buyer-dashboard-icons.tsx` at 48px only in their corresponding empty sections. These are decorative filled navy/teal 64px-grid vectors with adjacent localized explanatory text, not status or verification marks. Keep real product photos, state colors, existing copy, account ownership and workflows intact. No new illustrations are inserted into populated request/saved lists or sourcing-history/error states.

`check:buyer-account` renders the actual role and empty-state artwork for EN/VI empty and populated fixtures and asserts that navigation remains separate from decorative icons. The register/sign-in consistency update and dashboard work preserve their existing selection and links.


## Product-card shield exception — approved 2026-11-05

For `VerificationPips variant="marketplace"` only, the owner approved removing the outer circular border and tinted background, while enlarging the existing ShieldCheck glyph so it does not float in an oversized empty frame. Glyphs are now 14px / 16px at sm (previously 10px / 12px), retaining the 18px / 20px hit areas and a consistent 2px gap (tightened from 4px after owner review). Keep success versus muted text colors, all three independent checks, labels, tooltips and keyboard focus indicators. This is not a new shield design or verification policy change. Default circular pips, tier pills and cover seals are unchanged; earlier circle-preservation guidance continues to apply outside product-card marketplace pips.

## Floating quick-action rail and header icons (approved 2026-11-07)

Three new direction-02 icons for the right-edge rail on public pages (`components/marketplace-rail.tsx`). The rail shows icons only and expands to labels on hover or keyboard focus.

| Export | Action | Do not imply |
|---|---|---|
| VeximMessagesIcon | Buyer–supplier messages on Vexim (unread badge) | Contact with the Vexim team |
| VeximSourcingRequestIcon | Sourcing request sent to Vexim (no supplier chosen) | A quote already requested from a specific supplier |
| VeximPlatformSupportIcon | Chat with the Vexim team inside Vexim (sales staff reply in CRM) | A channel to a supplier |

The rail replaces the old green WhatsApp "Chat with us" button; WhatsApp is no longer linked. It is hidden on `/buyer/account/messages`, which has its own full chat.

Header controls (same approval): the language switcher and buyer account entry use these icons, matching the rail. Since 2026-11 (owner request for a less basic header) the main links are rounded pill links with an active state and the language switcher is a small pill that also shows the current code (EN/VI); the icons are unchanged.

| Export | Use |
|---|---|
| VeximLanguageIcon | Language switcher (English / Tiếng Việt) |
| VeximAccountIcon | Sign in; when signed in, a small navy initial badge marks the active account instead of the former large solid circle |

## Shield pips without circles on public listings (approved 2026-11-07)

The frameless `variant="marketplace"` pips, first approved for product cards, also apply to the public supplier cards in "Explore other suppliers" (`/suppliers/[slug]`) and to the comparison page (`/compare`), so every public listing card shows the same shields. CRM and other default contexts keep the circular pips.

## Tier-coloured filled shields on public listings (approved 2026-11-07)

Owner decision: on `variant="marketplace"` pips the plain ShieldCheck shape and size stay (no circle, no outer ring). An approved shield is **filled, outline included, with the supplier's tier colour; only the tick is white**, so a filled shield is exactly as large as an unapproved one. The colour follows the supplier tier (number of approved checks), so all approved shields on one card share it:

| Tier | Fill |
|---|---|
| 1 check | green #2FA35A |
| 2 checks | light yellow #E9C64A |
| all 3 checks | burgundy #8E1B2C |

This is an owner-approved exception to "no decorative yellow" for these tier shields only; yellow stays out of other UI. Burgundy is a tier colour, not the error red. Unapproved shields stay an unfilled grey outline (`text-ink-400`) in the existing 18px / 20px hit areas with a 2px gap. Tokens live in `VERIFICATION_SHIELD_FILL` (`components/verification-tier.tsx`). The tier pill (`VerificationTierBadge`, e.g. "Level 2 · Advanced") and the cover seal use the same ramp: pale green / pale yellow / pale burgundy pills with dark text (contrast ≥ 4.5:1), and solid green / yellow (dark text) / burgundy seals. CRM compact pips keep the shared success colour. Labels, tooltips and verification rules are unchanged.
