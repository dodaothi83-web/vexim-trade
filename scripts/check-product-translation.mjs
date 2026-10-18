// node scripts/check-product-translation.mjs — AI dịch sản phẩm sang tiếng Anh: parse kết quả,
// phát hiện bản dịch đã cũ theo hash nội dung gốc, và các điểm gắn vào luồng nộp/duyệt/công khai.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const realRequire = createRequire(import.meta.url);
function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, process, JSON, Object, Array, String, Boolean, Promise, Error, RegExp, Map, Set,
    require: (id) => {
      if (id === 'server-only') return {};
      if (id === 'node:crypto') return realRequire('node:crypto');
      assert.ok(id in mocks, `${file}: unexpected import ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return mod.exports;
}

const ai = load('../lib/ai/translate-content.ts', {
  '@/lib/ai/company-introduction': { readOutputText: () => '' },
  '@/lib/types': {},
});

const source = {
  name: 'Hạt điều nhân trắng W320',
  description: 'Hạt điều nhân trắng, độ ẩm ≤ 5%.',
  spec: 'Size W320, đóng gói 25 kg',
  description_detail: '',
  packaging: 'Thùng carton 25 kg',
  certifications: 'ISO 22000',
};

// Parse: JSON trong fence, trường model bỏ trống thì giữ nguyên nguồn thay vì mất nội dung.
const parsed = ai.parseProductTranslation('```json\n{"name":"White cashew kernels W320","description":"White cashew kernels, moisture ≤ 5%.","spec":"","description_detail":"","packaging":"25 kg carton box","certifications":"ISO 22000"}\n```', source);
assert.equal(parsed.name, 'White cashew kernels W320');
assert.equal(parsed.spec, 'Size W320, đóng gói 25 kg', 'trường dịch trống phải lùi về nội dung gốc');
assert.equal(parsed.packaging, '25 kg carton box');

// Hash đổi khi nội dung gốc đổi, giữ nguyên khi nội dung không đổi.
const hash1 = ai.productSourceHash(source);
assert.equal(hash1, ai.productSourceHash({ ...source }));
assert.notEqual(hash1, ai.productSourceHash({ ...source, spec: 'Size W240' }));

// Patch + state: vừa dịch xong thì current; NCC sửa nội dung gốc thì bản dịch bị coi là đã cũ.
const patch = ai.productTranslationPatch(parsed, source, 'ai', 'gpt-4.1-mini');
assert.equal(patch.name_i18n.en, 'White cashew kernels W320');
assert.equal(patch.translation_meta.origin, 'ai');
const product = { ...source, ...patch };
assert.deepEqual(
  (({ hasEnglish, current, origin }) => ({ hasEnglish, current, origin }))(ai.productTranslationState(product)),
  { hasEnglish: true, current: true, origin: 'ai' },
);
const edited = { ...product, name: 'Hạt điều nhân trắng W240' };
const stale = ai.productTranslationState(edited);
assert.equal(stale.hasEnglish, true);
assert.equal(stale.current, false, 'sửa nội dung gốc phải làm bản dịch thành đã cũ');
assert.equal(ai.productTranslationState({ ...source }).hasEnglish, false);

// Các điểm gắn trong luồng thật.
const submit = fs.readFileSync(new URL('../app/supplier/portal/product-actions.ts', import.meta.url), 'utf8');
assert.match(submit, /ensureProductEnglishTranslation\(store, id/, 'nộp sản phẩm phải kích hoạt dịch tự động');

const actions = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
assert.match(actions, /chưa có bản dịch tiếng Anh/, 'bật sẵn sàng gửi buyer phải chặn khi chưa có bản dịch và AI chưa dịch được');

const page = fs.readFileSync(new URL('../app/(public)/products/[slug]/[productId]/page.tsx', import.meta.url), 'utf8');
assert.match(page, /description_i18n\?\.en/, 'trang buyer phải ưu tiên mô tả tiếng Anh');
assert.match(page, /spec_i18n\?\.en/, 'trang buyer phải ưu tiên quy cách tiếng Anh');
assert.match(page, /description_detail_i18n\?\.en/, 'trang buyer phải ưu tiên mô tả chi tiết tiếng Anh');

const panel = fs.readFileSync(new URL('../app/crm/products/[slug]/edit/translation-panel.tsx', import.meta.url), 'utf8');
assert.match(panel, /Dịch bằng AI|Dịch lại bằng AI/, 'CRM phải có nút dịch bằng AI');
assert.match(panel, /Lưu bản dịch đã chốt/, 'CRM phải cho nhân viên chốt tay bản dịch');

const migration = fs.readFileSync(new URL('../supabase/migrations/20261018_product_english_translation.sql', import.meta.url), 'utf8');
for (const column of ['description_i18n', 'description_detail_i18n', 'spec_i18n', 'packaging_i18n', 'certifications_i18n', 'translation_meta']) {
  assert.match(migration, new RegExp(column), `migration thiếu cột ${column}`);
}

console.log('✅ AI product translation: parse, freshness hash, submit trigger, ready gate, buyer display, CRM panel, migration.');
