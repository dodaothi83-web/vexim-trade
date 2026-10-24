// Huy hiệu việc chờ ở sidebar + nút Xem sản phẩm: kiểm tra bằng đọc mã nguồn.
// Run: node scripts/check-crm-badges.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* 1. Đếm sản phẩm chờ duyệt phải đọc đúng bảng. Bản cũ gõ "products" (bảng không
   tồn tại) nên production trả lỗi, layout nuốt thành 0 và huy hiệu biến mất. */
const supabase = read('lib/db/supabase.ts');
const start = supabase.indexOf('async countProductsPendingReview');
const productCount = supabase.slice(start, supabase.indexOf('async countReviewsAwaitingApproval', start));
assert.ok(start > 0, 'Thiếu countProductsPendingReview');
assert.match(productCount, /from\("supplier_products"\)/, 'Phải đếm trên bảng supplier_products');
assert.ok(!/from\("products"\)/.test(productCount), 'Không còn truy vấn bảng products');

/* 2. Mỗi menu có việc riêng phải có huy hiệu riêng: hồ sơ NCC tự gửi tách khỏi đợt kiểm. */
const layout = read('app/crm/layout.tsx');
assert.match(layout, /countSubmissionsPendingReview\(\)/);
assert.match(layout, /pendingSubmissions=\{pendingSubmissions\}/);
assert.match(layout, /console\.error\(`\[crm\] đếm việc chờ/, 'Lỗi đếm phải ghi log, không nuốt im lặng');

const sidebar = read('components/sidebar.tsx');
assert.match(sidebar, /pendingSubmissions\?: number;/, 'Sidebar nhận số hồ sơ tự gửi');
assert.match(sidebar, /item\.href === "\/crm\/verifications\/submissions"[\s\S]{0,120}pendingSubmissions/,
  'Huy hiệu hồ sơ tự gửi gắn đúng menu');

const types = read('lib/db/types.ts');
assert.match(types, /countSubmissionsPendingReview\(\): Promise<number>;/);
assert.match(read('lib/db/local.ts'), /async countSubmissionsPendingReview\(\)/);

/* 3. Xử lý xong thì huy hiệu phải tự trừ: làm mới cả layout /crm, không chỉ trang con. */
assert.match(read('lib/crm/badges.ts'), /revalidatePath\("\/crm", "layout"\)/);
for (const [file, reason] of [
  ['app/crm/suppliers/[slug]/verification-actions.ts', 'duyệt hoặc trả đợt kiểm'],
  ['app/crm/products/[slug]/edit/review-actions.ts', 'duyệt sản phẩm NCC'],
  ['app/crm/suppliers/[slug]/onboarding-actions.ts', 'xác nhận quyền cổng NCC'],
  ['app/api/submission-review/[id]/route.ts', 'nhận hoặc trả hồ sơ tự gửi'],
  ['app/actions.ts', 'đánh dấu đọc thư'],
]) {
  assert.match(read(file), /refreshCrmBadges\(\)/, `${reason} xong phải làm mới huy hiệu sidebar`);
}

/* 4. Người kiểm duyệt phải mở được trang xem sản phẩm, không chỉ trang sửa. */
const supplierPage = read('app/crm/suppliers/[slug]/page.tsx');
assert.match(supplierPage, /href=\{`\/crm\/products\/\$\{pr\.id\}`\}/, 'Tên sản phẩm mở trang xem');
assert.match(supplierPage, /\{pr\.name\}[\s\S]{0,40}/, 'Vẫn hiện tên sản phẩm');
assert.ok(!/href=\{`\/crm\/products\/\$\{pr\.id\}\/edit`\}[\s\S]{0,120}\{pr\.name\}/.test(supplierPage),
  'Tên sản phẩm không trỏ thẳng vào trang sửa');
assert.match(supplierPage, /<Eye[^>]*\/> Xem/, 'Có nút Xem');
assert.match(supplierPage, /<Pencil[^>]*\/> Sửa/, 'Giữ nút Sửa cho người có quyền');

/* 5. Thông báo hai chiều: CRM có chuông riêng cho việc NCC gửi lên, và khi NCC
   bổ sung giấy tờ L1 thì nhân viên phải được báo (email), không chỉ nằm im trong hàng chờ. */
const topbar = read('components/crm-topbar.tsx');
assert.match(topbar, /export function CrmTopbar/);
assert.match(layout, /<CrmTopbar queues=\{queues\} \/>/, 'CRM layout phải dựng chuông thông báo');
assert.match(layout, /label: "Hồ sơ NCC tự gửi chờ đối chiếu"/, 'Chuông liệt kê hàng hồ sơ tự gửi');
assert.match(layout, /filter\(\(queue\) => queue\.count > 0\)/, 'Chuông chỉ hiện việc đang có');

const notify = read('lib/supplier-portal/notify.ts');
assert.match(notify, /export async function notifyStaffDocumentUpload/);
assert.match(read('app/api/supplier-portal/evidence/route.ts'), /notifyStaffDocumentUpload\(/,
  'NCC tải giấy tờ xong phải báo nhân viên');
assert.match(notify, /Chưa có gì được duyệt/, 'Thư báo không được ngụ ý đã duyệt');

console.log('✅ CRM: huy hiệu đếm đúng bảng, gắn đúng menu, tự trừ sau khi xử lý; sản phẩm có nút Xem; chuông hai chiều đã nối.');
