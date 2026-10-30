// Exercise the real controller's submit handler with isolated React hooks/session.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

let slots = [], cursor = 0, submitResult, calls = 0, dirty = false;
const hooks = {
  useEffect() {},
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
};
class FakeSession {
  constructor(_operations, initial, onChange) {
    this.onChange = onChange;
    this.state = { productId: initial.productId, revision: initial.revision, images: initial.images,
      availableImages: initial.availableImages ?? initial.images, busy: false, submitted: false, requiresReload: false };
  }
  isDirty() { return dirty; }
  async submit() {
    calls++;
    if (submitResult.ok) { this.state = { ...this.state, submitted: true }; this.onChange(this.state); }
    if (submitResult.requiresReload) { this.state = { ...this.state, requiresReload: true }; this.onChange(this.state); }
    return submitResult;
  }
  async save() { return { ok: true }; }
}
const mocks = {
  react: hooks, 'react/jsx-runtime': jsx,
  '@/components/products/product-form-five-sections': { ProductFormFiveSections: function FiveSections() {} },
  '@/lib/products/product-form-session': { ProductFormSession: FakeSession },
  '@/lib/products/product-form-image-transport': { prepareProductFormImageTransport: async (file) => file },
};
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../components/products/product-form-session-editor.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { exports, require: (key) => {
  if (!(key in mocks)) throw Error(`Unexpected import ${key}`); return mocks[key];
} });
const props = { initialDraft: {}, initialProductId: 'product', initialRevision: 1, initialImages: [], categories: [], policies: [], operations: {} };
const render = (extra = {}) => { cursor = 0; return exports.ProductFormSessionEditor({ ...props, ...extra }); };
const tick = () => new Promise((resolve) => setImmediate(resolve));
let element = render();
assert.equal(element.type, mocks['@/components/products/product-form-five-sections'].ProductFormFiveSections,
  'There is no separate top-level status banner');
assert.equal(element.props.submitted, false);
assert.equal(element.props.canSubmit, true);
submitResult = { ok: false, message: 'Hãy kiểm tra giá.', errors: [{ section: 'transaction', field: 'tiers', code: 'price', message: 'Hãy kiểm tra giá.' }] };
element.props.onSubmit(); await tick(); element = render();
assert.equal(element.props.submitted, false, 'A failed submission is never shown as sent');
assert.equal(element.props.canSubmit, true);
assert.equal(element.props.feedback.ok, false); assert.equal(element.props.feedback.text, 'Hãy kiểm tra giá.');
assert.equal(element.props.serverErrors[0].field, 'tiers');
submitResult = { ok: true, message: 'Đã gửi sản phẩm để Vexim kiểm tra.' };
element.props.onSubmit(); await tick(); element = render();
assert.equal(element.props.submitted, true); assert.equal(element.props.canSubmit, false);
assert.equal(element.props.disabled, true); assert.equal(element.props.feedback.ok, true);
assert.equal(element.props.feedback.text, 'Đã gửi sản phẩm để Vexim kiểm tra.');
assert.match(element.props.statusText, /đang chờ Vexim kiểm tra/);
assert.equal(calls, 2);
slots = []; element = render({ initialPending: true });
assert.equal(element.props.submitted, true, 'A server-confirmed pending submission remains sent on reload');
assert.equal(element.props.canSubmit, false); assert.equal(element.props.feedback, null);
assert.match(element.props.statusText, /đang chờ Vexim kiểm tra/);
dirty = true; element = render({ initialPending: true });
assert.match(element.props.statusText, /Có thay đổi chưa lưu/, 'Pending review does not hide unsaved edits');
dirty = false;
slots = []; element = render();
submitResult = { ok: false, requiresReload: true, message: 'Không xác nhận được kết quả gửi. Hãy tải lại trang.' };
element.props.onSubmit(); await tick(); element = render();
assert.equal(element.props.submitted, false, 'An uncertain result is never shown as a success');
assert.equal(element.props.disabled, true); assert.match(element.props.feedback.text, /Không xác nhận/);
assert.equal(element.props.statusText, 'Cần tải lại trang');
console.log('Product form submit feedback: success, pending reload, failure and uncertain outcome passed');
