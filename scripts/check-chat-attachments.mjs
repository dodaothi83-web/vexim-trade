/**
 * Tệp đính kèm trong chat người mua ↔ nhà cung cấp (duyệt 24/11/2026):
 *  - chỉ PDF, ảnh, .xlsx, .docx, .csv; 10 MB mỗi tệp; 5 tệp mỗi tin; kiểm nội dung thật (magic bytes)
 *  - hạn mức Basic 200 MB / Premium 2 GB / Pro 10 GB; tệp trùng không tính thêm, không tải lại
 *  - chỉ hai bên của cuộc và nhân viên có quyền xem tin mới mở được tệp; Word/Excel luôn tải về
 *  - tệp không gửi dọn sau 24 giờ; tệp đã gửi xoá sau 6 tháng, tin vẫn hiện "tệp đã hết hạn"
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../lib/chat/attachments-core.ts';
import * as chatCore from '../lib/chat/core.ts';
import * as plans from '../lib/supplier-plans.ts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
function load(file, mocks) {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, console: { ...console, error() {} }, Date, Promise, Map, Set, Uint8Array, TextDecoder, URL, encodeURIComponent, require: (id) => {
    assert.ok(id in mocks, `Unexpected ${id} in ${file}`); return mocks[id];
  } });
  return module.exports;
}

/* ---------- 1. Quy tắc chung ---------- */
const MB = 1024 * 1024;
assert.equal(core.CHAT_FILE_MAX_BYTES, 10 * MB);
assert.equal(core.CHAT_FILES_PER_MESSAGE, 5);
assert.equal(core.CHAT_FILE_RETENTION_DAYS, 180, 'Giữ tệp 6 tháng');
assert.equal(core.CHAT_UNSENT_TTL_HOURS, 24);
assert.deepEqual([core.chatQuotaBytes('basic'), core.chatQuotaBytes('premium'), core.chatQuotaBytes('pro')], [200 * MB, 2048 * MB, 10240 * MB]);
for (const name of ['Catalogue.pdf', 'photo.JPG', 'a.jpeg', 'b.png', 'c.webp', 'Giá.xlsx', 'Hợp đồng.docx', 'list.csv']) assert.ok(core.checkChatFile({ name, size: 1000 }).ok, name);
for (const name of ['setup.exe', 'files.zip', 'files.rar', 'old.doc', 'old.xls', 'macro.xlsm', 'page.html', 'icon.svg', 'script.js', 'noext', '.pdf']) {
  assert.equal(core.checkChatFile({ name, size: 1000 }).ok, false, `${name} bị chặn`);
}
assert.deepEqual(core.checkChatFile({ name: 'a.pdf', size: 10 * MB + 1 }), { ok: false, error: 'size' });
assert.deepEqual(core.checkChatFile({ name: 'a.pdf', size: 0 }), { ok: false, error: 'size' });
assert.equal(core.cleanFileName('C:\\Users\\x\\"bad"<name>.pdf'), 'badname.pdf');
assert.equal(core.cleanFileName('../../etc/passwd.csv'), 'passwd.csv');
assert.ok(core.cleanFileName(`${'a'.repeat(200)}.xlsx`).endsWith('.xlsx') && core.cleanFileName(`${'a'.repeat(200)}.xlsx`).length <= 120);
assert.ok(!core.CHAT_FILE_ACCEPT.includes('zip') && !core.CHAT_FILE_ACCEPT.includes('exe'));

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p));
const PDF = bytes('%PDF-1.7\n'), PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), JPG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '), ZIP = bytes([0x50, 0x4b, 0x03, 0x04, 0, 0]), EXE = bytes('MZ', [0x90, 0, 3, 0]);
assert.ok(core.contentMatchesKind('pdf', 'application/pdf', PDF));
assert.ok(core.contentMatchesKind('pdf', 'application/pdf', bytes([0xef, 0xbb, 0xbf], '%PDF-1.4')), 'PDF có vài byte trước %PDF- vẫn nhận');
assert.equal(core.contentMatchesKind('pdf', 'application/pdf', EXE), false, 'Tệp chạy được đổi đuôi .pdf bị chặn');
assert.ok(core.contentMatchesKind('image', 'image/png', PNG) && core.contentMatchesKind('image', 'image/jpeg', JPG) && core.contentMatchesKind('image', 'image/webp', WEBP));
assert.equal(core.contentMatchesKind('image', 'image/png', JPG), false, 'Ảnh phải đúng loại như đuôi');
assert.ok(core.contentMatchesKind('sheet', '', ZIP) && core.contentMatchesKind('doc', '', ZIP));
assert.equal(core.contentMatchesKind('doc', '', PDF), false);
assert.ok(core.contentMatchesKind('csv', 'text/csv', bytes('name,qty\nCashew,20\n')));
assert.equal(core.contentMatchesKind('csv', 'text/csv', EXE), false);
assert.equal(core.contentMatchesKind('csv', 'text/csv', ZIP), false);
assert.equal(core.contentMatchesKind('csv', 'text/csv', bytes('a,b', [0], 'c')), false, 'CSV không có byte 0');
assert.equal(core.opensInline('sheet') || core.opensInline('doc') || core.opensInline('csv'), false, 'Word/Excel/CSV luôn tải về');
assert.ok(core.opensInline('image') && core.opensInline('pdf'));
assert.equal(core.chatFileExpiresAt('2026-11-24T00:00:00.000Z'), '2027-05-23T00:00:00.000Z');
assert.equal(core.formatChatFileSize(1536 * 1024), '1.5 MB');
assert.equal(core.formatChatFileSize(1536 * 1024, 'vi-VN'), '1,5 MB');
assert.equal(core.formatChatFileSize(300), '1 KB');

/* ---------- 2. Dịch vụ: tải lên, gộp tệp trùng, hạn mức, kiểm nội dung, dọn ---------- */
const rows = [], objects = new Map(), deleted = [];
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const supplierPlan = { s1: { id: 's1', plan: 'basic' }, s2: { id: 's2', plan: 'pro', plan_expires_at: '2099-01-01T00:00:00Z' } };
const store = {
  getSupplier: async (id) => supplierPlan[id] ?? null,
  createChatAttachment: async (input) => { const row = { ...input, id: uuid(), created_at: new Date(Date.now() + seq).toISOString(), deleted_at: null }; rows.push(row); return row; },
  getChatAttachment: async (id) => rows.find((r) => r.id === id) ?? null,
  updateChatAttachment: async (id, patch) => Object.assign(rows.find((r) => r.id === id), patch),
  deleteChatAttachment: async (id) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
  findReadyChatAttachment: async (key, sha, size) => rows.filter((r) => r.uploader_key === key && r.sha256 === sha && r.size_bytes === size && r.status === 'ready').at(-1) ?? null,
  listChatAttachmentsForMessages: async (ids) => rows.filter((r) => r.message_id && ids.includes(r.message_id)),
  listChatAttachmentUsage: async (key) => rows.filter((r) => r.uploader_key === key && r.status !== 'deleted'),
  countChatAttachmentsSince: async (key, since) => rows.filter((r) => r.uploader_key === key && r.created_at >= since).length,
  linkChatAttachments: async ({ ids, messageId, conversationId, uploaderKey, expiresAt }) => {
    let n = 0;
    for (const r of rows) if (ids.includes(r.id) && r.conversation_id === conversationId && r.uploader_key === uploaderKey && r.status === 'ready' && !r.message_id) { r.message_id = messageId; r.expires_at = expiresAt; n++; }
    return n;
  },
  listChatAttachmentsToClean: async ({ unsentBefore, now }) => ({
    unsent: rows.filter((r) => !r.message_id && r.status !== 'deleted' && r.created_at < unsentBefore),
    expired: rows.filter((r) => r.message_id && r.status === 'ready' && r.expires_at < now),
  }),
  countChatAttachmentRefs: async (key, exclude) => rows.filter((r) => r.storage_key === key && r.status !== 'deleted' && !exclude.includes(r.id)).length,
};
const storage = {
  presignedUpload: async (key, type) => `https://r2.example/${key}?type=${encodeURIComponent(type)}`,
  presignedDownload: async (key, { disposition }) => `https://r2.example/${key}?rcd=${encodeURIComponent(disposition)}`,
  inspectObject: async (key) => objects.has(key) ? { size: objects.get(key).byteLength, head: objects.get(key).slice(0, 4096) } : null,
  putObject: async (key, data) => { objects.set(key, data); },
  deleteObject: async (key) => { deleted.push(key); objects.delete(key); },
  getObject: async (key) => objects.has(key) ? { data: objects.get(key) } : null,
};
const files = load('lib/chat/attachments.ts', {
  'server-only': {}, 'node:crypto': crypto, '@/lib/media/storage': storage, '@/lib/supplier-plans': plans, './attachments-core': core,
});
const conv = { id: 'c0000001', buyer_email: 'buyer@acme.com', supplier_id: 's1' };
const supplier = { side: 'supplier', supplierId: 's1', store };
const buyer = { side: 'buyer', email: 'Buyer@Acme.com', store };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pdf = new Uint8Array(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 32)]));

assert.equal(files.uploaderKey(buyer), 'buyer:buyer@acme.com');
const ticket = await files.beginChatUpload({ conversation: conv, viewer: supplier, name: 'Catalogue 2026.pdf', size: pdf.byteLength, sha256: sha(pdf) });
assert.ok(ticket.upload?.direct && ticket.upload.url.startsWith('https://r2.example/chat/'), 'Tải thẳng lên kho');
assert.equal(ticket.upload.headers['Content-Type'], 'application/pdf');
const row1 = rows.find((r) => r.id === ticket.attachment.id);
assert.equal(row1.status, 'pending');
assert.ok(!row1.storage_key.includes('s1') && /^chat\/[0-9a-f]{24}\/[0-9a-f]{64}\.pdf$/.test(row1.storage_key), 'Đường dẫn không lộ mã bên tải');
await assert.rejects(files.finishChatUpload({ conversation: conv, viewer: supplier, id: row1.id }), { code: 'missing' }, 'Chưa có tệp thì chưa xong');
await assert.rejects(files.finishChatUpload({ conversation: conv, viewer: buyer, id: row1.id }), { code: 'not_found' }, 'Bên kia không hoàn tất hộ được');
objects.set(row1.storage_key, pdf);
assert.equal((await files.finishChatUpload({ conversation: conv, viewer: supplier, id: row1.id })).id, row1.id);
assert.equal(row1.status, 'ready');

// Gửi lại đúng tệp đó (vd. cho người mua khác): không tải lại, không tính thêm dung lượng.
const again = await files.beginChatUpload({ conversation: { ...conv, id: 'c0000002' }, viewer: supplier, name: 'Catalogue.pdf', size: pdf.byteLength, sha256: sha(pdf) });
assert.equal(again.upload, null, 'Tệp trùng dùng lại ngay');
assert.equal(rows.find((r) => r.id === again.attachment.id).storage_key, row1.storage_key);
assert.equal(await files.chatStorageUsed(store, 'supplier:s1'), pdf.byteLength, 'Tệp trùng chỉ tính một lần');

// Đổi đuôi tệp chạy được thành .pdf: bị chặn khi kiểm nội dung, tệp bị xoá.
const exe = new Uint8Array(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]));
const bad = await files.beginChatUpload({ conversation: conv, viewer: supplier, name: 'invoice.pdf', size: exe.byteLength, sha256: sha(exe) });
const badRow = rows.find((r) => r.id === bad.attachment.id);
objects.set(badRow.storage_key, exe);
await assert.rejects(files.finishChatUpload({ conversation: conv, viewer: supplier, id: badRow.id }), { code: 'content' });
assert.ok(!rows.includes(badRow) && deleted.includes(badRow.storage_key));
// Khai một dung lượng, tải lên dung lượng khác: bị chặn.
const lie = await files.beginChatUpload({ conversation: conv, viewer: supplier, name: 'b.pdf', size: 100, sha256: sha('lie') });
objects.set(rows.find((r) => r.id === lie.attachment.id).storage_key, pdf);
await assert.rejects(files.finishChatUpload({ conversation: conv, viewer: supplier, id: lie.attachment.id }), { code: 'size' });

await assert.rejects(files.beginChatUpload({ conversation: conv, viewer: supplier, name: 'setup.exe', size: 10, sha256: sha('x') }), { code: 'type' });
await assert.rejects(files.beginChatUpload({ conversation: conv, viewer: supplier, name: 'a.pdf', size: 11 * MB, sha256: sha('x') }), { code: 'size' });
await assert.rejects(files.beginChatUpload({ conversation: conv, viewer: supplier, name: 'a.pdf', size: 10, sha256: 'nope' }), { code: 'hash' });

// Hạn mức: Basic 200 MB (tính cả tệp đang tải); Pro 10 GB.
for (let i = 0; i < 19; i++) rows.push({ id: uuid(), conversation_id: 'old', uploader_key: 'supplier:s1', storage_key: `chat/x/${i}`, size_bytes: 10 * MB, status: 'ready', created_at: '2026-01-01T00:00:00Z', message_id: 'm-old' });
await assert.rejects(files.beginChatUpload({ conversation: conv, viewer: supplier, name: 'big.pdf', size: 10 * MB, sha256: sha('big') }), { code: 'quota' });
for (let i = 0; i < 19; i++) rows.push({ id: uuid(), conversation_id: 'old', uploader_key: 'supplier:s2', storage_key: `chat/y/${i}`, size_bytes: 10 * MB, status: 'ready', created_at: '2026-01-01T00:00:00Z', message_id: 'm-old' });
assert.ok((await files.beginChatUpload({ conversation: { ...conv, supplier_id: 's2' }, viewer: { side: 'supplier', supplierId: 's2', store }, name: 'big.pdf', size: 10 * MB, sha256: sha('big') })).upload);

// Gắn tệp vào tin: chỉ tệp đã xong, của đúng bên, đúng cuộc, tối đa 5.
await assert.rejects(files.readyAttachmentsFor(store, conv, 'buyer:buyer@acme.com', [row1.id]), { code: 'missing' }, 'Không gửi kèm tệp của người khác');
await assert.rejects(files.readyAttachmentsFor(store, conv, 'supplier:s1', [ticket.attachment.id, 'x', 'y', 'z', 'w', 'v']), { code: 'not_found' });
assert.equal((await files.readyAttachmentsFor(store, conv, 'supplier:s1', [row1.id])).length, 1);

// Link mở tệp: Word/Excel luôn tải về, PDF mở ngay; tên có dấu giữ đúng.
const docRow = { ...row1, file_name: 'Hợp đồng.docx', content_type: 'x', status: 'ready' };
assert.match((await files.attachmentDelivery(docRow, false)).redirect, /attachment%3B/);
assert.match((await files.attachmentDelivery(row1, false)).redirect, /inline%3B/);
assert.match((await files.attachmentDelivery(row1, true)).redirect, /attachment%3B/);
assert.equal(files.contentDisposition('Hợp đồng.docx', false), `attachment; filename="Hop dong.docx"; filename*=UTF-8''${encodeURIComponent('Hợp đồng.docx')}`);
assert.equal(await files.attachmentDelivery({ ...row1, status: 'deleted' }, false), null);
const view = files.attachmentView({ ...row1, conversation_id: 'c0000001' }, 'buyer');
assert.equal(view.url, `/api/chat/c0000001/attachments/${row1.id}?side=buyer`);
assert.equal(files.attachmentView(row1, 'staff').url, `/api/crm/chat-attachments/${row1.id}`);
assert.equal(files.attachmentView({ ...row1, status: 'deleted' }, 'buyer').url, null);

/* ---------- 3. Gửi tin chỉ có tệp ---------- */
const messages = [];
const chatStore = { ...store, listChatMessages: async () => messages, addChatMessage: async (input) => { const m = { ...input, id: `m${++seq}`, created_at: new Date().toISOString() }; messages.push(m); return m; },
  updateChatConversation: async (id, patch) => { chatStore.lastPatch = patch; } };
const service = load('lib/chat/service.ts', {
  'server-only': {}, '@/lib/public/product-catalog': { getPublicProductRecordsByIds: async () => [] },
  '@/lib/public/supplier-name': { supplierShortName: (s) => s.name }, '@/lib/supplier-portal/onboarding': { portalApproved: () => true },
  './core': chatCore, './presence': { presenceKey: {}, readPresence: async () => ({}) }, './attachments': files, './attachments-core': core,
});
await assert.rejects(service.postMessage({ store: chatStore, conversation: conv, sender: 'supplier', senderEmail: 'a@b.c', body: '  ', uploaderKey: 'supplier:s1', attachmentIds: [] }), { code: 'empty' });
const fileOnly = await service.postMessage({ store: chatStore, conversation: conv, sender: 'supplier', senderEmail: 'a@b.c', body: '', uploaderKey: 'supplier:s1', attachmentIds: [row1.id] });
assert.equal(fileOnly.body, '');
assert.equal(row1.message_id, fileOnly.id);
assert.equal(chatStore.lastPatch.last_message_preview, '📎 Catalogue 2026.pdf', 'Danh sách và email báo tin hiện tên tệp');
assert.ok(row1.expires_at > new Date(Date.now() + 179 * 86400_000).toISOString(), 'Hết hạn sau 6 tháng tính từ lúc gửi');
await assert.rejects(service.postMessage({ store: chatStore, conversation: conv, sender: 'supplier', senderEmail: 'a@b.c', body: 'again', uploaderKey: 'supplier:s1', attachmentIds: [row1.id] }), { code: 'missing' }, 'Một lần đính kèm chỉ đi với một tin');
const [mv] = await service.messageViews([fileOnly], 'buyer', chatStore);
assert.equal(mv.attachments[0].name, 'Catalogue 2026.pdf');
assert.equal(mv.attachments[0].kind, 'pdf');

/* ---------- 4. Dọn tệp ---------- */
const dupRow = rows.find((r) => r.id === again.attachment.id); // chưa gửi, cùng tệp với row1
const later = new Date(Date.now() + 2 * 86400_000);
deleted.length = 0;
let cleaned = await files.cleanChatAttachments(store, later);
assert.ok(cleaned.unsent >= 1 && !rows.includes(dupRow), 'Tệp không gửi quá 24 giờ bị xoá');
assert.ok(!deleted.includes(row1.storage_key), 'Tệp còn tin đang dùng thì giữ trên kho');
cleaned = await files.cleanChatAttachments(store, new Date(Date.now() + 200 * 86400_000));
assert.ok(cleaned.expired >= 1 && row1.status === 'deleted' && row1.deleted_at, 'Quá 6 tháng: đánh dấu đã xoá, giữ dòng');
assert.ok(deleted.includes(row1.storage_key), 'Quá 6 tháng: xoá khỏi kho');
assert.equal(files.attachmentView(row1, 'buyer').expired, true);

/* ---------- 5. Đường đi, quyền, migration, giao diện ---------- */
const begin = read('app/api/chat/[id]/attachments/route.ts');
assert.match(begin, /sameOrigin\(request\)[\s\S]*chatViewer\([\s\S]*ownedConversation\(/);
const item = read('app/api/chat/[id]/attachments/[attachmentId]/route.ts');
for (const m of ['GET', 'PUT', 'POST', 'DELETE']) assert.match(item, new RegExp(`export async function ${m}\\(`));
assert.equal((item.match(/if \(!sameOrigin\(request\)\)/g) ?? []).length, 3, 'Ghi luôn kiểm cùng nguồn');
assert.match(item, /row\.message_id \|\| row\.uploader_key === uploaderKey\(ctx\.viewer\)/, 'Tệp chưa gửi chỉ người tải mở được');
assert.match(item, /CHAT_SERVER_UPLOAD_MAX_BYTES/);
assert.match(read('app/api/crm/chat-attachments/[attachmentId]/route.ts'), /hasPermission\(session\.role, "rfq\.view"\)[\s\S]*!row\.message_id/);
assert.match(read('app/api/chat/[id]/route.ts'), /attachmentIds: payload\.attachmentIds, uploaderKey: uploaderKey\(viewer\)/);
assert.match(read('app/api/cron/chat-notify/route.ts'), /cleanChatAttachments\(store\)/);
const sql = read('supabase/migrations/20261124_chat_attachments.sql');
assert.match(sql, /create table if not exists public\.chat_attachments/);
assert.match(sql, /enable row level security[\s\S]*revoke all on table public\.chat_attachments from public, anon, authenticated/);
assert.match(sql, /size_bytes <= 10485760/);
assert.match(sql, /chat_messages_body_check check \(length\(body\) <= 4000\)/);
assert.match(read('lib/media/storage.ts'), /aplus\|chat\)\\\//, 'Tệp chat chỉ ở bucket riêng tư');
const ui = read('components/chat/chat-attachments.tsx');
assert.match(ui, /compressImage\(file\)/, 'Ảnh nén trên trình duyệt');
assert.match(ui, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(ui, /xhr\.upload\.onprogress/);
const workspace = read('components/chat/chat-workspace.tsx');
assert.match(workspace, /const canAttach = Boolean\(activeId && activeId !== NEW_ID\)/);
assert.match(workspace, /uploads\.busy\) \{ setError\(fileLabels\.waitUploads\)/);
assert.doesNotMatch(read('lib/rfq/portal-copy.ts'), /Attachments are not supported yet/);
const labelsFile = read('lib/chat/attachment-labels.ts');
for (const text of Object.values(labelsFile.match(/vi: \{[\s\S]*?\n  \},\n\};/)[0].match(/"[^"]+"/g))) assert.ok(text.length <= 122, `Câu tiếng Việt quá dài: ${text}`);

console.log('✅ Chat attachments: allowed types and real-content check, 10 MB / 5 files, plan quotas, duplicate files reused, only the two parties and staff can open, Word/Excel download, unsent files cleaned after 24 h, sent files removed after 6 months.');
