// node scripts/check-supplier-translation.mjs — AI dịch các nội dung hồ sơ NCC cho buyer,
// giới thiệu tiếng Anh khi NCC để trống, phát hiện bản dịch đã cũ và các điểm hiển thị công khai.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  publicExportPortDisplay,
  publicProductCapacityDisplay,
  publicProductMoqDisplay,
  publicProductPaymentTermsDisplay,
  publicProductPlaceDisplay,
} from '../lib/public/product-detail-display.ts';

const realRequire = createRequire(import.meta.url);
function load(file, mocks, globals = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, console, Date, process, JSON, Object, Array, String, Boolean, Promise, Error, RegExp, Map, Set,
    ...globals,
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

const translationSchemaRepair = fs.readFileSync(new URL('../supabase/migrations/20261036_supplier_translation_schema_repair.sql', import.meta.url), 'utf8');
for (const column of ['intro_source', 'moq_text_i18n', 'export_markets_i18n', 'profile_translation_meta']) {
  assert.ok(translationSchemaRepair.includes(column), `Repair migration phải bao phủ ${column}.`);
}
assert.match(translationSchemaRepair, /notify\s+pgrst/i, 'Repair migration phải reload PostgREST schema cache.');
assert.match(translationSchemaRepair, /where\s+intro_source\s+is\s+null/i, 'Backfill chỉ chạy khi intro_source còn trống.');
assert.match(translationSchemaRepair, /origin[^\n]+staff/i, 'Backfill không được đè quyết định giữ bản tiếng Anh của nhân sự.');
const migrationHints = load('../lib/db/migration-hints.ts', {});
assert.match(migrationHints.migrationHint(new Error("Could not find the 'export_markets_i18n' column in the schema cache")),
  /20261036_supplier_translation_schema_repair\.sql/);

const source = { moq_text: '1 tấn cho W320', export_markets: ['Hoa Kỳ', 'Nhật Bản'] };
const parsed = ai.parseSupplierProfileTranslation(
  '{"moq_en":"1 MT for W320","export_markets_en":["United States","Japan"],"summary_en":""}', source);
assert.equal(parsed.moq_en, '1 MT for W320');
assert.deepEqual(parsed.export_markets_en, ['United States', 'Japan']);

// Model bỏ trống thì giữ nguyên nội dung gốc, không mất thông tin.
const fallback = ai.parseSupplierProfileTranslation('not json', source);
assert.equal(fallback.moq_en, source.moq_text);
assert.deepEqual(fallback.export_markets_en, source.export_markets);
assert.throws(() => ai.parseSupplierProfileTranslation('not json', source, { strict: true }), /không đúng định dạng/,
  'ghi DB không được chấp nhận JSON hỏng rồi đánh dấu đã dịch');
assert.throws(() => ai.parseSupplierProfileTranslation(JSON.stringify({ moq_en: '1 MT' }), source, { strict: true }), /thiếu nội dung/,
  'phản hồi thiếu trường phải được thử lại');

// Kiểm tra chính hàm gọi OpenAI dùng strict mode, với fetch giả lập và không phát sinh request thật.
const liveAi = load('../lib/ai/translate-supplier.ts', {
  '@/lib/ai/company-introduction': { readOutputText: (payload) => payload.output_text ?? '' },
  '@/lib/types': {},
}, {
  AbortSignal,
  fetch: async () => ({ ok: true, json: async () => ({ output_text: 'not json' }) }),
});
const previousOpenAiKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-key';
try {
  await assert.rejects(() => liveAi.translateSupplierProfile({
    source, facts: { supplier_type_label: 'manufacturer', province: 'Nghệ An', products: 'Hạt tiêu', founded_year: 2016, employees: 100 },
    story: 'Giới thiệu cần dịch', draftSummary: false,
  }), /không đúng định dạng/);
} finally {
  if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAiKey;
}

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
assert.equal(fullPatch.profile_translation_meta.version, ai.SUPPLIER_PROFILE_TRANSLATION_VERSION);
assert.equal(fullPatch.profile_translation_meta.fields.address, '1 A Street');
assert.equal(ai.supplierProfileTranslationState({ ...fullSource, ...fullPatch }).current, true);
assert.equal(ai.supplierProfileTranslationState({
  ...fullSource, ...fullPatch,
  profile_translation_meta: { ...fullPatch.profile_translation_meta, version: 1 },
}).current, false, 'cache từ parser cũ phải được dịch lại');
assert.equal(ai.supplierProfileTranslationState({ ...fullSource, ...fullPatch, address: 'Địa chỉ mới' }).current, false);

const legalName = 'CÔNG TY TNHH SẢN XUẤT CÔNG NGHIỆP VIỆT THIÊN PHÚ';
const legalNameEn = 'VIET THIEN PHU INDUSTRIAL PRODUCTION COMPANY LIMITED';
const legalSource = ai.supplierProfileSource({ name: legalName });
assert.throws(() => ai.parseSupplierProfileTranslation('{}', legalSource, { strict: true }), /thiếu nội dung/,
  'Thiếu tên tiếng Anh phải giữ trạng thái lỗi để thử lại');
const legalTranslation = ai.parseSupplierProfileTranslation(JSON.stringify({ legal_name_en: legalNameEn }), legalSource, { strict: true });
const legalPatch = ai.supplierProfilePatch(legalTranslation, legalSource, 'ai', 'mock');
assert.equal(legalPatch.profile_translation_meta.fields.legal_name, legalNameEn);
assert.equal(ai.supplierProfileTranslationState({ ...legalSource, ...legalPatch }).current, true);
assert.equal(ai.supplierProfileTranslationState({ ...legalSource, ...legalPatch, name: 'Tên pháp lý mới' }).current, false,
  'Sửa tên pháp lý gốc phải làm bản hiển thị tiếng Anh cũ hết hạn');

const english = load('../lib/public/supplier-english.ts', {
  '@/lib/types': {},
  '@/lib/public/product-detail-display': {
    publicExportPortDisplay,
    publicProductCapacityDisplay,
    publicProductMoqDisplay,
    publicProductPaymentTermsDisplay,
    publicProductPlaceDisplay,
  },
});
const displaySupplier = { province: 'Bình Phước', address: 'Số 1', ports: ['Cát Lái'], profile_translation_meta: { fields: { province: 'Binh Phuoc', address: '1 A Street', ports: ['Cat Lai'] } } };
assert.equal(english.supplierLegalNameDisplay({ name: legalName, profile_translation_meta: null }), legalName,
  'Chưa có bản tiếng Anh thì giữ nguyên tên gốc, không tự ý thay đổi');
assert.equal(english.supplierProvinceDisplay(displaySupplier), 'Binh Phuoc');
assert.equal(english.supplierAddressDisplay(displaySupplier), '1 A Street');
assert.equal(english.supplierPortsDisplay(displaySupplier)[0], 'Cat Lai');
assert.equal(english.supplierMoqDisplay({ moq_text: '1 tấn cho W320', moq_text_i18n: {} }), '1 metric ton for W320');
assert.equal(english.supplierCapacityDisplay({ capacity_per_month: '100 tấn', profile_translation_meta: null }), '100 metric tons');
assert.equal(english.supplierPaymentTermsDisplay({ payment_terms: 'T/T 30% cọc', profile_translation_meta: null }), 'T/T 30% deposit');
assert.equal(english.supplierProvinceDisplay({ province: 'Bình Phước', profile_translation_meta: null }), 'Binh Phuoc');
assert.equal(english.supplierPortsDisplay({ ports: ['Cát Lái'], profile_translation_meta: null })[0], 'Cat Lai');
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
assert.equal(ai.supplierProfileTranslationState({
  ...storySupplier, ...storyPatch,
  profile_translation_meta: { ...storyPatch.profile_translation_meta, version: 1, origin: 'staff' },
}).summaryCurrent, true, 'nâng parser không được làm mất quyết định giữ bản tiếng Anh của nhân sự');
assert.ok(ai.supplierSummarySourceHash('abc') !== ai.supplierSummarySourceHash('abcd'));

// Chạy service với AI giả lập: kiểm tra ghi DB, bỏ qua khi hash còn mới và giữ bản nhân sự đã chốt.
let configured = true;
let providerCalls = 0;
const translationService = load('../lib/ai/supplier-translation-service.ts', {
  '@/lib/ai/translate-supplier': {
    ...ai,
    translateSupplierProfile: async ({ source, story, draftSummary }) => {
      providerCalls += 1;
      return {
        model: 'mock-translator',
        translation: ai.parseSupplierProfileTranslation(JSON.stringify({
          legal_name_en: 'VIET THIEN PHU INDUSTRIAL PRODUCTION COMPANY LIMITED',
          moq_en: '1 MT', export_markets_en: ['United States'], province_en: 'Binh Phuoc',
          address_en: '1 A Street', products_en: 'Cashew kernels', markets_en: 'Vietnam',
          capacity_per_month_en: '10 MT/month', payment_terms_en: 'Deferred payment',
          ports_en: ['Cat Lai'], incoterms_en: ['FOB'],
          summary_en: story ? 'A faithful English introduction.' : '',
        }), source, { strict: true, requireSummary: Boolean(story) || draftSummary }),
      };
    },
  },
  '@/lib/ai/translate-content': { translationConfigured: () => configured },
  '@/lib/db/types': {}, '@/lib/types': {},
});
let translatedRow = {
  id: 'sup-translation', name: 'CÔNG TY TNHH SẢN XUẤT CÔNG NGHIỆP VIỆT THIÊN PHÚ', ...fullSource,
  intro_source: 'Giới thiệu doanh nghiệp bằng tiếng Việt.', summary_i18n: {},
};
const translationStore = {
  getSupplier: async () => translatedRow,
  updateSupplier: async (_id, patch) => { translatedRow = { ...translatedRow, ...patch }; return translatedRow; },
  addAuditLog: async () => {},
};
const schemaFailure = await translationService.ensureSupplierProfileEnglish({
  getSupplier: async () => ({ ...translatedRow }),
  updateSupplier: async () => { throw new Error("updateSupplier: Could not find the 'export_markets_i18n' column of 'suppliers' in the schema cache"); },
  addAuditLog: async () => {},
}, translatedRow.id, null);
assert.equal(schemaFailure.status, 'failed');
assert.match(schemaFailure.message, /20261036_supplier_translation_schema_repair\.sql/, 'Lỗi schema phải chỉ đúng migration hotfix');
assert.match(translationService.supplierTranslationFailureMessage(new Error('OPENAI_API_KEY is missing')), /OPENAI_API_KEY/,
  'Không được che mất các lỗi cấu hình khác');
let ensured = await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null);
assert.equal(ensured.status, 'translated');
assert.equal(translatedRow.summary_i18n.en, 'A faithful English introduction.');
assert.equal(translatedRow.profile_translation_meta.fields.products, 'Cashew kernels');
assert.equal(translatedRow.profile_translation_meta.fields.legal_name, 'VIET THIEN PHU INDUSTRIAL PRODUCTION COMPANY LIMITED');
assert.equal(translatedRow.name, 'CÔNG TY TNHH SẢN XUẤT CÔNG NGHIỆP VIỆT THIÊN PHÚ', 'Bản dịch không được thay tên pháp lý gốc');
assert.equal(english.supplierLegalNameDisplay(translatedRow), 'VIET THIEN PHU INDUSTRIAL PRODUCTION COMPANY LIMITED');
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

// Hồ sơ cũ chỉ có summary tiếng Việt: phải đưa summary vào nguồn dịch, không bỏ sót giới thiệu.
translatedRow = {
  id: 'sup-legacy-summary', ...fullSource,
  intro_source: null, summary_i18n: { en: 'Giới thiệu cũ bằng tiếng Việt.' },
};
ensured = await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null);
assert.equal(ensured.status, 'translated');
assert.equal(translatedRow.intro_source, 'Giới thiệu cũ bằng tiếng Việt.');
assert.equal(translatedRow.summary_i18n.en, 'A faithful English introduction.');
assert.equal(translatedRow.profile_translation_meta.version, ai.SUPPLIER_PROFILE_TRANSLATION_VERSION);

// Cache do parser cũ ghi nhầm nguyên văn nguồn phải bị vô hiệu và được thay bằng bản dịch mới.
translatedRow = {
  id: 'sup-stale-cache', ...fullSource,
  intro_source: 'Giới thiệu cần dịch lại.', summary_i18n: {},
  moq_text_i18n: { en: fullSource.moq_text }, export_markets_i18n: { en: fullSource.export_markets },
  profile_translation_meta: { ...fullPatch.profile_translation_meta, version: 1 },
};
ensured = await translationService.ensureSupplierProfileEnglish(translationStore, translatedRow.id, null);
assert.equal(ensured.status, 'translated');
assert.equal(translatedRow.profile_translation_meta.fields.products, 'Cashew kernels');
assert.equal(translatedRow.moq_text_i18n.en, '1 MT');

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
assert.match(profilePage, /supplierLegalNameDisplay\(s\)/, 'trang NCC phải hiển thị tên pháp lý bằng bản tiếng Anh đã lưu');
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
