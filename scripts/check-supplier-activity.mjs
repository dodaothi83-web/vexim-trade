// node --experimental-strip-types --no-warnings scripts/check-supplier-activity.mjs
// Nhãn truy cập lần cuối của nhà cung cấp (28/11/2026): chỉ theo mốc, quá 30 ngày thì ẩn,
// hồ sơ thử/chưa công khai không lộ, không trả giờ chính xác, không gắn với xác minh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { supplierActivity, SUPPLIER_ACTIVITY_LABELS } from '../lib/public/supplier-activity.ts';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-28T10:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000, DAY = 24 * 60 * MIN;

assert.equal(supplierActivity(ago(30_000), NOW), 'online');
assert.equal(supplierActivity(ago(5 * MIN), NOW), 'day');
assert.equal(supplierActivity(ago(23 * 60 * MIN), NOW), 'day');
assert.equal(supplierActivity(ago(3 * DAY), NOW), 'week');
assert.equal(supplierActivity(ago(20 * DAY), NOW), 'month');
assert.equal(supplierActivity(ago(31 * DAY), NOW), null, 'Quá 30 ngày thì ẩn');
assert.equal(supplierActivity(null, NOW), null, 'Chưa từng vào thì ẩn');
assert.equal(supplierActivity('not a date', NOW), null);
assert.deepEqual(Object.values(SUPPLIER_ACTIVITY_LABELS).join('|'), 'Online now|Active today|Active this week|Active this month');
for (const label of Object.values(SUPPLIER_ACTIVITY_LABELS)) assert.doesNotMatch(label, /verif|ago/i, 'Không ghi giờ cụ thể, không gợi ý xác minh');

assert.match(read('../lib/chat/presence.ts'), /PRESENCE_ONLINE_MS = 2 \* 60_000/, 'Cùng ngưỡng online với chat');

const route = read('../app/api/public/supplier-activity/route.ts');
assert.match(route, /listCachedPublicSuppliers\(\)\)\.find\(\(s\) => s\.id === id\)/, 'Chỉ nhà cung cấp đang công khai');
assert.match(route, /isSyntheticSupplier\(supplier\)/, 'Hồ sơ thử không có nhãn');
assert.match(route, /presenceKey\.supplier\(/, 'Chỉ đọc mốc của nhà cung cấp, không bao giờ của người mua');
assert.match(route, /\{ activity: supplierActivity\(seen\) \}/, 'Chỉ trả mốc, không trả giờ chính xác');
assert.doesNotMatch(route, /last_seen|seen_at|lastSeen:/, 'Không lộ thời điểm chính xác');
assert.match(route, /s-maxage=60/);

const badge = read('../components/public/supplier-activity.tsx');
assert.match(badge, /if \(!activity\) return null/, 'Không có dữ liệu thì không để chỗ trống');
assert.match(read('../components/public/supplier-storefront.tsx'), /\{!synthetic && <SupplierActivityBadge supplierId=\{s\.id\} \/>\}/);
assert.match(read('../app/(public)/products/[slug]/[productId]/page.tsx'), /Supplied by<\/h2>\s*\{!card\.isDemo && <SupplierActivityBadge supplierId=\{card\.supplierId\} className=\"shrink-0 whitespace-nowrap/);

console.log('✅ Supplier activity: Online now / today / this week / this month, hidden after 30 days, public non-test suppliers only, no exact timestamps.');
