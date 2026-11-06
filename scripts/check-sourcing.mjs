import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { NextResponse } from 'next/server.js';
function load(file, mocks, extra = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, console: { ...console, error() {} }, Request, Response, Uint8Array, URL, Date, Promise,
      require(id) { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; }, ...extra });
  return mod.exports;
}
const fileRules = load('lib/sourcing/files.ts', {});
const statusLabels = load('lib/sourcing/status.ts', {});
assert.equal(statusLabels.sourcingCrmStatusLabel('new'), 'Mới — chưa tiếp nhận');
assert.equal(statusLabels.sourcingCrmStatusLabel('in_progress'), 'Đang xử lý');
assert.equal(statusLabels.sourcingStatusLabel('new', true), 'Đã nhận', 'Buyer acknowledgement remains unchanged');
assert.equal(statusLabels.sourcingStatusLabel('new', false), 'Received');
const crmPage = fs.readFileSync('app/crm/sourcing/page.tsx', 'utf8');
assert.match(crmPage, /sourcingCrmStatusLabel\(r.status\)/, 'CRM card uses the staff-facing work state');
assert.match(crmPage, /sourcingCrmStatusLabel\(s\)/, 'CRM selector uses the same work-state label');

assert.equal(fileRules.sourcingMime(new TextEncoder().encode('<script>evil</script>')), null);
assert.equal(fileRules.sourcingMime(new TextEncoder().encode('%PDF-1.7 test')), 'application/pdf');
assert.equal(fileRules.sourcingMime(Uint8Array.from([137,80,78,71,13,10,26,10])), 'image/png');
let buyer = { email: 'buyer@example.com', uid: 'buyer' }, staff = null, allowed = true, failSave = false, saveCalls = 0;
const rows = new Map(), files = new Map();
const store = {
  getBuyerUserByEmail: async (email) => ({ email, verified_at: '2026-11-04' }),
  findSourcingSubmission: async (email, key) => [...rows.values()].find((r) => r.buyer_email === email && r.submission_key === key),
  createSourcingRequest: async (row) => { saveCalls++; if (failSave) throw Error('DB unavailable'); rows.set(row.id, row); return row; },
  getSourcingRequest: async (id) => rows.get(id),
  putSourcingFile: async (key, bytes) => files.set(key, bytes),
  deleteSourcingFile: async (key) => files.delete(key),
  getSourcingFile: async (key) => files.get(key),
};
const base = { '@/lib/auth/buyer-session': { getBuyerSession: async () => buyer }, '@/lib/sourcing/store': { sourcingStore: () => store }, '@/lib/sourcing/files': fileRules };
const acks = [];
const { POST } = load('app/api/buyer/sourcing/route.ts', { ...base, '@/lib/sourcing/mail': { sendSourcingAck: async (_store, saved, language) => { acks.push([saved.id, language]); return { ok: true }; } }, 'node:crypto': crypto, 'next/server': { NextResponse }, '@/lib/auth/abuse-protection': { protectPublicRequest: async () => allowed ? { ok: true } : { ok: false, status: 429, message: 'Limited' } } });
const nonce = crypto.randomUUID();
function request({ key = nonce, text = 'Source cashews, two containers to Hanoi.', attachment, origin = 'https://www.veximtrade.com', email } = {}) {
  const fd = new FormData(); fd.set('content', text); fd.set('submission_key', key); fd.set('challengeToken', 'verified');
  if (email) fd.set('buyer_email', email);
  if (attachment) fd.append('files', new Blob([attachment], { type: 'image/png' }), 'sample.png');
  return new Request('https://www.veximtrade.com/api/buyer/sourcing', { method: 'POST', headers: { host: 'www.veximtrade.com', origin }, body: fd });
}
let response = await POST(request({ attachment: '%PDF-1.7 test', email: 'victim@example.com' }));
assert.equal(response.status, 201);
const { id } = await response.json(); const row = rows.get(id);
assert.equal(row.buyer_email, buyer.email, 'Untrusted owner field ignored');
assert.equal(row.status, 'new'); assert.equal(row.attachments[0].mime, 'application/pdf', 'Sniff bytes rather than declared image MIME');
assert.equal(saveCalls, 1); assert.equal(files.size, 1);
response = await POST(request()); assert.equal((await response.json()).id, id); assert.equal(saveCalls, 1, 'Retry deduplicated per buyer');
assert.equal(acks.length, 1, 'Thư xác nhận gửi một lần cho yêu cầu mới, không gửi lại khi bấm gửi trùng');
assert.equal(acks[0][0], id);
response = await POST(request({ key: crypto.randomUUID(), attachment: '<script>evil</script>' })); assert.equal(response.status, 400); assert.equal(files.size, 1);
response = await POST(request({ key: crypto.randomUUID(), attachment: 'a'.repeat(2 * 1024 * 1024 + 1) })); assert.equal(response.status, 400);
response = await POST(request({ text: '   ' })); assert.equal(response.status, 400);
response = await POST(request({ origin: 'https://evil.example' })); assert.equal(response.status, 403);
allowed = false; response = await POST(request()); assert.equal(response.status, 429); allowed = true;
buyer = null; response = await POST(request()); assert.equal(response.status, 401);
buyer = { email: 'other@example.com', uid: 'other' }; response = await POST(request()); assert.equal(response.status, 201); assert.equal(saveCalls, 2, 'Idempotency is buyer-scoped');
const { GET } = load('app/api/buyer/sourcing/[id]/files/[fileId]/route.ts', { ...base, '@/lib/auth/session': { getSession: async () => staff }, '@/lib/auth/permissions': { hasPermission: (role, perm) => role === 'admin' && perm === 'rfq.view' } });
const context = { params: Promise.resolve({ id, fileId: row.attachments[0].id }) };
response = await GET(null, context); assert.equal(response.status, 404, 'Wrong buyer cannot download');
staff = { role: 'supplier' }; response = await GET(null, context); assert.equal(response.status, 404, 'Supplier cannot download');
staff = { role: 'admin' }; response = await GET(null, context); assert.equal(response.status, 200, 'Authorized CRM staff can download');
assert.match(response.headers.get('content-disposition'), /^attachment;/); assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
staff = null; buyer = { email: 'buyer@example.com', uid: 'buyer' }; response = await GET(null, context); assert.equal(response.status, 200);
buyer = null; response = await GET(null, context); assert.equal(response.status, 401);
failSave = true; buyer = { email: 'buyer@example.com', uid: 'buyer' };
response = await POST(request({ key: crypto.randomUUID(), attachment: '%PDF-1.7 test' })); assert.equal(response.status, 503, 'Never fake success when DB unavailable');
// Unknown insert outcome must retain uploaded files, as the DB may have committed.
assert.equal(files.size, 2);
const sourcing = fs.readFileSync('app/api/buyer/sourcing/route.ts', 'utf8');
assert.doesNotMatch(sourcing, /createRfq|rfq_matches|sendMail|targeted-portal|createRfqMatch/, 'No RFQ dispatch or mail side effects');
const migration = fs.readFileSync('supabase/migrations/20261104_buyer_sourcing_requests.sql', 'utf8');
assert.match(migration, /enable row level security/); assert.match(migration, /revoke all .* from anon, authenticated/); assert.match(migration, /'sourcing-files', 'sourcing-files', false/);
const header = fs.readFileSync('components/public-header-controls.tsx', 'utf8'); assert.match(header, /SourcingComposerTrigger/); assert.doesNotMatch(header, /href="\/rfq"/);
const detail = fs.readFileSync('app/(public)/buyer/account/sourcing/[id]/page.tsx', 'utf8'); assert.match(detail, /row.buyer_email !== session.email/); assert.doesNotMatch(detail, /internal_note|assigned_to/);
const action = fs.readFileSync('app/crm/sourcing/actions.ts', 'utf8'); assert.match(action, /requirePagePermission\("rfq.manage"/); assert.match(action, /store.updateSourcingRequest\(id, version/); assert.match(action, /needs_info.*!reply/);
console.log('Sourcing API/security/ownership/retry/separation checks passed.');
