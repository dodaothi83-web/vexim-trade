// node scripts/check-supplier-notice-links.mjs
// Mỗi thông báo trong chuông phải mở đúng trang xử lý việc đó, và chuông phải tự nhảy số.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboard = read('lib/supplier-portal/dashboard.ts');
const topbar = read('components/supplier-topbar.tsx');
const api = read('app/api/supplier-portal/notifications/route.ts');
const documents = read('app/supplier/portal/documents/page.tsx');

// 1. Kiểu dữ liệu: mọi thông báo đều có đích, không phải tuỳ chọn.
assert.match(dashboard, /interface PortalNotice \{[\s\S]*?\n  href: string;/, 'PortalNotice bắt buộc có href');
assert.doesNotMatch(dashboard, /href\?: string/, 'href không được tuỳ chọn: dòng nào cũng phải có đích');

// 2. Mọi chỗ tạo thông báo đều truyền đích.
const calls = [];
for (let i = dashboard.indexOf('add('); i !== -1; i = dashboard.indexOf('add(', i + 1)) {
  // bỏ qua khai báo hàm `const add = (`
  const before = dashboard.slice(Math.max(0, i - 20), i);
  if (before.includes('const ')) continue;
  let depth = 0, end = i + 3;
  for (; end < dashboard.length; end += 1) {
    if (dashboard[end] === '(') depth += 1;
    else if (dashboard[end] === ')') { depth -= 1; if (depth === 0) break; }
  }
  calls.push(dashboard.slice(i, end + 1));
}
assert.ok(calls.length >= 15, `Đếm được ${calls.length} chỗ tạo thông báo`);
for (const call of calls) {
  const head = call.slice(0, 60).replace(/\s+/g, ' ');
  assert.ok(/\/supplier\/portal|levelHref\(|CERT_HREF/.test(call), `Thông báo không có đích: ${head}`);
}

// 3. Đích phải là trang có thật trong cổng NCC (hoặc neo có thật trên trang).
const targets = [...dashboard.matchAll(/["'`](\/supplier\/portal[^"'`]*)["'`]/g)].map((m) => m[1]);
assert.ok(targets.length >= 6, `Đếm được ${targets.length} đích`);
for (const target of new Set(targets)) {
  const [path, hash] = target.split('#');
  const route = path.replace(/\$\{[^}]+\}/g, '[id]');
  const page = `app${route}/page.tsx`;
  assert.ok(existsSync(new URL(`../${page}`, import.meta.url)), `Không có trang cho đích ${target} (${page})`);
  if (hash) assert.match(documents, new RegExp(`id="${hash}"`), `Trang ${path} thiếu neo #${hash}`);
}

// 4. Đích theo cấp xác minh: L1 giấy tờ, L2 nhà máy, L3 xuất khẩu. L2 và L3 vẫn tách riêng.
assert.match(dashboard, /level === 1 \? "\/supplier\/portal\/documents"/, 'L1 trỏ về trang giấy tờ');
assert.match(dashboard, /level === 2 \? "\/supplier\/portal\/verification\/factory"/, 'L2 trỏ về trang xác thực nhà máy');
assert.match(dashboard, /"\/supplier\/portal\/verification\/export"/, 'L3 trỏ về trang lịch sử xuất khẩu');
assert.match(dashboard, /CERT_HREF = "\/supplier\/portal\/documents#chung-nhan"/, 'Chứng nhận trỏ đúng mục trên trang giấy tờ');
assert.match(documents, /id="chung-nhan"/, 'Trang giấy tờ có mục chứng nhận để neo tới');
assert.match(documents, /scroll-mt-24|scrollMarginTop/, 'Mục chứng nhận chừa chỗ cho thanh trên khi nhảy tới');

// 5. API trả kèm đích để chuông dùng.
assert.match(api, /href: notice\.href|href: n\.href|href:/, 'API thông báo trả kèm href');
assert.match(api, /buildSupplierNoticeFeed/, 'API dùng đúng lớp dữ liệu của cổng');

// 6. Chuông tự nhảy: tự làm mới theo nhịp và khi quay lại tab.
assert.match(topbar, /const POLL_MS = 20_000/, 'Chuông có nhịp tự làm mới');
assert.match(topbar, /window\.setInterval\(/, 'Chuông tự lấy lại danh sách, không cần tải lại trang');
assert.match(topbar, /document\.visibilityState === "visible"/, 'Không gọi máy chủ khi tab đang ẩn');
assert.match(topbar, /visibilitychange/, 'Quay lại tab thì làm mới ngay');
assert.match(topbar, /window\.addEventListener\("focus"/, 'Quay lại cửa sổ thì làm mới ngay');

// 7. Tiêu đề là liên kết trực tiếp; không còn nút mở trùng lặp.
assert.match(topbar, /<Link href=\{n\.href/, 'Tiêu đề thông báo mở đúng trang của việc đó');
assert.doesNotMatch(topbar, /Mở việc này|router\.push\(notice\.href/, 'Không còn nút mở trùng với tiêu đề');
assert.match(topbar, /markAllSupplierNoticesReadAction/, 'Có thao tác đánh dấu đã đọc tất cả');
assert.match(topbar, /Đã đọc hết/);
assert.match(topbar, /Chọn tiêu đề để mở trang cần xử lý\./, 'Hướng dẫn ngắn gọn, đúng thao tác');
assert.doesNotMatch(topbar, /Hộp thư Vexim/, 'Không dùng tên công ty trong hướng dẫn thông báo');
assert.match(topbar, /panelRef\.current\.contains/, 'Bấm ra ngoài panel thì panel đóng');
assert.match(topbar, /pointerdown/, 'Đóng panel bằng sự kiện bấm thật, không chỉ lớp phủ');
assert.match(topbar, /event\.key === "Escape"/, 'Esc đóng panel');
assert.match(topbar, /\[pathname\]/, 'Chuyển trang thì panel đóng theo');
assert.match(topbar, /markSupplierNoticeReadAction/, 'Đánh dấu đã đọc ngay trong chuông');

console.log('✅ Supplier notice links: every notice has a real destination, the bell polls itself, rows navigate, outside click closes.');
