// Exercise the real client panel's scan handlers with mock hooks and API responses.
// No browser, database, AI key, or additional dependencies are required.
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
const source = readFileSync(new URL('../app/supplier/portal/verification/verification-panel.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

const baseView = {
  id: 'sub-2', level: 2, l2Scope: 'factory', status: 'draft', statusLabel: 'Đang soạn', editable: true,
  code: null, codeIssuedAt: null, codeExpired: false, codeTtlHours: 72,
  deviceLat: null, deviceLng: null, deviceAccuracy: null, shipmentRef: null, shippedOn: null,
  shipmentDestination: null, supplierNote: null, reviewNote: null, submittedAt: null,
  aiScannedAt: null, aiSummary: null, aiManipulation: null, aiModel: null,
  acceptedVerificationId: null, ready: true, missing: [], blockers: [], warnings: [],
  requiredTotal: 9, uploadedTotal: 9, items: [], links: [],
};

function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return node && typeof node === 'object' ? text(node.props?.children) : '';
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
function occurrences(value, needle) { return value.split(needle).length - 1; }

function mount(view, response) {
  const slots = [];
  let cursor = 0;
  let requests = 0;
  let refreshes = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useCallback: (fn) => fn,
    useEffect: () => {}, // Geolocation is unrelated to feedback and must not run in this test.
  };
  const mocks = {
    'react/jsx-runtime': jsx, react: hooks, 'lucide-react': icons,
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshes += 1; } }) },
    '@/lib/verification-submission': { VERIFICATION_CODE_TTL_HOURS: 72 },
    './submission-actions': {},
    './submission-item-card': { SubmissionItemCard: () => null },
    './benefits': { VerificationBenefits: () => null },
  };
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports,
    require(id) { assert.ok(id in mocks, `Unexpected import: ${id}`); return mocks[id]; },
    window: { confirm: () => true },
    fetch: async (_url, options) => {
      requests += 1;
      assert.equal(JSON.parse(options.body).submit, response.submit);
      return { ok: response.httpOk, json: async () => response.body };
    },
    console, Date,
  }, { filename: 'verification-panel.tsx' });
  const render = () => { cursor = 0; return mod.exports.VerificationSubmissionPanel({ view, specs: [] }); };
  return {
    render,
    getRequests: () => requests,
    getRefreshes: () => refreshes,
  };
}

async function clickAndRender(view, response) {
  const app = mount(view, response);
  const before = app.render();
  const button = find(before, (node) => node.type === 'button' && (response.submit
    ? ['Nộp hồ sơ', 'AI quét và nộp hồ sơ'].includes(node.props['aria-label'])
    : text(node).includes('AI quét thử')));
  assert.ok(button && !button.props.disabled, 'Expected enabled scan/submit control');
  button.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.getRequests(), 1);
  return { html: renderToStaticMarkup(app.render()), refreshes: app.getRefreshes() };
}

const unscanned = 'Hệ thống chưa quét được bằng AI. Hãy hoàn thiện và nộp hồ sơ để nhân viên đối chiếu.';
let result = await clickAndRender(baseView, { submit: false, httpOk: true, body: {
  ok: true, status: 'draft', aiScanned: false, message: unscanned, summary: null, reasons: [], warnings: [],
} });
assert.equal(occurrences(result.html, unscanned), 1, 'A failed trial scan appears once, not in both the banner and AI panel');
assert.match(result.html, /role="status"[^>]*[\s\S]*?Trạng thái quét AI/);
assert.doesNotMatch(result.html, /chưa cấu hình khoá AI|chưa có tệp đọc được/);
assert.equal(result.refreshes, 1);

const scanned = 'AI đã quét thử. Hãy xem kết quả trước khi tiếp tục.';
result = await clickAndRender(baseView, { submit: false, httpOk: true, body: {
  ok: true, status: 'draft', aiScanned: true, message: scanned, summary: scanned, reasons: [], warnings: [],
} });
assert.equal(occurrences(result.html, scanned), 1, 'Identical AI message and summary are not repeated');
assert.match(result.html, /Gợi ý từ AI/);

const flagged = 'Hồ sơ đã được gửi. AI có điểm cần kiểm tra; nhân viên sẽ đối chiếu và quyết định.';
const aiReason = 'Cổng nhà máy: AI chưa thấy tờ mã';
result = await clickAndRender(baseView, { submit: true, httpOk: true, body: {
  ok: true, status: 'pending_review', aiScanned: true, message: flagged, summary: null,
  reasons: [aiReason], warnings: [`AI lưu ý · ${aiReason}`],
} });
assert.equal(occurrences(result.html, flagged), 1);
assert.equal(occurrences(result.html, aiReason), 1, 'A finding and its identical AI flag are not repeated');
assert.match(result.html, /role="status"[^>]*[\s\S]*?Cổng nhà máy/);
assert.match(result.html, /AI chỉ gợi ý, không tự trả hay duyệt hồ sơ/);
assert.doesNotMatch(result.html, /hồ sơ được trả lại|AI.*không đạt/i);

// A real structural/business failure remains an alert, not an AI decision.
const blocked = 'Chưa nộp được: hồ sơ còn thiếu mục bắt buộc hoặc thiếu mã xác minh.';
result = await clickAndRender(baseView, { submit: true, httpOk: true, body: {
  ok: false, status: 'draft', aiScanned: false, message: blocked, summary: null, reasons: ['Cần tạo mã'], warnings: [],
} });
assert.equal(occurrences(result.html, blocked), 1);
assert.match(result.html, /role="alert"[^>]*[\s\S]*?Cần tạo mã/);

const olderView = { ...baseView, aiSummary: 'Lần trước AI có nhận xét.', aiFindings: ['AI nghi ảnh dàn dựng.'], aiFindingsMayBeOutdated: true };
const olderMessage = 'Hồ sơ đã được gửi. Kết quả AI từ lần trước có thể không khớp ảnh hiện tại; nhân viên sẽ đối chiếu.';
result = await clickAndRender(olderView, { submit: true, httpOk: true, body: {
  ok: true, status: 'pending_review', aiScanned: false, message: olderMessage, reasons: [], warnings: [],
} });
assert.match(result.html, /AI nghi ảnh dàn dựng/, 'Kết quả trước vẫn có thể xem khi lượt mới không khả dụng');
assert.equal(occurrences(result.html, 'AI chỉ gợi ý, không tự trả hay duyệt hồ sơ.'), 1, 'Không nhắc lại cùng thông báo AI ở hai khung');
assert.equal(occurrences(result.html, 'không khớp ảnh hiện tại'), 1, 'Không nhắc lặp cảnh báo kết quả cũ');

const failure = 'Chưa xử lý được hồ sơ. Thử lại sau.';
result = await clickAndRender(baseView, { submit: false, httpOk: false, body: { message: failure } });
assert.equal(occurrences(result.html, failure), 1, 'HTTP errors are still shown once');
assert.doesNotMatch(result.html, /Trạng thái quét AI|Gợi ý từ AI/);
assert.equal(result.refreshes, 0);

for (const view of [{ ...baseView, level: 3, l2Scope: null }, { ...baseView, l2Scope: 'partner_contract' }]) {
  const manual = 'Đã nộp hồ sơ. Nhân viên sẽ kiểm tra và phản hồi.';
  result = await clickAndRender(view, { submit: true, httpOk: true, body: { ok: true, message: manual } });
  assert.equal(occurrences(result.html, manual), 1, 'Manual L2/L3 submission feedback is preserved');
  assert.doesNotMatch(result.html, /Trạng thái quét AI|Gợi ý từ AI/);
  assert.equal(result.refreshes, 1);
}
console.log('✅ L2 scan feedback: one result, clear draft/submission states, visible errors; manual L2/L3 messages retained.');
