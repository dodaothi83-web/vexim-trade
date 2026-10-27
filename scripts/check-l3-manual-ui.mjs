// Render both supplier and staff components with real React, without a running server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const root = resolve(new URL('..', import.meta.url).pathname);
const cache = new Map();
const actionStubs = {
  addSourceLinkAction: async () => ({}), deleteSourceLinkAction: async () => ({}),
  issueSubmissionCodeAction: async () => ({}), saveShipmentAction: async () => ({}),
  deleteSubmissionItemAction: async () => ({}),
};
function load(file) {
  const absolute = resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} }; cache.set(absolute, mod);
  const code = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const require = (id) => {
    if (id === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
    if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (id === '@/lib/verification-submission') return { VERIFICATION_CODE_TTL_HOURS: 72, MAX_ITEMS_PER_KEY: 3 };
    if (id === './submission-actions') return actionStubs;
    if (id === './submission-item-card') return load(resolve(dirname(absolute), 'submission-item-card.tsx'));
    return nativeRequire(id);
  };
  vm.runInThisContext(`(function(exports, require, module) { ${code}\n})`, { filename: absolute })(mod.exports, require, mod);
  return mod.exports;
}

const { VerificationSubmissionPanel } = load('app/supplier/portal/verification/verification-panel.tsx');
const { SubmissionReviewActions } = load('app/crm/verifications/submissions/[id]/submission-review-actions.tsx');
const row = {
  id: 'item', key: 'other_export_evidence', label: 'Chứng từ xuất khẩu khác', order: 1,
  href: '/api/supplier-portal/submission-file/supplier-submissions/sub-3/file.pdf', thumbHref: null,
  mime: 'application/pdf', isPdf: true, hasExif: false, exifLat: null, exifLng: null,
  exifCapturedLabel: null, exifCapturedAt: null, camera: null, software: null,
  captureLat: null, captureLng: null, captureAccuracy: null, uploadedAt: '2026-10-26T00:00:00Z',
  width: null, height: null, bytes: 200, flags: [], aiVerdict: null, aiReason: null,
  aiDetectedText: null, aiCodeVisible: null, aiCodeRead: null,
};
const baseView = {
  id: 'sub-3', level: 3, status: 'draft', statusLabel: 'Đang soạn', editable: true,
  code: null, codeIssuedAt: null, codeExpired: false, codeTtlHours: 72,
  deviceLat: null, deviceLng: null, deviceAccuracy: null, shipmentRef: null, shippedOn: null,
  shipmentDestination: null, supplierNote: null, reviewNote: null, submittedAt: null,
  aiScannedAt: null, aiSummary: null, aiManipulation: null, aiModel: null,
  acceptedVerificationId: null, ready: true, missing: [], blockers: [], warnings: [],
  requiredTotal: 1, uploadedTotal: 1, items: [row], links: [],
};
const exportSpecs = [{ key: 'other_export_evidence', label: 'Chứng từ xuất khẩu khác', requirement: 'Chọn nếu phù hợp', requiresCode: false, required: false, order: 1 }];
const exportHtml = renderToStaticMarkup(React.createElement(VerificationSubmissionPanel, { view: baseView, specs: exportSpecs }));
assert.match(exportHtml, /Nộp hồ sơ/);
assert.match(exportHtml, /aria-label="Nộp hồ sơ"/, 'Mobile action is a manual submit');
assert.match(exportHtml, /không bắt buộc vận đơn/i);
assert.match(exportHtml, /nhân viên kiểm tra/i);
assert.match(exportHtml, /Nhân viên sẽ kiểm tra khi đối chiếu hồ sơ/);
assert.doesNotMatch(exportHtml, /Hệ thống chỉ tự đọc domain/, 'Source links are checked by staff, not read automatically on upload');
assert.match(exportHtml, /không hiển thị công khai/i);
assert.doesNotMatch(exportHtml, /\bAI\b/i, 'L3 must not render AI buttons or AI results');
assert.doesNotMatch(exportHtml, /vận đơn và tờ khai hải quan là bắt buộc/i);
const fullHtml = renderToStaticMarkup(React.createElement(VerificationSubmissionPanel, {
  view: { ...baseView, items: [row, { ...row, id: 'item-2' }, { ...row, id: 'item-3' }] }, specs: exportSpecs,
}));
assert.match(fullHtml, /Đã đủ 3 tệp/);
assert.match(fullHtml, /Xóa một tệp nếu cần tải tệp khác/);

const l2View = { ...baseView, id: 'sub-2', level: 2, ready: false, items: [], requiredTotal: 9, uploadedTotal: 0 };
const l2Specs = [{ key: 'factory_gate', label: 'Cổng nhà máy', requirement: 'Biển tên', requiresCode: true, required: true, order: 1 }];
const l2Html = renderToStaticMarkup(React.createElement(VerificationSubmissionPanel, { view: l2View, specs: l2Specs }));
assert.match(l2Html, /AI quét thử/);
assert.match(l2Html, /AI quét &amp; nộp hồ sơ/);
assert.match(l2Html, /Tờ mã xác minh/);
const factoryCard = l2Html.match(/<article class="group[\s\S]*?<\/article>/)?.[0] ?? '';
const codeNoteAt = factoryCard.indexOf('Ảnh này bắt buộc có tờ mã xác minh đặt cạnh cảnh.');
const photoButtonAt = factoryCard.indexOf('Chụp hoặc chọn ảnh</button>');
assert.ok(codeNoteAt >= 0 && photoButtonAt > codeNoteAt, 'Lưu ý tờ mã nằm trên nút tải ảnh');
assert.match(factoryCard, /mt-auto space-y-1\.5 pt-1/, 'Nút tải nằm sát đáy thẻ để các nút thẳng hàng');

// Old `hard` AI flags are suggestions, not claims the supplier must fix an item.
const aiRow = { ...row, key: 'factory_gate', label: 'Cổng nhà máy', mime: 'image/jpeg', isPdf: false,
  flags: [
    { flag: 'code_missing', label: 'Không thấy tờ mã', severity: 'hard', source: 'ai', detail: 'AI chưa thấy tờ mã' },
    { flag: 'no_gps', label: 'Không có GPS', severity: 'hard', source: 'gps', detail: 'Không bắt buộc' },
  ],
  aiVerdict: 'fail', aiReason: 'AI chưa thấy tờ mã', aiCodeVisible: false };
const aiView = { ...l2View, ready: true, code: 'VX-L2-ABCD-EFGH', items: [aiRow], uploadedTotal: 1,
  aiSummary: 'AI tóm tắt lần quét', aiFindings: ['AI nghi ảnh dàn dựng'], aiFindingsMayBeOutdated: true };
const aiHtml = renderToStaticMarkup(React.createElement(VerificationSubmissionPanel, { view: aiView, specs: l2Specs }));
assert.match(aiHtml, /AI:.*cần kiểm tra/);
assert.match(aiHtml, /AI lưu ý/);
assert.match(aiHtml, /2 điểm cần lưu ý/);
assert.doesNotMatch(aiHtml, /điểm bắt buộc cần sửa|AI:.*không đạt/);
assert.match(aiHtml, /AI chỉ gợi ý, không tự trả hay duyệt/);
assert.match(aiHtml, /AI tóm tắt lần quét/);
assert.match(aiHtml, /AI nghi ảnh dàn dựng/, 'Gợi ý AI vẫn hiển thị sau khi tải lại trang');
assert.match(aiHtml, /Kết quả quét trước có thể không khớp ảnh hiện tại/);
const needsCodeView = { ...l2View, missing: [], ready: false };
const needsCodeHtml = renderToStaticMarkup(React.createElement(VerificationSubmissionPanel, { view: needsCodeView, specs: l2Specs }));
assert.match(needsCodeHtml, /Cần kiểm tra mã/);
assert.doesNotMatch(needsCodeHtml, /thiếu 0 mục/i);


const staffProps = { submissionId: 'sub', status: 'pending_review', canReview: true, verificationHref: null, aiEnabled: true };
const staffL3 = renderToStaticMarkup(React.createElement(SubmissionReviewActions, { ...staffProps, level: 3 }));
const staffL2 = renderToStaticMarkup(React.createElement(SubmissionReviewActions, { ...staffProps, level: 2 }));
assert.doesNotMatch(staffL3, /Quét lại bằng AI/);
assert.match(staffL3, /Nhận vào đợt kiểm/);
assert.match(staffL2, /Quét lại bằng AI/);
console.log('✅ L3 supplier/staff UI renders manual submit without AI; L2 AI controls remain.');

const partnerView = { ...baseView, id: 'sub-partner', level: 2, l2Scope: 'partner_contract', ready: true, items: [{ ...row, key: 'partner_factory_contract', label: 'Hợp đồng với nhà máy đối tác' }] };
const partnerSpecs = [
  { key: 'partner_factory_contract', label: 'Hợp đồng với nhà máy đối tác', requirement: 'Đúng hai bên', required: true, requiresCode: false, order: 1 },
  { key: 'partner_factory_photos', label: 'Ảnh nhà máy đối tác', requirement: 'Tùy chọn', required: false, requiresCode: false, order: 2 },
];
const partnerHtml = renderToStaticMarkup(React.createElement(VerificationSubmissionPanel, { view: partnerView, specs: partnerSpecs }));
assert.match(partnerHtml, /Hợp đồng với nhà máy đối tác/);
assert.match(partnerHtml, /Nộp hồ sơ/);
assert.doesNotMatch(partnerHtml, /AI quét|Tờ mã xác minh|Vị trí khi chụp/, 'Partner flow is manual and has no factory code or GPS');
assert.match(partnerHtml, /application\/pdf/, 'Contract accepts PDF');
const partnerStaff = renderToStaticMarkup(React.createElement(SubmissionReviewActions, { ...staffProps, level: 2, partner: true }));
assert.doesNotMatch(partnerStaff, /Quét lại bằng AI|chưa cấu hình OPENAI/i);
console.log('✅ L2 partner UI renders a manual contract upload without factory-only controls.');
