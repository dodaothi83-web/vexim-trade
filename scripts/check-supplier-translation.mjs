// node scripts/check-supplier-translation.mjs — AI dịch các nội dung hồ sơ NCC cho buyer,
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

// Các trường hồ sơ khác cũng được dịch và làm mới khi nội dung gốc thay đổi.
const fullSource = ai.supplierProfileSource({
  moq_text: '1 tấn', export_markets: ['Hoa Kỳ'], province: 'Bình Phước', address: 'Số 1, đường A',
  products: 'Hạt điều', markets: 'Việt Nam', capacity_per_month: '10 tấn/tháng', payment_terms: 'Thanh toán sau',
  ports: ['Cát Lái'], incoterms: ['FOB'],
});
const fullTranslation = ai.parseSupplierProfileTranslation(JSON.stringify({
  moq_en: '1 MT', export_markets_en: ['United States'], province_en: 'Binh Phuoc', address_en: '1 A Street',
  products_en: 'Cashew kernels', markets_en: 'Vietnam', capacity_per_month_en: '10 MT/month', payment_terms_en: 'Deferred payment',
  ports_en: ['Cat Lai'], incoterms_en: ['FOB'], summary_en: '',
}), fullSource);
assert.equal(fullTranslation.province_en, 'Binh Phuoc');
assert.equal(fullTranslation.products_en, 'Cashew kernels');
assert.equal(fullTranslation.payment_terms_en, 'Deferred payment');
const fullPatch = ai.supplierProfilePatch(fullTranslation, fullSource, 'ai', 'mock');
assert.equal(fullPatch.profile_translation_meta.fields.address, '1 A Street');
assert.equal(ai.supplierProfileTranslationState({ ...fullSource, ...fullPatch }).current, true);
assert.equal(ai.supplierProfileTranslationState({ ...fullSource, ...fullPatch, address: 'Địa chỉ mới' }).current, false);

const english = load('../lib/public/supplier-english.ts', { '@/lib/types': {} });
const displaySupplier = { province: 'Bình Phước', address: 'Số 1', ports: ['Cát Lái'], profile_translation_meta: { fields: { province: 'Binh Phuoc', address: '1 A Street', ports: ['Cat Lai'] } } };
assert.equal(english.supplierProvinceDisplay(displaySupplier), 'Binh Phuoc');
assert.equal(english.supplierAddressDisplay(displaySupplier), '1 A Street');
assert.equal(english.supplierPortsDisplay(displaySupplier)[0], 'Cat Lai');
assert.equal(english.supplierSummaryDisplay({ intro_source: 'Giới thiệu doanh nghiệp', summary_i18n: {} }), 'Giới thiệu doanh nghiệp',
  'đã có nội dung gốc thì buyer không được thấy phần giới thiệu trống');
assert.equal(english.supplierSummaryDisplay({ intro_source: 'Giới thiệu gốc', summary_i18n: { en: 'English introduction' } }), 'English introduction',
  'bản tiếng Anh vẫn được ưu tiên khi đã có');

// Hash và trạng thái: vừa dịch thì khớp; sửa MOQ gốc thì bản dịch bị coi là đã cũ.
const patch = ai.supplierProfilePatch(parsed, source, 'ai', 'gpt-4.1-mini', true);
assert.equal(patch.moq_text_i18n.en, '1 MT for W320');
assert.equal(patch.profile_translation_meta.summary_generated, true);
const supplier = { ...source, ...patch, summary_i18n: { en: 'Intro' } };
assert.equal(ai.supplierProfileTranslationState(supplier).current, true);
assert.equal(ai.supplierProfileTranslationState({ ...supplier, moq_text: '2 tấn cho W320' }).current, false);
assert.equal(ai.supplierProfileTranslationState({ moq_text: null, export_markets: [] }).hasEnglish, false);

// Câu chuyện NCC tự viết: dịch xong thì khớp; NCC sửa câu chuyện thì phải dịch lại.
const storySupplier = { ...supplier, intro_source: 'Chúng tôi ép dầu điều từ hạt thu mua tại Bình Phước.' };
const storyPatch = ai.supplierProfilePatch(parsed, { ...source, intro_source: storySupplier.intro_source }, 'ai', 'gpt-4.1-mini', false);
assert.equal(ai.supplierProfileTranslationState({ ...storySupplier, ...storyPatch }).summaryCurrent, true);
assert.equal(ai.supplierProfileTranslationState({ ...storySupplier, ...storyPatch, intro_source: 'Câu chuyện mới.' }).summaryCurrent, false,
  'sửa phần giới thiệu gốc phải làm bản dịch giới thiệu thành đã cũ');
assert.ok(ai.supplierSummarySourceHash('abc') !== ai.supplierSummarySourceHash('abcd'));

// Chạy service với AI giả lập: kiểm tra ghi DB, bỏ qua khi hash còn mới và giữ bản nhân sự đã chốt.
let configured = true;
let providerCalls = 0;
const translationService = load('../lib/ai/supplier-translation-service.ts', {
  '@/lib/ai/translate-supplier': {
    ...ai,
    translateSupplierProfile: async ({ source, story }) => {
      providerCalls += 1;
      return {
        model: 'mock-translator',
        translation: ai.parseSupplierProfileTranslation(JSON.stringify({
          moq_en: '1 MT', export_markets_en: ['United States'], province_en: 'Binh Phuoc',
          address_en: '1 A Street', products_en: 'Cashew kernels', markets_en: 'Vietnam',
          capacity_per_month_en: '10 MT/month', payment_terms_en: 'Deferred payment',
          ports_en: ['Cat Lai'], incoterms_en: ['FOB'],
          summary_en: story ? 'A faithful English introduction.' : '',
        }), source),
      };
    },
  },
  '@/lib/ai/translate-content': { translationConfigured: () => configured },
  '@/lib/db/types': {}, '@/lib/types': {},
});
let translatedRow = {
  id: 'sup-translation', ...fullSource,
  intro_source: 'Giới thiệu doanh nghiệp bằng tiếng Việt.', summary_i18n: {},
};
const translationStore = {
  getSupplier: async () => translatedRow,
  updateSupplier: async (_id, patch) => { translatedRow = { ...translatedRow, ...patch }; return translatedRow; },
  addAuditLog: async () => {},
};
let ensured = await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null);
assert.equal(ensured.status, 'translated');
assert.equal(translatedRow.summary_i18n.en, 'A faithful English introduction.');
assert.equal(translatedRow.profile_translation_meta.fields.products, 'Cashew kernels');
assert.equal(translatedRow.moq_text_i18n.en, '1 MT');
const callsAfterTranslation = providerCalls;
ensured = await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null);
assert.equal(ensured.status, 'current');
assert.equal(providerCalls, callsAfterTranslation, 'A fresh source hash must avoid an unnecessary AI request');

translatedRow.summary_i18n = { en: 'Staff-approved English introduction.' };
translatedRow.profile_translation_meta = { ...translatedRow.profile_translation_meta, summary_source_hash: 'stale' };
ensured = await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null, { preserveSummary: true });
assert.equal(translatedRow.summary_i18n.en, 'Staff-approved English introduction.');
assert.equal(translatedRow.profile_translation_meta.summary_source_hash,
  ai.supplierSummarySourceHash(translatedRow.intro_source), 'Preserve the staff decision for later supplier edits');
translatedRow.products = 'Hạt điều hữu cơ';
await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null);
assert.equal(translatedRow.summary_i18n.en, 'Staff-approved English introduction.',
  'Translating another source field must not overwrite the curated introduction');

configured = false;
translatedRow.intro_source = 'Nội dung mới cần dịch.';
const beforeUnconfigured = translatedRow.summary_i18n.en;
ensured = await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null);
assert.equal(ensured.status, 'unconfigured');
assert.equal(translatedRow.summary_i18n.en, beforeUnconfigured, 'Missing AI configuration must not erase saved content');
configured = true;

// Điểm gắn trong luồng thật.
const route = fs.readFileSync(new URL('../app/api/supplier-portal/profile/route.ts', import.meta.url), 'utf8');
assert.match(route, /ensureSupplierProfileEnglish\(store, supplier\.id/, 'nộp hồ sơ phải kích hoạt dịch tự động');

const actions = fs.readFileSync(new URL('../app/actions.ts', import.meta.url), 'utf8');
assert.match(actions, /ensureSupplierProfileEnglish\(store, id/, 'nhân viên lưu hồ sơ phải làm mới bản dịch');

const service = fs.readFileSync(new URL('../lib/ai/supplier-translation-service.ts', import.meta.url), 'utf8');
assert.match(service, /needsSummary/, 'phải soạn giới thiệu khi NCC để trống ô tiếng Anh');
assert.match(service, /patch\.summary_i18n/, 'giới thiệu AI chỉ ghi khi đang trống');
assert.match(service, /supplierProfileHasSource\(source\) && !state\.current/, 'mọi trường hồ sơ có nguồn đều phải kích hoạt dịch');
assert.match(service, /fields: supplier\.profile_translation_meta\?\.fields/, 'lưu bản giới thiệu thủ công không được xóa cache các trường khác');

const profilePage = fs.readFileSync(new URL('../app/(public)/suppliers/[slug]/page.tsx', import.meta.url), 'utf8') +
  fs.readFileSync(new URL('../components/public/supplier-storefront.tsx', import.meta.url), 'utf8');
assert.match(profilePage, /supplierSummaryDisplay\(s\)/, 'trang NCC phải hiển thị giới thiệu bản dịch hoặc nội dung gốc đã có');
assert.match(profilePage, /supplierMoqDisplay\(s\)/, 'trang NCC phải hiển thị MOQ bản tiếng Anh');
assert.match(profilePage, /supplierExportMarketsDisplay\(s\)/, 'trang NCC phải hiển thị thị trường bản tiếng Anh');
assert.match(profilePage, /supplierProvinceDisplay\(s\)/, 'trang NCC phải hiển thị địa điểm bản tiếng Anh');
assert.match(profilePage, /supplierAddressDisplay\(s\)/, 'trang NCC phải hiển thị địa chỉ bản tiếng Anh');
assert.match(profilePage, /supplierPortsDisplay\(s\)/, 'trang NCC phải hiển thị cảng bản tiếng Anh');

const compare = fs.readFileSync(new URL('../app/(public)/compare/page.tsx', import.meta.url), 'utf8');
assert.match(compare, /supplierMoqDisplay\(s\)/, 'trang so sánh phải hiển thị MOQ bản tiếng Anh');
assert.match(compare, /supplierProvinceDisplay\(s\)/, 'trang so sánh phải hiển thị địa điểm bản tiếng Anh');
assert.match(compare, /supplierPortsDisplay\(s\)/, 'trang so sánh phải hiển thị cảng bản tiếng Anh');

const form = fs.readFileSync(new URL('../app/supplier/portal/supplier-profile-form.tsx', import.meta.url), 'utf8');
assert.match(form, />Giới thiệu</, 'ô nhập phải là phần giới thiệu của NCC');
assert.match(form, /Mô tả về điểm khác biệt của công ty hay sản phẩm của bạn\./, 'placeholder phải gợi ý kể điểm khác biệt');
assert.match(form, /name="intro_source"/, 'form phải gửi phần giới thiệu gốc, không gửi thẳng vào bản tiếng Anh');

const profileInput = fs.readFileSync(new URL('../lib/supplier-portal/profile-input.ts', import.meta.url), 'utf8');
assert.match(profileInput, /intro_source: text\(form, "intro_source", 1500\)/, 'parser phải lưu phần giới thiệu gốc riêng');

const migration = fs.readFileSync(new URL('../supabase/migrations/20261018_supplier_profile_english_translation.sql', import.meta.url), 'utf8');
for (const column of ['moq_text_i18n', 'export_markets_i18n', 'profile_translation_meta']) {
  assert.match(migration, new RegExp(column), `migration thiếu cột ${column}`);
}
const introMigration = fs.readFileSync(new URL('../supabase/migrations/20261018_supplier_intro_source.sql', import.meta.url), 'utf8');
assert.match(introMigration, /intro_source/, 'migration phải có cột intro_source');

console.log('✅ Supplier profile translation: parse, freshness hash, submit/staff triggers, summary drafting, buyer display, migration.');
