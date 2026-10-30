// Pure rules and real React SSR for buyer-facing L2 scope; no network/database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root = resolve(new URL('..', import.meta.url).pathname);
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
const english = Object.fromEntries([
  'supplierAddressDisplay', 'supplierCapacityDisplay', 'supplierLegalNameDisplay',
  'supplierMarketsDisplay', 'supplierMoqDisplay', 'supplierPaymentTermsDisplay',
  'supplierProductsDisplay', 'supplierProvinceDisplay', 'supplierSummaryDisplay',
].map((key) => [key, () => '']));
for (const key of ['supplierExportMarketsDisplay', 'supplierIncotermsDisplay', 'supplierPortsDisplay']) english[key] = () => [];
function load(file) {
  const absolute = resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} }; cache.set(absolute, mod);
  const code = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const require = (id) => {
    if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (id === '@/lib/public/catalog') return { supplierTypeLabel: () => 'Trading company' };
    if (id === '@/lib/public/supplier-english') return english;
    if (id === '@/lib/public/display-name') return { publicProductTitle: () => '' };
    if (id === '@/lib/public/product-selection') return { withoutDirectContacts: (value) => value, productBelongsToCategory: () => false, publicProductPrice: () => null };
    if (id === '@/components/public-product-card') return { PublicProductCard: () => null };
    if (id === '@/components/product-compare-checkbox') return { ProductCompareCheckbox: () => null };
    if (id === '@/components/product-trade-labels') return { ProductTradeLabels: () => null };
    if (id === '@/components/public/supplier-product-rail') return { SupplierProductRail: ({ children }) => React.createElement('ul', null, children) };
    if (id.startsWith('@/')) return load(`${id.slice(2)}.tsx`.replace(/verification-status\.tsx$/, 'verification-status.ts'));
    return nativeRequire(id);
  };
  vm.runInThisContext(`(function(exports, require, module) { ${code}\n})`, { filename: absolute })(mod.exports, require, mod);
  return mod.exports;
}

const rules = load('lib/verification-status.ts');
const legacy = { target_level: 2, status: 'approved', l2_scope: null, public_summary_published_at: '2026-01-01', public_summary_i18n: { en: 'Separate factory review.' } };
const partner = { target_level: 2, status: 'approved', l2_scope: 'partner_contract', public_summary_published_at: '2026-02-01', public_summary_i18n: { en: 'Partner contract reviewed.' } };
assert.equal(rules.approvedL2Scope([]), null);
assert.equal(rules.approvedL2Scope([legacy]), 'factory', 'Legacy NULL retains factory meaning');
assert.equal(rules.approvedL2Scope([partner]), 'partner_contract');
assert.equal(rules.approvedL2Scope([legacy, partner]), 'both', 'Each historical review is represented');
assert.equal(rules.approvedL2Scope([{ ...partner, status: 'submitted' }]), null);
assert.equal(rules.approvedPublicReviewSummaries([legacy, partner])[2], 'Separate factory review.');
assert.equal(rules.approvedPartnerReviewSummary([legacy, partner]), 'Partner contract reviewed.');
assert.equal(rules.approvedPartnerReviewSummary([{ ...partner, public_summary_i18n: { en: 'Email me at secret@example.com' } }]), undefined);
for (const scope of ['partner_contract', null, undefined]) assert.equal(rules.matchesVerificationFilter([2], scope, 2), false, `Factory filter rejects ${scope}`);
assert.equal(rules.matchesVerificationFilter([2], 'partner_contract', 4), true);
assert.equal(rules.matchesVerificationFilter([2], 'factory', 4), false);
assert.equal(rules.matchesVerificationFilter([2], 'both', 2), true);
assert.equal(rules.matchesVerificationFilter([2], 'both', 4), true);
assert.equal(rules.matchesVerificationFilter([], 'partner_contract', 4), false);
assert.equal(rules.verificationLabel(2, null), 'L2 review', 'Unknown scope does not become a factory claim');
assert.equal(rules.verificationLabel(2, undefined), 'L2 review');
assert.doesNotMatch(rules.verificationExplanation(2, undefined), /factory (associated|reviewed)/i);
assert.match(rules.verificationExplanation(2, 'partner_contract', true), /does not establish ownership or a factory inspection/i);

const { VerificationPips } = load('components/verification-tier.tsx');
const { ProductVerificationIcons } = load('components/product-verification-icons.tsx');
const pips = renderToStaticMarkup(React.createElement(VerificationPips, { levels: [2], l2Scope: 'partner_contract', shortTooltips: true }));
const icons = renderToStaticMarkup(React.createElement(ProductVerificationIcons, { levels: [2], l2Scope: 'partner_contract' }));
assert.match(pips, /Partner factory contract reviewed/);
assert.doesNotMatch(pips, /Factory verification/);
assert.match(icons, /Partner factory contract reviewed/);
assert.match(icons, /not a product certification/);

// The compact visible badge is shown only for an approved partner-scope review,
// not for type alone, pending checks, legacy factory cases or demo cards.
const { PublicProductCard } = load('components/public-product-card.tsx');
const cardProps = { href: '/products/cashew/p1', name: 'Cashew', moq: '1 MT', price: null, leadTimeDays: 14,
  supplierName: 'Trading company', verificationSteps: [1, 2], quoteHref: undefined };
const renderCard = (extras) => renderToStaticMarkup(React.createElement(PublicProductCard, { ...cardProps, ...extras }));
const label = /<span aria-hidden="true">Partner contract<\/span><span class="sr-only">Partner factory contract reviewed<\/span>/;
assert.match(renderCard({ l2Scope: 'partner_contract' }), label);
assert.match(renderCard({ l2Scope: 'both' }), label, 'Both reviews retain the separate partner label');
for (const extras of [{ l2Scope: 'factory' }, { l2Scope: null }, { l2Scope: undefined },
  { l2Scope: 'partner_contract', verificationSteps: [1] }, { l2Scope: 'partner_contract', test: true }]) {
  assert.doesNotMatch(renderCard(extras), label, 'No unapproved or incorrectly scoped partner label');
}


const { SupplierStorefront } = load('components/public/supplier-storefront.tsx');
const base = { id: 's', name: 'Trader', supplier_type: 'trading', approved_verification_steps: [2],
  public_review_summaries: {}, partner_review_summary: 'Partner contract reviewed.', gallery_images: [], main_products: [], product_image_paths: {}, product_card_image_paths: {} };
function renderSupplier(approved_l2_scope, extras = {}) {
  return renderToStaticMarkup(React.createElement(SupplierStorefront, {
    supplier: { ...base, approved_l2_scope, ...extras }, certificates: [], categories: [], coverUrl: null, avatarUrl: null, synthetic: false,
  }));
}
const partnerHtml = renderSupplier('partner_contract');
assert.match(partnerHtml, /id="partner-factory-contract"/);
assert.match(partnerHtml, /Partner factory contract reviewed/);
assert.match(partnerHtml, /contract review does not establish ownership or a factory inspection/i);
assert.doesNotMatch(partnerHtml, /Factory verification/);
const bothHtml = renderSupplier('both', { public_review_summaries: { 2: 'Separate factory review.' } });
assert.match(bothHtml, /id="factory-visit"/);
assert.match(bothHtml, /id="partner-factory-contract"/);
assert.match(bothHtml, /Separate factory review/);
assert.match(bothHtml, /Partner contract reviewed/);
assert.doesNotMatch(bothHtml, /supplier-submissions\/|contract\.pdf/, 'Source files remain private');
console.log('✅ Public L2: approved snapshots, both historical scopes, buyer labels, explanations, SSR and separate filters.');
