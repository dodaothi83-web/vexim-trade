// node --experimental-strip-types --no-warnings scripts/check-supplier-product-publication.mjs
// Read-only buyer visibility diagnostics for the supplier-authored product flow.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, URL, process,
    require: (id) => {
      if (id === 'server-only') return {};
      assert.ok(id in mocks, `${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const readiness = load('../lib/media/readiness.ts');
const seo = load('../lib/public/supplier-seo.ts');
const assignment = load('../lib/public/category-assignment.ts');
const selection = load('../lib/public/product-selection.ts', {
  '@/lib/public/category-assignment': assignment,
});
const { getSupplierProductPublication } = load('../lib/supplier-portal/product-publication.ts', {
  '@/lib/media/readiness': readiness,
  '@/lib/public/supplier-seo': seo,
  '@/lib/public/product-selection': selection,
});

const category = {
  id: 'c1', slug: 'cashew', status: 'published', is_published: true,
  name_i18n: { en: 'Cashew', vi: 'Hạt điều' },
};
const supplier = { id: 's1', slug: 'factory', name: 'Factory', status: 'published', is_demo: false };
const product = {
  id: 'p1', supplier_id: 's1', name: 'Cashew W320', category: 'cashew',
  supplier_originated: true, supplier_category_proposal: 'cashew', reviewed_category_slug: 'cashew',
  supplier_review_status: 'approved', ready_for_buyer: false,
};
const internalImage = {
  owner_type: 'product', product_id: 'p1', kind: 'image', audience: 'internal',
  status: 'unverified', expires_on: null,
};
const evaluate = (p = product, media = [internalImage], s = supplier, categories = [category]) =>
  getSupplierProductPublication({ product: p, supplier: s, media, categories });

// The reported state: admin approved the content, but the supplier upload is still
// internal and the independent buyer-ready switch is off.
let state = evaluate();
assert.equal(state.isPublic, false);
assert.equal(state.publicHref, null);
assert.ok(state.missing.some((reason) => reason.includes('Chưa đủ điều kiện')));
assert.ok(state.missing.some((reason) => reason.includes('sẵn sàng gửi buyer')));
assert.equal(state.checks.find((check) => check.key === 'review').done, true);

// A buyer-shareable file alone is not enough; the separate readiness gate remains.
state = evaluate({ ...product, ready_for_buyer: false }, [{ ...internalImage, audience: 'buyer' }]);
assert.equal(state.isPublic, false);
assert.equal(state.missing.length, 1);
assert.equal(state.missing[0], 'Sản phẩm chưa được bật sẵn sàng gửi buyer sau bước duyệt.');

// All gates pass: expose a real buyer URL, never a preview or an internal media URL.
state = evaluate({ ...product, ready_for_buyer: true }, [{ ...internalImage, audience: 'buyer' }]);
assert.equal(state.isPublic, true);
assert.equal(state.publicHref, '/products/cashew/p1');
assert.equal(state.missing.length, 0);

// Media belonging to another product cannot make this product public.
state = evaluate({ ...product, ready_for_buyer: true }, [{ ...internalImage, product_id: 'other', audience: 'buyer' }]);
assert.equal(state.isPublic, false);
assert.equal(state.checks.find((check) => check.key === 'media').done, false);

// The supplier profile and reviewed category are independent public gates.
state = evaluate({ ...product, ready_for_buyer: true }, [{ ...internalImage, audience: 'buyer' }], { ...supplier, status: 'draft' });
assert.equal(state.isPublic, false);
assert.ok(state.missing.includes('Hồ sơ doanh nghiệp chưa được công khai.'));
state = evaluate({ ...product, ready_for_buyer: true }, [{ ...internalImage, audience: 'buyer' }], supplier, [{ ...category, status: 'draft', is_published: false }]);
assert.equal(state.isPublic, false);
assert.equal(state.publicHref, null);

// Supplier-authored content without a staff category decision fails closed even
// if somebody forges approved/ready flags in a client payload.
state = evaluate({ ...product, reviewed_category_slug: null, ready_for_buyer: true }, [{ ...internalImage, audience: 'buyer' }]);
assert.equal(state.isPublic, false);
assert.equal(state.checks.find((check) => check.key === 'review').done, false);
assert.equal(state.checks.find((check) => check.key === 'category').done, false);

console.log('✅ Supplier product publication diagnostics: approval, buyer media, readiness, profile/category gates and safe buyer links.');
