// node --experimental-strip-types --no-warnings scripts/check-message-timeline.mjs
// Timeline thư của một hồ sơ: phân loại Tự động / Nhân viên / Trả lời và bên liên quan.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timelineKind, toTimelineItem } from '../lib/mail/timeline.ts';

const msg = (over) => ({ id: 'x', kind: 'manual', created_by: 'staff@vexim.vn', direction: 'buyer', rfq_match_id: null, subject: 'S', body_text: 'B',
  status: 'sent', read_at: null, sent_at: '2026-11-05T01:00:00Z', created_at: '2026-11-05T00:59:00Z', ...over });
assert.equal(timelineKind(msg({ kind: 'inbound' })), 'reply');
assert.equal(timelineKind(msg({ kind: 'auto' })), 'auto');
assert.equal(timelineKind(msg({ kind: 'supplier_reminder', created_by: 'cron' })), 'auto');
assert.equal(timelineKind(msg({ kind: 'rfq_outreach', created_by: null })), 'auto', 'Thư hệ thống tự gửi (không có người gửi) là tự động');
assert.equal(timelineKind(msg({ kind: 'rfq_outreach' })), 'staff');

const supplierReply = toTimelineItem(msg({ kind: 'inbound', direction: 'supplier', rfq_match_id: 'm1' }), { name: 'Mekong Agri', href: '/crm/suppliers/s1' });
assert.equal(supplierReply.party, 'supplier');
assert.equal(supplierReply.partyName, 'Mekong Agri');
assert.equal(supplierReply.unread, true, 'Thư nhận chưa đọc được làm nổi bật');
const buyerAck = toTimelineItem(msg({ kind: 'auto', status: 'failed' }));
assert.equal(buyerAck.party, 'buyer');
assert.equal(buyerAck.unread, false, 'Thư gửi đi không bao giờ là chưa đọc');
assert.equal(buyerAck.failed, true, 'Thư gửi lỗi được báo trên timeline');
assert.equal(toTimelineItem(msg({ kind: 'inbound', read_at: '2026-11-05T02:00:00Z' })).unread, false);

const page = readFileSync(new URL('../app/crm/rfqs/[id]/page.tsx', import.meta.url), 'utf8');
assert.match(page, /<MessageTimeline title="Lưu vết thông báo \/ báo giá qua cổng và email cũ \(chỉ đọc\)"/);
const ui = readFileSync(new URL('../components/message-timeline.tsx', import.meta.url), 'utf8');
for (const label of ['Tất cả', 'Người mua', 'Nhà cung cấp', 'Tự động', 'Nhân viên', 'Trả lời', 'Mới']) assert.ok(ui.includes(label), `Nhãn ${label}`);
assert.match(ui, /item\.kind === "auto"/, 'Thư tự động thu gọn một dòng');
console.log('✅ Message timeline: auto/staff/reply kinds, buyer/supplier party, unread and failed flags, filter labels.');
