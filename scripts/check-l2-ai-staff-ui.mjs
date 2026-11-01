// Render CRM queue/detail to verify that manual staff review does not depend on AI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const jsx = require('react/jsx-runtime');
const icons = require('lucide-react');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, console, Date, Map, Set, process,
    require: (id) => { assert.ok(id in mocks, `Unexpected import ${id} in ${file}`); return mocks[id]; },
  }, { filename: file });
  return mod.exports;
}
const types = load('lib/types.ts');
const rules = load('lib/verification-submission.ts', { 'node:crypto': require('node:crypto'), '@/lib/types': types });
const scope = load('lib/l2-scope.ts');
const view = load('lib/supplier-portal/submission-view.ts', {
  '@/lib/types': types, '@/lib/verification-submission': rules, '@/lib/media/image-integrity': { formatDaylight: () => 'time' },
});
const Link = ({ children, ...props }) => React.createElement('a', props, children);
const block = ({ children, className }) => React.createElement('div', { className }, children);
const ui = { Breadcrumbs: () => null, Badge: block, Card: block, EmptyState: ({ title }) => React.createElement('p', null, title) };
const header = { PageHeader: ({ title, sub, actions }) => React.createElement('header', null, title, sub, actions) };
const actions = load('app/crm/verifications/submissions/[id]/submission-review-actions.tsx', {
  react: React, 'react/jsx-runtime': jsx, 'next/link': { __esModule: true, default: Link },
  'next/navigation': { useRouter: () => ({ refresh() {} }) }, 'lucide-react': icons,
});
const now = new Date().toISOString();
const submission = { id: 'case-1', supplier_id: 'supplier-1', target_level: 2, l2_scope: 'factory', status: 'pending_review',
  verification_code: 'VX-L2-ABCD-EFGH', code_issued_at: now, ai_scanned_at: now, submitted_at: now, updated_at: now,
  ai_review: null, flags: [], device_lat: null, device_lng: null, device_accuracy_m: null,
  supplier_note: null, review_note: null, reviewed_by: null, verification_id: null };
const items = types.L2_FACTORY_PHOTO_ITEMS.map((spec, i) => ({ id: `item-${i}`, submission_id: submission.id, supplier_id: submission.supplier_id,
  checklist_key: spec.key, media_id: `media-${i}`, storage_path: `photos/${i}.jpg`, thumb_path: null,
  mime: 'image/jpeg', flags: i === 0 ? [{ flag: 'code_missing', source: 'ai', severity: 'hard', detail: 'AI chưa thấy tờ mã' }] : [],
  has_exif: false, uploaded_at: now, ai_verdict: i === 0 ? 'fail' : null,
  ai_reason: i === 0 ? 'AI chưa thấy tờ mã' : null, ai_code_read: null, ai_code_visible: i === 0 ? false : null }));
submission.ai_review = { model: 'mock', scanned_at: now, summary: 'AI có điểm cần đối chiếu', manipulation_suspected: true,
  items: { factory_gate: { verdict: 'fail', reason: 'AI chưa thấy tờ mã', code_visible: false, flags: ['code_missing'] } },
  evidence_snapshot: rules.evidenceSnapshot(submission, items) };
const supplier = { id: 'supplier-1', name: 'Nhà máy ABC', address: 'Hà Nội', supplier_type: 'manufacturer' };
const store = { listSubmissions: async () => [submission], listSuppliers: async () => [supplier], listSubmissionItems: async () => items };
const auth = { requirePagePermission: async () => ({ role: 'reviewer' }) };
const common = { 'react/jsx-runtime': jsx, 'next/link': { __esModule: true, default: Link }, 'lucide-react': icons,
  '@/lib/auth/session': auth, '@/lib/auth/permissions': { hasPermission: () => true },
  '@/lib/verification-submission': rules, '@/components/ui': ui, '@/components/page-header': header };
const queue = load('app/crm/verifications/submissions/page.tsx', { ...common, '@/lib/db': { getStore: () => store }, '@/lib/l2-scope': scope });
const detail = load('app/crm/verifications/submissions/[id]/page.tsx', { ...common,
  'next/navigation': { notFound: () => { throw new Error('unexpected 404'); } },
  '@/lib/supplier-portal/submission-access': { loadStaffSubmission: async () => ({ submission, items, links: [], supplier }) },
  '@/lib/supplier-portal/submission-view': view, '@/lib/verification': { auditHref: () => '/audit' },
  './submission-review-actions': actions, './link-probe-button': { LinkProbeButton: () => null },
});
const queueHtml = renderToStaticMarkup(await queue.default({ searchParams: Promise.resolve({}) }));
assert.match(queueHtml, /Nhà máy ABC/);
assert.match(queueHtml, /Đối chiếu &amp; xét/);
assert.match(queueHtml, /Nhân viên đối chiếu thủ công; không cần AI để xét/);
assert.doesNotMatch(queueHtml, /AI lưu ý|AI gợi ý|chưa quét AI|Lần quét trước/);
const detailHtml = renderToStaticMarkup(await detail.default({ params: Promise.resolve({ id: submission.id }) }));
assert.match(detailHtml, /Xét duyệt thủ công: không cần AI/);
assert.match(detailHtml, /Nhận vào đợt kiểm/);
assert.match(detailHtml, /Trả hồ sơ/);
assert.match(detailHtml, /Không cần AI\. Nhân viên tự kiểm tra/);
assert.doesNotMatch(detailHtml, /AI lưu ý|AI chưa thấy tờ mã|AI nghi ngờ ảnh bị chỉnh sửa|Tóm tắt AI/);
// Historical scans stay stored but never gate the CRM queue or staff decision screen.
items[0].storage_path = 'photos/new-gate.jpg';
const staleQueue = renderToStaticMarkup(await queue.default({ searchParams: Promise.resolve({}) }));
const staleDetail = renderToStaticMarkup(await detail.default({ params: Promise.resolve({ id: submission.id }) }));
assert.doesNotMatch(staleQueue, /Lần quét trước có thể không khớp ảnh hiện tại/);
assert.doesNotMatch(staleDetail, /Kết quả AI từ lần quét trước/);
const auditForm = readFileSync(new URL('../app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx', import.meta.url), 'utf8');
assert.match(auditForm, /Không cần AI/);
assert.match(auditForm, /v\.target_level === 1 && editable/, 'Only L1 shows the CRM document-AI panel');
console.log('✅ L2/L3 CRM review: AI scan controls/results are bypassed; staff can review and upload evidence manually.');
