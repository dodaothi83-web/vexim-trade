// node scripts/check-ai-document-review.mjs — no credentials / external calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const items = [{ key: 'business_license', label: 'Giấy chứng nhận đăng ký kinh doanh' }];
const lib = {};
const libCode = ts.transpileModule(readFileSync(new URL('../lib/ai/document-audit.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(libCode, {
  exports: lib, require: (path) => { assert.equal(path, 'zod'); return require('zod'); },
  Error, Set,
}, { filename: 'document-audit.ts' });
const raw = { checks: items.map((it) => ({ key: it.key, verdict: 'pass', reason: 'Có dấu hiệu phù hợp', evidence_ids: [it.key === 'bank_letter' ? 'fabricated-id' : 'asset-1'] })), summary: 'Đọc sơ bộ' };
const parsed = lib.parseDocumentReview(raw, ['asset-1']);
assert.equal(parsed.checks.length, 1);
assert.equal(parsed.checks[0].verdict, 'pass');
assert.throws(() => lib.parseDocumentReview({ ...raw, checks: [] }, ['asset-1']), /đúng mục đăng ký kinh doanh/);
assert.throws(() => lib.parseDocumentReview({ ...raw, checks: [{ ...raw.checks[0], key: 'haccp_or_brc' }] }, ['asset-1']), /đúng mục đăng ký kinh doanh/);

const route = {};
const routeCode = ts.transpileModule(readFileSync(new URL('../app/api/verifications/[id]/ai-review/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let permissions = true;
let mediaAllowed = true;
let level = 1;
let status = 'in_progress';
let rateAllowed = true;
let providerOk = true;
let fileList = [];
let calls = 0;
let auditCount = 0;
let lastBody;
let reads = 0;
const store = {
  getVerification: async (id) => id === 'review-1' ? { id, target_level: level, status, supplier_id: 'supplier-1' } : null,
  listMedia: async () => fileList,
  getSupplier: async () => ({ name: 'NCC Mẫu', trade_name: 'Mẫu Export', display_name: null }),
  addAuditLog: async (entry) => { auditCount++; assert.ok(!JSON.stringify(entry).includes('mock-file-content')); },
  updateVerification: () => { throw new Error('AI must not save or approve'); },
};
const exports = {};
const mocks = {
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/lib/db': { getStore: () => store },
  '@/lib/auth/session': {
    guard: async (permission) => (permission === 'verifications.inspect' ? permissions : mediaAllowed) ? null : { message: 'Không có quyền' },
    getSession: async () => ({ uid: 'staff-1', email: 'staff@example.test' }),
  },
  '@/lib/media/storage': { getObject: async () => { reads++; return { data: new Uint8Array(Buffer.from('%PDF-1.4 mock-file-content')) }; } },
  '@/lib/media/validate': { sniffMime: () => 'application/pdf' },
  '@/lib/ai/company-introduction': { readOutputText: (payload) => payload.output_text },
  '@/lib/ai/document-audit': lib,
  '@/lib/rfq/rate-limit': { rateLimit: () => ({ ok: rateAllowed }) },
  '@/lib/types': { L1_DOC_ITEMS: items },
};
const env = { OPENAI_API_KEY: 'mock-key' };
vm.runInNewContext(routeCode, {
  exports, require: (path) => { assert.ok(path in mocks, `unknown import ${path}`); return mocks[path]; },
  process: { env }, Response, Request, Buffer, AbortSignal,
  console: { error: () => {} },
  fetch: async (_url, init) => {
    calls++; lastBody = JSON.parse(init.body);
    return providerOk ? Response.json({ output_text: JSON.stringify(raw) }) : Response.json({ error: 'provider-failed' }, { status: 500 });
  },
}, { filename: 'ai-review-route.ts' });
const post = async (id = 'review-1', body) => exports.POST(new Request('https://test.local/api/verifications/' + id + '/ai-review', {
  method: 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
}), { params: Promise.resolve({ id }) });
permissions = false; assert.equal((await post()).status, 403); permissions = true;
mediaAllowed = false; assert.equal((await post()).status, 403); mediaAllowed = true;
assert.equal((await post('missing')).status, 404);
level = 2; assert.equal((await post()).status, 400); level = 1;
status = 'approved'; assert.equal((await post()).status, 409); status = 'in_progress';
env.OPENAI_API_KEY = ''; assert.equal((await post()).status, 503); env.OPENAI_API_KEY = 'mock-key';
rateAllowed = false; assert.equal((await post()).status, 429); rateAllowed = true;
assert.equal((await post()).status, 422);
fileList = [
  { id: 'excluded-public', audience: 'buyer', kind: 'document', storage_path: 'verifications/review-1/public.pdf', bytes: 25, created_at: '2026-01-01' },
  { id: 'excluded-link', audience: 'internal', kind: 'video', external_url: 'https://example.org/sensitive', created_at: '2026-01-01' },
  { id: 'separate-certificate', checklist_key: 'haccp_or_brc', audience: 'internal', kind: 'document', storage_path: 'suppliers/supplier-1/certificates/haccp.pdf', created_at: '2026-01-01' },
  { id: 'excluded-large', checklist_key: 'business_license', audience: 'internal', kind: 'document', storage_path: 'verifications/review-1/large.pdf', bytes: 5 * 1024 * 1024, created_at: '2026-01-01' },
  { id: 'asset-1', checklist_key: 'business_license', audience: 'internal', kind: 'document', storage_path: 'verifications/review-1/a.pdf', bytes: 25, caption: 'Business registration', created_at: '2026-01-01' },
];
const response = await post();
assert.equal(response.status, 200);
const result = await response.json();
assert.deepEqual(result.checks.map((c) => c.key), ['business_license']);
assert.equal(calls, 1);
assert.equal(reads, 1, 'Do not fetch public, oversized or linked media');
assert.equal(auditCount, 1);
assert.equal(result.skipped.length, 1);
assert.equal(lastBody.store, false);
assert.ok(lastBody.input[1].content.some((c) => c.type === 'input_file' && c.file_data.startsWith('data:application/pdf;base64,')));
assert.ok(!JSON.stringify(lastBody).includes('example.org'));
assert.ok(!JSON.stringify(result).includes('mock-file-content'), 'Never return raw document data');
assert.ok(!result.checks.some((c) => c.key !== 'business_license'), 'AI only evaluates the business registration document');
assert.match(lastBody.input[0].content[0].text, /không đánh giá chứng nhận chất lượng vì chúng được duyệt trong luồng riêng/);
assert.match(lastBody.input[0].content[0].text, /không thay thế giấy đăng ký kinh doanh/);
assert.match(lastBody.input[0].content[0].text, /NCC Mẫu/, 'AI needs the registered name to check who the document belongs to');
assert.match(lastBody.input[0].content[0].text, /không trả pass/, 'A document standing in another company name must not pass');
assert.equal((await post('review-1', { fileIds: ['missing'] })).status, 422, 'Cannot scan files outside this review');
assert.equal((await post('review-1', { fileIds: ['asset-1', 'asset-1'] })).status, 400, 'Duplicate IDs rejected');
assert.equal((await post('review-1', { fileIds: [] })).status, 400);
const scopedResponse = await post('review-1', { fileIds: ['asset-1'] });
assert.equal(scopedResponse.status, 200, 'Newly uploaded files can be scanned without waiting for a UI refresh');
assert.deepEqual((await scopedResponse.json()).checks.map((c) => c.key), ['business_license']);
assert.equal(reads, 2, 'Only explicitly selected readable file is opened');
providerOk = false;
assert.equal((await post()).status, 502, 'Provider failure does not mutate review');
console.log('✅ AI document scan: permissions, business-license-only review, scoped evidence and no auto-approval.');
