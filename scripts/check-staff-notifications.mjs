// node scripts/check-staff-notifications.mjs — nhân viên Vexim phải biết có việc mới, ở cả email lẫn dashboard.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const notify = read('lib/supplier-portal/notify.ts');

// 1. Có thư báo khi tài khoản NCC được tạo, không đợi tới lúc nộp hồ sơ.
assert.match(notify, /export async function notifyStaffSupplierAccount\(/, 'Thư báo tài khoản NCC mới');
const signup = read('app/api/supplier-signup/route.ts');
assert.match(signup, /notifyStaffSupplierAccount\(\{ email, name, provider: "email" \}\)/, 'Đăng ký bằng email có báo nhân viên');
assert.match(signup, /notification,/, 'Phản hồi đăng ký trả lại trạng thái gửi thư');
const google = read('app/api/auth/google/callback/route.ts');
assert.match(google, /notifyStaffSupplierAccount\(\{ email: user\.email, name: user\.name, provider: "google" \}\)/, 'Đăng ký bằng Google cũng báo nhân viên');

// 2. Hồ sơ NCC tự gửi (L2/L3) vào hàng chờ cũng phải báo, trước đây im lặng.
assert.match(notify, /export async function notifyStaffSupplierSubmission\(/, 'Thư báo hồ sơ tự gửi');
const service = read('lib/verification-submission-service.ts');
assert.match(service, /notifyStaffSupplierSubmission\(submission\.supplier_id/, 'Nộp hồ sơ tự gửi thì gọi thư báo');

// 3. Dashboard liệt kê tài khoản NCC chưa nộp hồ sơ, không chỉ hồ sơ đã nộp.
const dashboard = read('app/crm/dashboard/page.tsx');
assert.match(dashboard, /accountsWithoutProfile/, 'Dashboard có danh sách tài khoản chưa nộp hồ sơ');
assert.match(dashboard, /Tài khoản NCC mới · chưa nộp hồ sơ doanh nghiệp/, 'Hàng đợi có dòng cho tài khoản mới');
assert.match(dashboard, /Tài khoản NCC chưa nộp hồ sơ/, 'Bảng cổng kiểm soát có số tài khoản chưa nộp');

// 4. Menu trái hiện số việc đang chờ, và nói rõ khi email chưa cấu hình.
const sidebar = read('components/sidebar.tsx');
for (const fragment of ['pendingSuppliers', 'pendingProducts', 'pendingReviews'])
  assert.match(sidebar, new RegExp(fragment), `Badge dùng ${fragment}`);
assert.match(sidebar, /Chưa có RESEND_API_KEY/, 'Menu nói rõ khi email chỉ ghi log');
const layout = read('app/crm/layout.tsx');
for (const fragment of ['countSupplierAccountsPending', 'countProductsPendingReview', 'countReviewsAwaitingApproval'])
  assert.match(layout, new RegExp(fragment), `Layout đọc ${fragment}`);

// 5. Hai kho dữ liệu đều cài đủ ba phép đếm.
const types = read('lib/db/types.ts');
for (const fragment of ['countSupplierAccountsPending', 'countProductsPendingReview', 'countReviewsAwaitingApproval'])
  assert.match(types, new RegExp(`${fragment}\\(\\): Promise<number>`), `DataStore khai báo ${fragment}`);
for (const store of ['lib/db/supabase.ts', 'lib/db/local.ts'])
  for (const fragment of ['countSupplierAccountsPending', 'countProductsPendingReview', 'countReviewsAwaitingApproval'])
    assert.match(read(store), new RegExp(`async ${fragment}\\(`), `${store} cài ${fragment}`);

console.log('✅ Staff notifications: new supplier login, self-submission, dashboard queue, menu badges and email-mode warning.');
