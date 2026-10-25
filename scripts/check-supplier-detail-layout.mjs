// node scripts/check-supplier-detail-layout.mjs — trang chi tiết NCC trong CRM dùng bố cục
// giống trang công khai và các trang CRM đã làm mới: đầu trang có ảnh bìa, ảnh đại diện,
// huy hiệu xác minh và chỉ số nhanh; hai tab tách Tổng quan khỏi Xét duyệt NCC; tab tổng quan
// ưu tiên RFQ/đơn hàng/sản phẩm và giữ tài khoản cổng, hồ sơ doanh nghiệp ở cột phải.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/page.tsx', import.meta.url), 'utf8');
const reviewPanel = fs.readFileSync(new URL('../app/crm/suppliers/[slug]/verification-panel.tsx', import.meta.url), 'utf8');
const workflowControls = fs.readFileSync(new URL('../components/supplier-actions.tsx', import.meta.url), 'utf8');

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

// Hai tab tách nội dung vận hành khỏi luồng xét duyệt.
assert.match(page, /sp\.tab === "review"/, 'tab phải đọc trạng thái từ URL để giữ đúng tab sau khi refresh');
assert.match(page, /key: "overview", label: "Tổng quan"/);
assert.match(page, /key: "review", label: "Xét duyệt NCC"/);
assert.match(page, /\?tab=review/, 'phải có đường dẫn mở trực tiếp tab xét duyệt');
const reviewBranchStart = page.indexOf('{activeTab === "review" ? (');
const overviewBranchStart = page.indexOf(') : (', reviewBranchStart);
assert.ok(reviewBranchStart >= 0 && overviewBranchStart > reviewBranchStart, 'hai tab phải render hai nhánh nội dung riêng');
const reviewBranch = page.slice(reviewBranchStart, overviewBranchStart);
const overviewBranch = page.slice(overviewBranchStart);
assert.ok(reviewBranch.includes('<VerificationPanel') && !reviewBranch.includes('title="RFQ đã gửi cho NCC này"'),
  'tab xét duyệt chỉ chứa khu vực xét duyệt');
assert.ok(!overviewBranch.includes('<VerificationPanel'), 'tab tổng quan không lặp trung tâm xét duyệt');

// Một trung tâm xét duyệt gom mở cổng, xác minh và trạng thái/công khai.
assert.match(page, /VerificationPanel/, 'phải giữ panel xét duyệt');
assert.match(reviewPanel, /Trung tâm xét duyệt NCC/);
assert.match(reviewPanel, /Hồ sơ & quyền cổng/);
assert.match(reviewPanel, /OnboardingControls/, 'vẫn xác nhận mở cổng được khi hồ sơ chờ duyệt');
assert.match(reviewPanel, /Xác minh L1–L3/);
assert.match(reviewPanel, /Trạng thái & công khai/);
assert.match(reviewPanel, /SupplierWorkflowControls/);
assert.match(workflowControls, /decideSupplierPreparationAction/, 'preparer chuyển bước ngay trên trang chi tiết');
assert.match(workflowControls, /decideSupplierPublicationAction/, 'publication vẫn dùng quyết định và quyền riêng');
assert.equal((page.match(/<VerificationPanel/g) || []).length, 1, 'chỉ có một trung tâm xét duyệt');
assert.ok(!page.includes('<OnboardingControls') && !page.includes('<SupplierWorkflowControls') && !page.includes('<SupplierPublicationControls'),
  'không giữ các nút xét duyệt trùng lặp ở đầu trang hoặc cột phải');

// Cột chính giữ nguyên các khối nghiệp vụ.
assert.match(page, /Sản phẩm \(\$\{products\.length\}\)/, 'phải giữ danh sách sản phẩm');
assert.match(page, /Đơn hàng đang giao cho NCC này/, 'phải giữ danh sách đơn hàng gắn NCC');
assert.match(page, /Kho ảnh & tài liệu chung của NCC/, 'phải giữ kho ảnh và tài liệu chung');
assert.match(page, /MediaGallery/, 'vẫn dùng thư viện tệp hiện có');

// Trong tab Tổng quan, cột chính vẫn ưu tiên RFQ, đơn hàng rồi sản phẩm.
const rfqPosition = overviewBranch.indexOf('title="RFQ đã gửi cho NCC này"');
const orderPosition = overviewBranch.indexOf('title="Đơn hàng đang giao cho NCC này"');
const productPosition = overviewBranch.indexOf('id="supplier-products"');
assert.ok(rfqPosition >= 0 && rfqPosition < orderPosition && orderPosition < productPosition,
  'tab tổng quan phải sắp xếp RFQ trước đơn hàng và sản phẩm');

// Cột phải chỉ giữ tài khoản đăng nhập và hồ sơ doanh nghiệp, không lặp quyết định mở cổng.
assert.match(page, /Tài khoản cổng nhà cung cấp/, 'cột phải phải có thẻ tài khoản cổng');
assert.match(page, /SupplierAccountControls/, 'vẫn cấp và gắn tài khoản được từ trang chi tiết');
assert.ok(!page.includes('Quyền sử dụng cổng'), 'quyết định mở cổng chỉ nằm ở trung tâm xét duyệt');
assert.match(page, /Hồ sơ doanh nghiệp/, 'cột phải phải có hồ sơ doanh nghiệp');
assert.ok(!page.includes('SupplierCategoryControls'), 'không đưa panel chốt ngành trùng lặp quay lại');

// Danh sách sản phẩm chỉ giữ thông tin cơ bản; chi tiết nằm ở trang Xem/Sửa.
const productStart = page.indexOf('id="supplier-products"');
const productEnd = page.indexOf('<MediaGallery', productStart);
assert.ok(productStart >= 0 && productEnd > productStart, 'phải xác định được khu vực sản phẩm của NCC');
const productSection = page.slice(productStart, productEnd);
assert.match(page, /orderCrmProducts\(products\)/, 'sản phẩm chờ duyệt phải được ưu tiên lên đầu');
assert.match(page, /paginateCrmProducts\(orderedProducts, requestedPage\)/, 'danh sách phải được phân trang');
assert.match(productSection, /visibleProducts\.map/, 'chỉ sản phẩm của trang hiện tại được hiển thị');
assert.match(productSection, /productPageHref\(productPage - 1\)/);
assert.match(productSection, /productPageHref\(productPage \+ 1\)/);
assert.match(productSection, /#supplier-products|supplier-products/, 'chuyển trang giữ vị trí tại khu vực sản phẩm');
assert.match(productSection, /MediaThumb/);
assert.match(productSection, /pr\.category/);
assert.match(productSection, /title=\{pr\.name\}/, 'tên dài vẫn có tooltip và link mở hồ sơ đầy đủ');
for (const label of ['Chờ Vexim kiểm tra', 'Cần NCC sửa', 'Sẵn sàng gửi buyer']) {
  assert.ok(productSection.includes(label), `thiếu trạng thái cơ bản: ${label}`);
}
for (const detail of ['pr.spec', 'pr.moq', 'pr.monthly_capacity', 'pr.lead_time_days', 'pr.ref_price', 'price_valid_until', 'shareableCount', 'Thông tin thương mại', 'Giá & trạng thái']) {
  assert.ok(!productSection.includes(detail), `chi tiết phải nằm ở trang sản phẩm, không nằm trong danh sách rút gọn: ${detail}`);
}

console.log('✅ Supplier detail layout: overview and review tabs, RFQ → orders → products, sticky portal and profile rail.');
