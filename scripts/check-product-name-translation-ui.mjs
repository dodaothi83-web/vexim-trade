// node scripts/check-product-name-translation-ui.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function harness(path, mocks) {
  let slots = [], cursor = 0, effects = [], timers = new Map(), nextTimer = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++; const prev = slots[i];
      if (!prev || deps.some((v, n) => v !== prev.deps[n])) { effects.push(() => { prev?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); }
    },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(code, { exports, FormData, setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id), require: (key) => { if (key === 'react') return hooks; if (key === 'react/jsx-runtime') return jsx;
      if (!(key in mocks)) throw Error(key); return mocks[key]; } });
  return { exports, render(fn, props) { cursor = 0; const el = fn(props); const queue = effects; effects = []; queue.forEach((effect) => effect()); return el; },
    fireTimers() { const all = [...timers.values()]; timers.clear(); all.forEach((fn) => fn()); }, timerCount: () => timers.size };
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise((r) => setImmediate(r));
class Session { isDirty() { return false; } }
const requests = [];
const translateName = (name) => { const d = deferred(); requests.push({ name, ...d }); return d.promise; };
const supplier = harness('../components/products/product-form-session-editor.tsx', {
  '@/components/products/product-form-five-sections': { ProductFormFiveSections: function FiveSections() {} },
  '@/lib/products/product-form-session': { ProductFormSession: Session },
  '@/lib/products/product-form-image-transport': { prepareProductFormImageTransport: async (file) => file },
});
const supplierProps = { initialDraft: { name: '' }, initialProductId: null, initialRevision: 0, initialImages: [], categories: [], policies: {}, operations: { translateName } };
const renderSupplier = () => supplier.render(supplier.exports.ProductFormSessionEditor, supplierProps);
let screen = renderSupplier();
screen.props.onChange({ name: 'Nhân điều' }); screen = renderSupplier();
assert.equal(supplier.timerCount(), 1); assert.equal(requests.length, 0, 'No call before debounce');
supplier.fireTimers(); assert.equal(requests[0].name, 'Nhân điều');
screen.props.onChange({ name: 'Gạo thơm' }); screen = renderSupplier();
assert.notEqual(screen.props.nameTranslationStatus, 'Tên tiếng Anh AI dự kiến: Cashew. Vexim sẽ kiểm tra trước khi công bố.');
supplier.fireTimers(); assert.equal(requests[1].name, 'Gạo thơm');
requests[0].resolve({ ok: true, sourceName: 'Nhân điều', englishName: 'Cashew' }); await tick(); screen = renderSupplier();
assert.doesNotMatch(screen.props.nameTranslationStatus ?? '', /Cashew/, 'An older response is ignored');
requests[1].resolve({ ok: true, sourceName: 'Gạo thơm', englishName: 'Fragrant Rice' }); await tick(); screen = renderSupplier();
assert.match(screen.props.nameTranslationStatus, /Fragrant Rice/); assert.match(screen.props.nameTranslationStatus, /trước khi công bố/);
screen.props.onChange({ name: 'Cà phê' }); screen = renderSupplier(); supplier.fireTimers();
requests[2].resolve({ ok: false, message: 'Chưa dịch được tên. Vexim sẽ kiểm tra khi duyệt.' }); await tick(); screen = renderSupplier();
assert.match(screen.props.nameTranslationStatus, /Chưa dịch được/); assert.equal(screen.props.canSubmit, true, 'Translation failure does not claim submission or block the form');
screen.props.onChange({ name: 'Hạt tiêu' }); screen = renderSupplier(); supplier.fireTimers();
requests[3].resolve({ ok: true, sourceName: 'Không khớp', englishName: 'Wrong' }); await tick(); screen = renderSupplier();
assert.doesNotMatch(screen.props.nameTranslationStatus, /Wrong/);

let reviewRequests = [];
const review = harness('../app/crm/products/form-review/[submissionId]/review-controls.tsx', {
  'next/navigation': { useRouter: () => ({ push() {}, refresh() {} }) },
  '@/app/crm/products/product-form-review-actions': { requestProductFormChangesAction: async () => ({ ok: false }) },
  '@/app/crm/products/product-form-approval-action': { approveProductFormAction: async () => ({ ok: false }) },
  '@/app/crm/products/product-form-translation-actions': { suggestProductFormEnglishNameAction: (...args) => { const d = deferred(); reviewRequests.push({ args, ...d }); return d.promise; } },
});
const reviewProps = { productId: 'p', submissionId: 's', sourceName: 'Nhân điều', updatedAt: 't', allowApproval: true };
const renderReview = (props = reviewProps) => review.render(review.exports.ProductFormReviewControls, props);
function find(node, pred) { if (!node || typeof node !== 'object') return null; if (pred(node)) return node;
  const children = node.props?.children; for (const child of Array.isArray(children) ? children : [children]) { const result = find(child, pred); if (result) return result; } return null; }
let view = renderReview(); assert.equal(reviewRequests.length, 1, 'Reviewer translation starts automatically');
view = renderReview(); let input = find(view, (el) => el.type === 'input' && el.props.id === 'review-english-name');
input.props.onChange({ target: { value: 'Manual name' } }); renderReview();
reviewRequests[0].resolve({ ok: true, submissionId: 's', sourceName: 'Nhân điều', englishName: 'Cashew', nameNeedsEdit: false }); await tick(); view = renderReview();
input = find(view, (el) => el.type === 'input' && el.props.id === 'review-english-name'); assert.equal(input.props.value, 'Manual name', 'Late AI never overwrites reviewer edits');
assert.equal(find(view, (el) => el.type === 'button' && el.props.children === 'Gợi ý bằng AI'), null);
view = renderReview({ ...reviewProps, submissionId: 's2', sourceName: 'Gạo' });
assert.equal(reviewRequests.length, 2);
reviewRequests[1].resolve({ ok: true, submissionId: 's2', sourceName: 'Wrong', englishName: 'Wrong', nameNeedsEdit: false }); await tick();
view = renderReview({ ...reviewProps, submissionId: 's2', sourceName: 'Gạo' });
input = find(view, (el) => el.type === 'input' && el.props.id === 'review-english-name'); assert.equal(input.props.value, '', 'Snapshot mismatch is never applied');
view = renderReview({ ...reviewProps, submissionId: 's3' });
reviewRequests[2].resolve({ ok: true, submissionId: 's3', sourceName: 'Nhân điều', englishName: 'Cashew W320', nameNeedsEdit: true }); await tick();
view = renderReview({ ...reviewProps, submissionId: 's3' });
input = find(view, (el) => el.type === 'input' && el.props.id === 'review-english-name'); assert.equal(input.props.value, 'Cashew W320', 'AI fills the correct snapshot automatically');
assert.ok(find(view, (el) => el.type === 'p' && typeof el.props.children === 'string' && /chứa grade/.test(el.props.children)));
const preserved = harness('../app/crm/products/form-review/[submissionId]/review-controls.tsx', {
  'next/navigation': { useRouter: () => ({ push() {}, refresh() {} }) },
  '@/app/crm/products/product-form-review-actions': { requestProductFormChangesAction: async () => ({ ok: false }) },
  '@/app/crm/products/product-form-approval-action': { approveProductFormAction: async () => ({ ok: false }) },
  '@/app/crm/products/product-form-translation-actions': { suggestProductFormEnglishNameAction: () => { throw Error('Existing English name must not be replaced by AI'); } },
});
const existingView = preserved.render(preserved.exports.ProductFormReviewControls, { ...reviewProps, existingEnglishName: 'Existing English Name' });
assert.equal(find(existingView, (el) => el.type === 'input' && el.props.id === 'review-english-name').props.value, 'Existing English Name');
console.log('Automatic translation UI: existing English retained, debounce, stale responses, failure and manual edits passed');
