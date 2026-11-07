import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { brandIcons } from './lib/vexim-icons.mjs';
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const render = (Icon, props = {}) => renderToStaticMarkup(React.createElement(Icon, props));
const symbols = ['factory', 'trade', 'cooperative', 'document', 'inspection', 'delivery', 'minimum-order', 'export-port', 'lead-time', 'capacity', 'payment', 'markets', 'oem', 'odm', 'samples', 'messages', 'sourcing-request', 'platform-support', 'language', 'account'];
for (const name of symbols) {
  for (const size of [20, 24, 48]) {
    const html = render(brandIcons.VeximIcon, { name, size });
    assert.match(html, /viewBox="0 0 48 48"/);
    assert.ok(html.includes(`width="${size}"`));
    assert.match(html, /fill-opacity="0.09"/);
    assert.match(html, /stroke="currentColor"/);
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, /<image|<script|<use|\bid=|#[0-9a-fA-F]{6}|linearGradient/);
  }
  const svg = read(`public/brand/vexim/${name}.svg`);
  assert.match(svg, /viewBox="0 0 48 48"/);
  assert.doesNotMatch(svg, /<script|<image|<use/);
  const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);
  const html = render(brandIcons.VeximIcon, { name });
  assert.deepEqual([...html.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]), paths, 'Standalone and React artwork agree');
}
assert.doesNotMatch(render(brandIcons.VeximDocumentIcon), /m27 34 4 4 9-10/);
assert.match(render(brandIcons.VeximDocumentCheckedIcon), /m27 34 4 4 9-10/);
assert.equal(brandIcons.supplierTypeIcon('manufacturer'), brandIcons.VeximFactoryIcon);
assert.equal(brandIcons.supplierTypeIcon('trading'), brandIcons.VeximTradeIcon);
assert.equal(brandIcons.supplierTypeIcon('cooperative'), brandIcons.VeximCooperativeIcon);
assert.equal(brandIcons.supplierTypeIcon(null), brandIcons.VeximDocumentIcon);
assert.equal(brandIcons.supplierTypeIcon('unknown'), brandIcons.VeximDocumentIcon);
const labelled = render(brandIcons.VeximTradeIcon, { 'aria-hidden': false, 'aria-label': 'Trading company', role: 'img', className: 'text-brand-700' });
assert.match(labelled, /aria-hidden="false"/);
assert.match(labelled, /aria-label="Trading company"/);
assert.match(labelled, /class="text-brand-700"/);
assert.equal(read('AGENTS.md').includes('docs/brand-identity.md'), true);
assert.match(read('docs/brand-identity.md'), /direction 02/);
assert.equal(fs.readFileSync(new URL('../public/logo-vexim.png', import.meta.url)).equals(fs.readFileSync(new URL('../docs/brand-preview/logo-vexim.png', import.meta.url))), true);

// Existing circular shield pips and verification meanings are not redesigned by this rollout.
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('components/verification-tier.tsx'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module: mod, exports: mod.exports, require(id) {
  if (id === 'react/jsx-runtime') return jsx;
  if (id === '@/components/brand/vexim-icons') return brandIcons;
  if (id === 'lucide-react') return { HelpCircle: () => null, ShieldCheck: (props) => React.createElement('svg', { ...props, 'data-standard-shield': true }) };
  if (id === '@/lib/verification-status') return { verificationLabel: (level) => `Check ${level}`, verificationExplanation: (level) => `Scope ${level}` };
  throw Error(id);
} });
for (const levels of [[], [1], [1, 2, 3]]) {
  const html = render(mod.exports.VerificationPips, { levels, shortTooltips: true });
  assert.equal((html.match(/data-standard-shield/g) ?? []).length, 3);
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.match(html, /rounded-full/);
  assert.match(html, /Check 2/);
  assert.equal((html.match(/: Approved\./g) ?? []).length, levels.length);
}
// Product cards: plain frameless shields; approved ones are filled with the tier colour (green, light yellow, burgundy) and a white tick.
for (const [levels, bg] of [[[], null], [[1], 'fill-\\[#2FA35A\\]'], [[1, 2], 'fill-\\[#E9C64A\\]'], [[1, 2, 3], 'fill-\\[#8E1B2C\\]']]) {
  const html = render(mod.exports.VerificationPips, { levels, variant: 'marketplace', shortTooltips: true });
  assert.equal((html.match(/data-standard-shield/g) ?? []).length, 3);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, 3);
  assert.match(html, /inline-flex items-center gap-0\.5/);
  for (const button of buttons) {
    assert.doesNotMatch(button, /rounded-full|(?:class="|\s)(?:border(?:-[^\s"]+)?|bg-[^\s"]+)/);
    assert.match(button, /h-\[18px\] w-\[18px\] sm:h-5 sm:w-5/);
    assert.match(button, /focus-visible:outline/);
  }
  assert.equal((html.match(/role="tooltip"/g) ?? []).length, 3);
  assert.equal((html.match(new RegExp(`<svg[^>]*${bg ?? 'never'}`, 'g')) ?? []).length, levels.length);
  assert.equal(buttons.filter((b) => b.includes('text-ink-400')).length, 3 - levels.length);
  assert.equal((html.match(/: Approved\./g) ?? []).length, levels.length);
}
for (const file of ['components/public/supplier-storefront.tsx', 'app/supplier/portal/verification/level-tabs.tsx', 'app/crm/verifications/submissions/page.tsx']) assert.match(read(file), /@\/components\/brand\/vexim-icons/);
// Actual shared labels: all boolean combinations preserve capability semantics and compact layout.
const tradeModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('components/product-trade-labels.tsx'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module: tradeModule, exports: tradeModule.exports, require(id) {
  if (id === 'react/jsx-runtime') return jsx;
  if (id === '@/components/brand/vexim-icons') return brandIcons;
  throw Error(id);
} });
for (const compact of [false, true]) for (let bits = 0; bits < 8; bits++) {
  const oem = !!(bits & 1), odm = !!(bits & 2), samples = !!(bits & 4);
  const html = render(tradeModule.exports.ProductTradeLabels, { oem, odm, samples, compact });
  if (!bits) { assert.equal(html, ''); continue; }
  assert.match(html, /Supplier-stated/);
  assert.doesNotMatch(html, /data-vexim-icon="(?:inspection|document|delivery)"|Approved|ShieldCheck|TestTube|Paintbrush/);
  const icons = [...html.matchAll(/data-vexim-icon="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(icons, compact ? [] : [oem && 'oem', odm && 'odm', samples && 'samples'].filter(Boolean));
  if (!compact) assert.match(html, /stroke-width="2.6"/);
  if (compact && oem && odm) assert.match(html, /OEM\/ODM/);
  if (samples) assert.match(html, compact ? />Samples</ : />Samples available</);
}
assert.equal(render(tradeModule.exports.ProductTradeLabels, { oem: null, odm: null, samples: null }), '');
console.log('✅ Approved brand direction 02: fifteen real vectors/exports and consistent OEM/ODM/sample labels, neutral versus approved documents, type mapping, accessibility, original logo and small verification shields preserved.');

assert.match(read("app/(auth)/sign-in/page.tsx"), /@\/components\/brand\/account-role-icons/);

assert.match(read("app/(auth)/register/account-type-chooser.tsx"), /@\/components\/brand\/account-role-icons/);
