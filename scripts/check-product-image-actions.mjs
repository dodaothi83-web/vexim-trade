import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const states = [];
let index = 0;
const navigator = {};
const mod = { exports: {} };
const mocks = {
  react: { useState: (initial) => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value; }]; } },
  'react/jsx-runtime': jsx,
  'lucide-react': { Check: () => null, Share2: () => null },
};
vm.runInNewContext(ts.transpileModule(read('components/share-product-button.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  module: mod, exports: mod.exports, navigator, window: { location: { origin: 'https://veximtrade.com' } }, URL, Error,
  require: (id) => { assert.ok(id in mocks, id); return mocks[id]; },
});
const render = (isVi = false) => { index = 0; return mod.exports.ShareProductButton({ title: 'Cashew', href: '/products/cashew/product-id', isVi }); };
let shared;
navigator.share = async (payload) => { shared = payload; };
await render().props.children[0].props.onClick();
assert.equal(shared.url, 'https://veximtrade.com/products/cashew/product-id');
assert.equal(shared.title, 'Cashew');
assert.equal(states[2], false, 'Busy resets after native share');
let copied;
navigator.share = undefined;
navigator.clipboard = { writeText: async (text) => { copied = text; } };
await render().props.children[0].props.onClick();
assert.equal(copied, shared.url);
assert.equal(states[0], 'copied');
assert.equal(render(true).props.children[0].props['aria-label'], 'Chia sẻ sản phẩm');
navigator.share = async () => { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error; };
copied = null;
await render().props.children[0].props.onClick();
assert.equal(copied, null, 'Cancelling native share must not copy unexpectedly');
assert.equal(states[0], 'idle');
navigator.share = async () => { throw new Error('Unsupported'); };
await render().props.children[0].props.onClick();
assert.equal(states[0], 'copied', 'A native share failure falls back to copying');
navigator.clipboard = undefined;
await render().props.children[0].props.onClick();
assert.equal(states[0], 'manual', 'Clipboard unavailable provides a selectable product link');
const manualPanel = render().props.children[1];
assert.equal(manualPanel.props.children[1].type, 'input');
assert.equal(manualPanel.props.children[1].props.value, shared.url);
manualPanel.props.children[2].props.onClick();
assert.equal(states[0], 'idle');
const page = read('app/(public)/products/[slug]/[productId]/page.tsx');
assert.match(page, /actions=\{!preview && !card\.isDemo/);
assert.match(page, /<SaveProductButton[^>]*iconOnly/);
assert.ok(page.indexOf('<SaveProductButton') < page.indexOf('<ShareProductButton'), 'Heart above share');
assert.doesNotMatch(page, /className="mt-3"><SaveProductButton/);
const gallery = read('components/product-media-gallery.tsx');
assert.match(gallery, /absolute right-3 top-3 z-20 flex flex-col/);
assert.ok(gallery.indexOf('{actions &&') < gallery.indexOf('{selected ? <button'), 'Actions are siblings, not nested inside the zoom button');
console.log('✓ Product image actions: top-right save/share, native sharing, cancellation, clipboard and manual fallback.');

const shareButton = render().props.children[0];
assert.match(shareButton.props.className, /cursor-pointer/);
assert.match(shareButton.props.className, /h-11 w-11/);
assert.match(shareButton.props.children.props.className, /h-6 w-6/);
const saveSource = read('components/buyer-saved-products.tsx');
assert.match(saveSource, /iconOnly \? "h-6 w-6" : "h-4 w-4"/);
assert.match(saveSource, /\$\{variantClasses\} cursor-pointer/);
console.log('✓ Image controls: matching 44px circles, 24px icons and explicit pointer cursors.');
