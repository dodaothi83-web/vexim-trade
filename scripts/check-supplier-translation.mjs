// node scripts/check-supplier-translation.mjs — AI dịch hồ sơ NCC: MOQ, thị trường xuất khẩu,
// giới thiệu tiếng Anh khi NCC để trống, phát hiện bản dịch đã cũ và các điểm hiển thị công khai.
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

const ai = load('../lib/ai/translate-supplier.ts', {
  '@/lib/ai/company-introduction': { readOutputText: () => '' },
  '@/lib/types': {},
});

const source = { moq_text: '1 tấn cho W320', export_markets: ['Hoa Kỳ', 'Nhật Bản'] };
const parsed = ai.parseSupplierProfileTranslation(
  '{"moq_en":"1 MT for W320","export_markets_en":["United States","Japan"],"summary_en":""}', source);
assert.equal(parsed.moq_en, '1 MT for W320');
assert.deepEqual(parsed.export_markets_en, ['United States', 'Japan']);

// Model bỏ trống thì giữ nguyên nội dung gốc, không mất thông tin.
const fallback = ai.parseSupplierProfileTranslation('not json', source);
assert.equal(fallback.moq_en, source.moq_text);
assert.deepEqual(fallback.export_markets_en, source.export_markets);

// Hash và trạng thái: vừa dịch thì khớp; sửa MOQ gốc thì bản dịch bị coi là đã cũ.
const patch = ai.supplierProfilePatch(parsed, source, 'ai', 'gpt-4.1-mini', true);
assert.equal(patch.moq_text_i18n.en, '1 MT for W320');
assert.equal(patch.profile_translation_meta.summary_generated, true);
const supplier = { ...source, ...patch, summary_i18n: { en: 'Intro' } };
assert.equal(ai.supplierProfileTranslationState(supplier).current, true);
assert.equal(ai.supplierProfileTranslationState({ ...supplier, moq_text: '2 tấn cho W320' }).current, false);
assert.equal(ai.supplierProfileTranslationState({ moq_text: null, export_markets: [] }).hasEnglish, false);

// Điểm gắn trong luồng thật.
const route = fs.readFileSync(new URL('../app/api/supplier-portal/profile/route.ts', import.meta.url), 'utf8');
assert.match(route, /ensureSupplierProfileEnglish\(store, supplier\.id/, 'nộp hồ sơ phải kích hoạt dịch tự động');

const actions = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
assert.match(actions, /ensureSupplierProfileEnglish\(store, id/, 'nhân viên lưu hồ sơ phải làm mới bản dịch');

const service = fs.readFileSync(new URL('../lib/ai/supplier-translation-service.ts', import.meta.url), 'utf8');
assert.match(service, /needsSummary/, 'phải soạn giới thiệu khi NCC để trống ô tiếng Anh');
assert.match(service, /patch\.summary_i18n/, 'giới thiệu AI chỉ ghi khi đang trống');

const profilePage = fs.readFileSync(new URL('../app/(public)/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
assert.match(profilePage, /supplierMoqDisplay\(s\)/, 'trang NCC phải hiển thị MOQ bản tiếng Anh');
assert.match(profilePage, /supplierExportMarketsDisplay\(s\)/, 'trang NCC phải hiển thị thị trường bản tiếng Anh');

const compare = fs.readFileSync(new URL('../app/(public)/compare/page.tsx', import.meta.url), 'utf8');
assert.match(compare, /supplierMoqDisplay\(s\)/, 'trang so sánh phải hiển thị MOQ bản tiếng Anh');

const form = fs.readFileSync(new URL('../app/supplier/portal/supplier-profile-form.tsx', import.meta.url), 'utf8');
assert.match(form, /không bắt buộc/, 'ô giới thiệu tiếng Anh phải ghi rõ không bắt buộc');

const migration = fs.readFileSync(new URL('../supabase/migrations/20261018_supplier_profile_english_translation.sql', import.meta.url), 'utf8');
for (const column of ['moq_text_i18n', 'export_markets_i18n', 'profile_translation_meta']) {
  assert.match(migration, new RegExp(column), `migration thiếu cột ${column}`);
}

console.log('✅ Supplier profile translation: parse, freshness hash, submit/staff triggers, summary drafting, buyer display, migration.');
