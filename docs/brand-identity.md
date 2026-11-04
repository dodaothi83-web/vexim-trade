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
