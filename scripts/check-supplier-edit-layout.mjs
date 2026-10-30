// node scripts/check-supplier-edit-layout.mjs — trang sửa NCC trong CRM dùng cùng bố cục
// với trang tạo NCC và trang sửa sản phẩm: thanh thao tác cố định, cột chính theo nhóm việc,
// cột phải cố định chứa trạng thái, quyền hiển thị giá và mức độ hoàn thiện.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const form = fs.readFileSync(new URL('../components/supplier-form.tsx', import.meta.url), 'utf8');
const editStart = form.lastIndexOf('const completeness = [');
assert.ok(editStart > 0, 'form sửa phải có danh sách kiểm tra mức độ hoàn thiện');
const edit = form.slice(editStart);

// Bố cục hai cột và thanh thao tác cố định như các trang CRM đã làm mới.
assert.match(edit, /xl:grid-cols-\[minmax\(0,1fr\)_330px\]/, 'form sửa phải dùng lưới hai cột như trang sửa sản phẩm');
assert.match(edit, /xl:sticky xl:top-20/, 'cột phải của form sửa phải cố định khi cuộn');
assert.match(edit, /sticky top-2 z-20/, 'form sửa phải có thanh thao tác cố định phía trên');
assert.match(edit, /Lưu thay đổi/, 'thanh thao tác phải có nút lưu');
assert.match(edit, /Hoàn tác/, 'phải hoàn tác được thay đổi chưa lưu');

// Các nhóm thông tin theo việc người dùng, có tiêu đề mục thống nhất.
for (const title of ['Doanh nghiệp', 'Liên hệ', 'Hiển thị cho người mua', 'Điều kiện thương mại', 'Pháp lý và ghi chú nội bộ']) {
  assert.ok(edit.includes(`title="${title}"`), `thiếu nhóm thông tin: ${title}`);
}
assert.ok(!edit.includes('<details'), 'form sửa không giấu trường quan trọng trong khối đóng mở nữa');

// Cột phải chỉ xem trạng thái và dẫn về trung tâm xét duyệt, không lặp các nút quyết định.
assert.match(edit, /Trạng thái hồ sơ/, 'cột phải phải có thẻ trạng thái');
assert.match(edit, /Mở trung tâm xét duyệt/, 'form sửa phải dẫn về nơi xét duyệt tập trung');
assert.match(edit, /\?tab=review#supplier-review/, 'đường dẫn phải mở đúng tab xét duyệt');
assert.ok(!edit.includes('nextOptions') && !edit.includes('transitionTo') && !edit.includes('Công khai hồ sơ'),
  'không giữ các nút chuyển trạng thái trùng lặp trong form sửa');
assert.match(edit, /id="price-sharing"/, 'thẻ quyền hiển thị giá phải giữ neo #price-sharing cho trang sản phẩm liên kết tới');
assert.ok(edit.includes('Quyền hiển thị giá của sản phẩm'), 'phải giữ nguyên khối chấp thuận hiển thị giá');
assert.match(edit, /Mức độ hoàn thiện/, 'cột phải phải có checklist mức độ hoàn thiện');
assert.match(edit, /CheckCircle2/, 'checklist hoàn thiện dùng biểu tượng đạt và chưa đạt như trang sửa sản phẩm');

// Mọi trường của form cũ vẫn còn nguyên ràng buộc dữ liệu.
for (const field of ['name', 'trade_name', 'supplier_type', 'province', 'country', 'address', 'founded_year', 'employees',
  'products', 'contact_name', 'contact_title', 'phone', 'zalo', 'email', 'website', 'display_name', 'slug',
  'intro_source', 'summary_en', 'moq_text', 'capacity_per_month', 'lead_time_days', 'payment_terms', 'markets',
  'private_label', 'ports', 'incoterms', 'export_markets', 'tax_id', 'role', 'notes']) {
  assert.ok(edit.includes(`"${field}"`), `form sửa bị mất trường ${field}`);
}

// Trang chứa form: ảnh và kho tài liệu là thẻ mở sẵn, không còn details.
const page = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/edit/page.tsx', import.meta.url), 'utf8');
assert.ok(!page.includes('<details'), 'trang sửa không còn khối đóng mở cho ảnh và tài liệu');
assert.match(page, /Ảnh đại diện và ảnh bìa/, 'trang sửa phải có thẻ ảnh đại diện và ảnh bìa');
assert.match(page, /Kho ảnh và tài liệu chung/, 'trang sửa phải có thẻ kho ảnh và tài liệu');
assert.match(page, /SupplierImagePicker/, 'vẫn dùng bộ chọn ảnh NCC hiện có');
assert.match(page, /MediaManager/, 'vẫn dùng kho tài liệu hiện có');

console.log('✅ Supplier edit layout: sticky action bar, grouped sections, sticky rail with status/price/completeness, open media cards.');
