// L2 xác minh nhà máy qua cuộc gọi video / thực địa (11/2026).
// Kiểm quy tắc thuần, migration, và các điểm nối chính. Không gọi mạng, không dùng CSDL thật.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const plain = (value) => JSON.parse(JSON.stringify(value));
const deep = (actual, expected, message) => assert.deepEqual(plain(actual), expected, message);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Intl, Date, crypto: globalThis.crypto, globalThis, require: (id) => {
    if (id === 'server-only') return {};
    assert.ok(id in mocks, `Unexpected ${id}`); return mocks[id];
  } }, { filename: path });
  return mod.exports;
}

const types = load('lib/types.ts');
const rules = load('lib/l2-call-review.ts', { '@/lib/types': types });

// 1. Checklist: 12 mục nhà máy, thêm 4 mục hợp đồng cho nhà máy đối tác.
assert.equal(rules.callItems('factory').length, 12);
assert.equal(rules.callItems('partner_contract').length, 16);
const required = rules.callItems('factory').filter((i) => i.required).map((i) => i.key);
deep(required, ['participant_identity', 'factory_gate', 'location_match', 'production_line_running', 'finished_goods_warehouse', 'live_random_request']);
assert.ok(rules.callItems('partner_contract').some((i) => i.key === 'partner_identity_confirmed' && i.required), 'Partner keeps the DB-guarded confirmation keys');

// 2. Mã báo cáo.
const code = rules.issueReportCode(new Date('2026-11-07T00:00:00Z'));
assert.match(code, /^VXR-2611-[2-9A-HJ-NP-Z]{6}$/);
assert.equal(rules.normalizeReportCode(` ${code.toLowerCase()} `), code);

// 3. Điều kiện duyệt.
const v = { id: 'v1', supplier_id: 's1' };
const img = (id, key) => ({ id, owner_type: 'verification', verification_id: 'v1', supplier_id: 's1', kind: 'image', storage_path: `verifications/v1/${id}.jpg`, checklist_key: key, status: 'unverified' });
const photoKeys = rules.callItems('factory').filter((i) => i.required && i.photo).map((i) => i.key);
const media = photoKeys.map((key, n) => img(`m${n}`, key));
const checklist = Object.fromEntries(rules.callItems('factory').map((i) => [i.key, i.required ? true : 'not_applicable']));
const notes = Object.fromEntries(rules.callItems('factory').map((i) => [i.key, i.required ? null : 'Not a food plant']));
const draft = { review_method: 'video_call', call_started_at: '2026-11-06T02:00:00.000Z', call_ended_at: '2026-11-06T02:40:00.000Z', supplier_participants: 'Nguyen Van A · Director', checklist, checklist_notes: notes, public_photo_ids: ['m0', 'm1'] };
const ok = { draft, scope: 'factory', media, verification: v, confirmations: { observed: true, photos: true }, now: new Date('2026-11-07T00:00:00Z') };
deep(rules.callReviewBlockers(ok), []);
assert.ok(rules.callReviewBlockers({ ...ok, confirmations: { observed: false, photos: true } }).some((b) => /quan sát/.test(b)), 'Observation confirmation required');
assert.ok(rules.callReviewBlockers({ ...ok, confirmations: { observed: true, photos: false } }).some((b) => /mặt người/.test(b)), 'Public photo confirmation required');
assert.ok(rules.callReviewBlockers({ ...ok, draft: { ...draft, public_photo_ids: ['m0'] } }).some((b) => /ít nhất 2 ảnh/.test(b)), 'At least two public photos');
assert.ok(rules.callReviewBlockers({ ...ok, draft: { ...draft, public_photo_ids: ['m0', 'other'] } }).some((b) => /ít nhất 2 ảnh/.test(b)), 'Foreign photo ids do not count');
assert.ok(rules.callReviewBlockers({ ...ok, draft: { ...draft, checklist: { ...checklist, factory_gate: false } } }).some((b) => /Đã thấy/.test(b)), 'Required item must be seen');
assert.ok(rules.callReviewBlockers({ ...ok, draft: { ...draft, checklist_notes: { ...notes, packing_area: null } } }).some((b) => /lý do/.test(b)), 'Not applicable needs a reason');
assert.ok(rules.callReviewBlockers({ ...ok, media: media.slice(1) }).some((b) => /ảnh chụp màn hình/.test(b)), 'Required photo item needs a screenshot');
assert.ok(rules.callReviewBlockers({ ...ok, draft: { ...draft, call_started_at: '2027-01-01T00:00:00.000Z' } }).some((b) => /tương lai/.test(b)));
const partnerDraft = { ...draft, partner_factory_name: 'ABC Factory', checklist: { ...checklist, partner_identity_confirmed: true, partner_scope_confirmed: true, partner_contract_validity: true, partner_factory_match: true } };
const contract = { id: 'c1', verification_id: 'v1', supplier_id: 's1', owner_type: 'verification', kind: 'document', storage_path: 'verifications/v1/c1.pdf', checklist_key: 'partner_factory_contract', status: 'unverified' };
assert.ok(rules.callReviewBlockers({ ...ok, scope: 'partner_contract', draft: partnerDraft, media: [...media, contract] }).some((b) => /Đánh dấu đã kiểm/.test(b)), 'Partner contract must be marked checked');
deep(rules.callReviewBlockers({ ...ok, scope: 'partner_contract', draft: partnerDraft, media: [...media, { ...contract, status: 'checked' }] }), []);

// 4. Đặt lịch.
deep(rules.cleanBookingSlots(['2026-11-10T09:00', 'bad', '2026-11-10T09:00', '2026-11-11T14:30', '2026-11-12T08:00', '2026-11-13T08:00']), ['2026-11-10T09:00', '2026-11-11T14:30', '2026-11-12T08:00']);
const booking = { l2_scope: 'factory', booking_method: 'video_call', booking_contact_name: 'A', booking_contact_phone: '+84 912 345 678', booking_factory_address: 'Long An', booking_slots: ['2026-11-10T09:00'], booking_consent_at: '2026-11-07T00:00:00Z', partner_factory_name: null };
deep(rules.bookingMissing(booking, false, new Date('2026-11-07T00:00:00Z')), []);
deep(rules.bookingMissing({ ...booking, booking_consent_at: null }, false, new Date('2026-11-07T00:00:00Z')), ['consent']);
deep(rules.bookingMissing(booking, false, new Date('2026-11-11T00:00:00Z')), ['future_slot']);
deep(rules.bookingMissing({ ...booking, l2_scope: 'partner_contract' }, false, new Date('2026-11-07T00:00:00Z')), ['contract', 'partner_name']);

// 5. Báo cáo công khai: không lộ địa chỉ chi tiết.
const report = load('lib/public/factory-report.ts');
assert.equal(report.regionFromAddress('Lô 12, KCN Tân Đức, Đức Hòa, Long An, Việt Nam'), 'Long An');
assert.equal(report.regionFromAddress(''), null);
const pdf = report.factoryReportPdfDefinition({ code, supplierName: 'Demo Co', partner: false, partnerFactoryName: null, region: 'Long An', method: 'Live video call', reviewedAt: '6 November 2026', durationMinutes: 40, inspectorName: 'Reviewer Name', approvedAt: '6 November 2026', items: [], verifyUrl: `https://www.veximtrade.com/verify/${code}`, supplierUrl: null },
  [1, 2, 3].map((n) => ({ dataUrl: 'data:image/jpeg;base64,AA==', caption: `Photo ${n}` })));
const photoRows = pdf.content.filter((block) => Array.isArray(block.columns) && block.columns.some((col) => col.stack?.[0]?.image));
assert.equal(photoRows.length, 2, 'Photos are laid out two per row');
assert.ok(JSON.stringify(pdf).includes('not an independent third-party audit'), 'Report states its scope');

// 6. Migration và điểm nối.
const sql = read('supabase/migrations/20261114_l2_call_review.sql');
for (const needle of ['booking_consent_at', 'review_method', 'inspector_name', 'report_code', 'public_photo_ids', 'L2_BOOKING_INCOMPLETE', 'L2_PUBLIC_PHOTOS_REQUIRED', 'L2_CALL_REVIEW_LOCKED', "'live_random_request'"]) {
  assert.ok(sql.includes(needle), `migration covers ${needle}`);
}
assert.doesNotMatch(sql, /drop table|drop column|delete from/i, 'Migration is additive');
const actions = read('app/crm/suppliers/[slug]/call-review-actions.ts');
assert.match(actions, /status: "submitted"[\s\S]*status: "approved"/, 'Approval goes through submitted, as the DB requires');
assert.match(actions, /inspector_name: inspectorName/, 'Reviewer name snapshot stored at approval');
assert.match(actions, /canSelfApproveVerification/, 'Only staff with inspect+approve can finish a call review');
const route = read('app/api/public/factory-report/[code]/route.ts');
assert.match(route, /getBuyerSession/); assert.match(route, /status: 401/, 'Report requires sign-in');
assert.match(read('app/api/supplier-portal/submissions/[id]/upload/route.ts'), /key !== "partner_factory_contract"/, 'Factory photo uploads retired');
assert.match(read('app/supplier/portal/verification/submission-actions.ts'), /L2_CODE_RETIRED = true/, 'Code sheets retired');
assert.match(read('lib/public/factory-report-data.ts'), /supplier\.status !== "published"/, 'Report only for published suppliers');

console.log('check-l2-call-review: ok');
