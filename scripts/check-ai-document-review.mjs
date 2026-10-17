// node scripts/check-ai-document-review.mjs — no credentials / external calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const items = ['business_license', 'tax_certificate', 'bank_letter', 'food_safety', 'haccp_or_brc', 'product_certs', 'export_license'].map((key) => ({ key, label: key }));
const lib = {};
const libCode = ts.transpileModule(readFileSync(new URL('../lib/ai/document-audit.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(libCode, {
  exports: lib, require: (path) => path === 'zod' ? require('zod') : { L1_DOC_ITEMS: items },
  Error, Set,
}, { filename: 'document-audit.ts' });
const raw = { checks: items.map((it) => ({ key: it.key, verdict: 'pass', reason: 'Có dấu hiệu phù hợp', evidence_ids: [it.key === 'bank_letter' ? 'fabricated-id' : 'asset-1'] })), summary: 'Đọc sơ bộ' };
const parsed = lib.parseDocumentReview(raw, ['asset-1']);
assert.equal(parsed.checks.length, 7);
assert.equal(parsed.checks.find((c) => c.key === 'bank_letter').verdict, 'uncertain', 'Unreferenced claims cannot pass');
assert.equal(parsed.checks.find((c) => c.key === 'tax_certificate').verdict, 'pass');
assert.throws(() => lib.parseDocumentReview({ ...raw, checks: raw.checks.slice(1) }, ['asset-1']), /đủ 7/);
assert.throws(() => lib.parseDocumentReview({ ...raw, checks: raw.checks.map((c) => ({ ...c, key: 'tax_certificate' })) }, ['asset-1']), /đủ 7/);

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
  { id: 'excluded-large', audience: 'internal', kind: 'document', storage_path: 'verifications/review-1/large.pdf', bytes: 5 * 1024 * 1024, created_at: '2026-01-01' },
  { id: 'asset-1', audience: 'internal', kind: 'document', storage_path: 'verifications/review-1/a.pdf', bytes: 25, caption: 'Business registration', created_at: '2026-01-01' },
];
const response = await post();
assert.equal(response.status, 200);
const result = await response.json();
assert.equal(result.checks.find((c) => c.key === 'bank_letter').verdict, 'uncertain');
assert.equal(calls, 1);
assert.equal(reads, 1, 'Do not fetch public, oversized or linked media');
assert.equal(auditCount, 1);
assert.equal(result.skipped.length, 1);
assert.equal(lastBody.store, false);
assert.ok(lastBody.input[1].content.some((c) => c.type === 'input_file' && c.file_data.startsWith('data:application/pdf;base64,')));
assert.ok(!JSON.stringify(lastBody).includes('example.org'));
assert.ok(!JSON.stringify(result).includes('mock-file-content'), 'Never return raw document data');
assert.equal(result.checks.find((c) => c.key === 'tax_certificate').verdict, 'uncertain', 'Never claim OCR confirms a numeric identifier');
assert.deepEqual(result.checks.find((c) => c.key === 'tax_certificate').evidence_ids, []);
assert.match(lastBody.input[0].content[0].text, /tax_certificate và bank_letter chỉ là ô nhập số thủ công/);
assert.match(lastBody.input[0].content[0].text, /food_safety và haccp_or_brc đều tùy chọn/, 'AI must not describe factory certificates as mandatory for traders');
assert.equal((await post('review-1', { fileIds: ['missing'] })).status, 422, 'Cannot scan files outside this review');
assert.equal((await post('review-1', { fileIds: ['asset-1', 'asset-1'] })).status, 400, 'Duplicate IDs rejected');
assert.equal((await post('review-1', { fileIds: [] })).status, 400);
const scopedResponse = await post('review-1', { fileIds: ['asset-1'] });
assert.equal(scopedResponse.status, 200, 'Newly uploaded files can be scanned without waiting for a UI refresh');
assert.equal((await scopedResponse.json()).checks.find((c) => c.key === 'bank_letter').verdict, 'uncertain');
assert.equal(reads, 2, 'Only explicitly selected readable file is opened');
providerOk = false;
assert.equal((await post()).status, 502, 'Provider failure does not mutate review');
console.log('✅ AI document scan: permissions, internal evidence, seven-item validation and no auto-approval.');
