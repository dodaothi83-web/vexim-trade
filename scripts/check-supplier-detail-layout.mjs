// node scripts/check-supplier-detail-layout.mjs — trang chi tiết NCC trong CRM dùng bố cục
// giống trang công khai và các trang CRM đã làm mới: đầu trang có ảnh bìa, ảnh đại diện,
// huy hiệu xác minh và chỉ số nhanh; cột chính cho kiểm toán/sản phẩm/đơn hàng/kho tệp;
// cột phải cố định cho tài khoản cổng và hồ sơ doanh nghiệp.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');

// Đầu trang nhận diện kiểu sàn TMĐT, giữ ảnh bìa và ảnh đại diện nổi bật.
assert.match(page, /supplier\.cover_image/, 'đầu trang phải hiện ảnh bìa của NCC');
assert.match(page, /supplier\.profile_image/, 'đầu trang phải hiện ảnh đại diện của NCC');
assert.match(page, /VerificationCoverSeal/, 'phải có huy chương xác minh trên ảnh bìa');
// profile_image/cover_image lưu đường dẫn kho tệp (suppliers/<id>/profile-*.jpg),
// bắt buộc chuyển qua /public-media/ như trang công khai, không được dùng thẳng làm src.
assert.match(page, /`\/public-media\/\$\{path\.replace/, 'phải chuyển đường dẫn kho tệp thành URL /public-media/');
assert.match(page, /src=\{coverUrl\}/, 'ảnh bìa phải dùng URL đã chuyển đổi');
assert.match(page, /src=\{avatarUrl\}/, 'ảnh đại diện phải dùng URL đã chuyển đổi');
assert.ok(!page.includes('src={supplier.cover_image}') && !page.includes('src={supplier.profile_image}'),
  'không được dùng đường dẫn kho tệp thô làm địa chỉ ảnh');
assert.match(page, /VerificationTierBadge/, 'phải có huy hiệu mức xác minh cạnh tên');
assert.match(page, /VerificationPips/, 'phải có ba vòng kiểm xác minh cạnh tên');
assert.match(page, /approvedLevels/, 'mức xác minh lấy từ các đợt kiểm đã duyệt thật');

// Chỉ số nhanh nằm ngay trong đầu trang, không còn dải thống kê riêng phía dưới.
for (const label of ['Sản phẩm', 'Đơn đang chạy', 'Lead time', 'Đánh giá']) {
  assert.ok(page.includes(`>${label}<`), `thiếu chỉ số nhanh: ${label}`);
}
assert.ok(!page.includes('function Cell('), 'không còn dải thống kê Cell riêng như bố cục cũ');

// Bố cục hai cột như trang sửa NCC và trang sửa sản phẩm.
assert.match(page, /xl:grid-cols-\[minmax\(0,1fr\)_330px\]/, 'trang chi tiết phải dùng lưới hai cột thống nhất');
assert.match(page, /xl:sticky xl:top-6/, 'cột phải phải cố định khi cuộn');

// Cột chính giữ nguyên các khối nghiệp vụ.
assert.match(page, /VerificationPanel/, 'phải giữ panel kiểm toán');
assert.match(page, /Sản phẩm \(\$\{products\.length\}\)/, 'phải giữ danh sách sản phẩm');
assert.match(page, /Đơn hàng đang giao cho NCC này/, 'phải giữ danh sách đơn hàng gắn NCC');
assert.match(page, /Kho ảnh & tài liệu chung của NCC/, 'phải giữ kho ảnh và tài liệu chung');
assert.match(page, /MediaGallery/, 'vẫn dùng thư viện tệp hiện có');

// Cột phải gồm tài khoản cổng (gộp quyền sử dụng cổng) và hồ sơ doanh nghiệp.
assert.match(page, /Tài khoản cổng nhà cung cấp/, 'cột phải phải có thẻ tài khoản cổng');
assert.match(page, /SupplierAccountControls/, 'vẫn cấp và gắn tài khoản được từ trang chi tiết');
assert.match(page, /Quyền sử dụng cổng/, 'quyền sử dụng cổng nằm trong cùng thẻ tài khoản');
assert.match(page, /OnboardingControls/, 'vẫn xác nhận mở cổng được khi hồ sơ chờ duyệt');
assert.match(page, /Hồ sơ doanh nghiệp/, 'cột phải phải có hồ sơ doanh nghiệp');
assert.ok(!page.includes('SupplierCategoryControls'), 'không đưa panel chốt ngành trùng lặp quay lại');

// Danh sách sản phẩm dùng cột quét nhanh thay vì chồng badge và thao tác trong cột giá.
assert.ok(page.includes('Thông tin thương mại') && page.includes('Giá & trạng thái'), 'phải có header cho các cột sản phẩm');
assert.ok(page.includes('lg:grid-cols-[minmax(0,1.55fr)_minmax(150px,0.85fr)_minmax(180px,0.85fr)]'),
  'desktop phải dùng lưới 3 cột responsive cho sản phẩm');
assert.match(page, /<dl className="grid min-w-0 grid-cols-2/, 'mobile giữ các thông tin thương mại trong lưới gọn');
assert.match(page, /title=\{pr\.name\}/, 'tên dài vẫn có tooltip và link mở hồ sơ đầy đủ');
for (const label of ['MOQ', 'Năng lực/tháng', 'Lead time', 'Giá tham khảo']) {
  assert.ok(page.includes(`>${label}<`), `thiếu nhãn thông tin sản phẩm: ${label}`);
}
assert.ok(!page.includes('MOQ {pr.moq}'), 'MOQ badges are grouped into labeled facts');

console.log('✅ Supplier detail layout: identity header with cover/avatar/verification, quick stats, grouped main column, sticky portal and profile rail.');
