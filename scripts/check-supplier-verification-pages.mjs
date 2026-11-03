// node scripts/check-supplier-verification-pages.mjs
// Hai cấp xác minh tự gửi phải là HAI trang riêng, mỗi trang một mục menu, và việc
// tách trang không được làm mất bất kỳ chức năng nào của cổng cũ.
import assert from 'node:assert/strict';
import { loadPortalDictionary } from './lib/portal-dictionary.mjs';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const has = (path) => existsSync(new URL(`../${path}`, import.meta.url));

/* 1. Định tuyến: hai trang riêng + điểm vào cũ không 404. */
assert.ok(has('app/supplier/portal/verification/factory/page.tsx'), 'Có trang L2 riêng');
assert.ok(has('app/supplier/portal/verification/export/page.tsx'), 'Có trang L3 riêng');
assert.ok(has('app/supplier/portal/verification/page.tsx'), 'Đường dẫn cũ vẫn mở được (bảng chọn cấp)');

const factory = read('app/supplier/portal/verification/factory/page.tsx');
const exportPage = read('app/supplier/portal/verification/export/page.tsx');
assert.match(factory, /level=\{2\}/, 'Trang nhà máy dựng hồ sơ L2');
assert.match(exportPage, /level=\{3\}/, 'Trang xuất khẩu dựng hồ sơ L3');
assert.doesNotMatch(factory, /level=\{3\}|getOrCreateSubmission|buildPortalSubmission/,
  'Trang L2 không tải hồ sơ L3');
assert.doesNotMatch(exportPage, /level=\{2\}|getOrCreateSubmission|buildPortalSubmission/,
  'Trang L3 không tải hồ sơ L2');
assert.doesNotMatch(factory + exportPage, /#level-[23]/, 'Hai trang không còn là neo trong một trang gộp');

const chooser = read('app/supplier/portal/verification/page.tsx');
assert.match(chooser, /supplierPortalAccess\(\)/, 'Bảng chọn cấp vẫn kiểm quyền như cổng');
assert.match(chooser, /\/supplier\/portal\/verification\/factory/, 'Bảng chọn dẫn sang trang L2');
assert.match(chooser, /\/supplier\/portal\/verification\/export/, 'Bảng chọn dẫn sang trang L3');
assert.doesNotMatch(chooser, /VerificationSubmissionPanel|SupplierPortalUpload|buildPortalSubmission/,
  'Bảng chọn cấp không nhúng biểu mẫu nộp bằng chứng');

/* 2. Khung chung: mỗi lần mở chỉ tải đúng cấp, đúng danh mục, đúng bộ thông số. */
// Chuỗi hiển thị nằm trong từ điển (giai đoạn 2): nối bản tiếng Việt vào nguồn để các
// assertion câu chữ vẫn kiểm đúng nội dung người dùng đọc, còn nguồn vẫn kiểm được chỗ nối.
const VI = loadPortalDictionary().vi;
const withCopy = (source, subtree) => `${source}\n${JSON.stringify(subtree)}`;
const levelPage = withCopy(read('app/supplier/portal/verification/level-page.tsx'), VI.verification.level);
assert.match(levelPage, /supplierLevelAccess\(level\)/, 'Quyền truy cập lấy theo đúng cấp');
assert.match(levelPage, /getOrCreateSubmission\(store, \{ supplierId: supplier\.id, level, userId: user\.id, supplierType: supplier\.supplier_type, language: locale \}\)/,
  'Chỉ mở/tạo hồ sơ của đúng cấp, câu lỗi theo ngôn ngữ đang chọn');
assert.match(levelPage, /level === 2 \? partner \? partnerSpecs\(locale\) : photoSpecs\(locale\) : exportSpecs\(locale\)/, 'Danh mục đi theo cấp, nhãn từng mục theo ngôn ngữ đang chọn');
assert.match(levelPage, /buildPortalSubmission\(bundle, \{ language: locale \}\)/, 'Hồ sơ dựng theo ngôn ngữ đang chọn');
assert.match(levelPage, /<VerificationSubmissionPanel view=\{view\} specs=\{specs\}/, 'Bảng điều khiển dùng đúng khung cũ');
const portalCopy = loadPortalDictionary();
assert.match(levelPage, /could not open the self-submission file/, 'Lỗi đọc hồ sơ có log (tiếng Anh, cho log máy đọc)');
assert.match(levelPage, /level\.loadErrorTitle/, 'Thiếu bảng có màn hình báo cho NCC');
assert.match(portalCopy.vi.verification.level.loadErrorBody, /không phải lỗi tài khoản của bạn/, 'Câu báo lỗi nói rõ lỗi phía Vexim');
assert.match(portalCopy.en.verification.level.loadErrorBody, /not a problem with your account/i, 'Câu báo lỗi có bản tiếng Anh');
assert.match(levelPage, /level\.unavailable/, 'Hồ sơ rỗng cũng có câu báo');
assert.match(portalCopy.vi.verification.level.unavailable, /Chưa mở được hồ sơ xác minh này/, 'Câu báo hồ sơ rỗng nằm trong từ điển');

// Tab chuyển bước: ba bước dùng chung một dải tab, đánh dấu bước đang mở, mỗi bước
// vẫn là một trang riêng.
assert.match(levelPage, /<LevelTabs current=\{level\} partner=/, 'Trang L2/L3 dùng dải tab chung');
const levelTabs = withCopy(read('app/supplier/portal/verification/level-tabs.tsx'), VI.verification.tabs);
assert.match(levelTabs, /aria-current=\{active \? "page" : undefined\}/, 'Tab đang mở được đánh dấu');
assert.match(levelTabs, /VERIFICATION_STEPS\.map/, 'Tab vẽ đủ các bước');
for (const step of ['/supplier/portal/documents', '/supplier/portal/verification/factory', '/supplier/portal/verification/export'])
  assert.ok(levelTabs.includes(step), `Tab dẫn tới ${step}`);
// Nhãn tab và hướng dẫn nằm trong từ điển (giai đoạn 2, cụm 4); trang chỉ nối chuỗi.
const viTabs = loadPortalDictionary().vi.verification.tabs;
assert.match(levelTabs, /fill\(copy\.step, \{ level: step\.level \}\)/, 'Mỗi tab ghi rõ bước mấy trên ba');
assert.match(levelTabs, /active \? copy\.current : copy\.open/, 'Tab nói rõ bước đang mở');
assert.match(viTabs.step, /Bước \{level\}\/3/, 'Câu đánh số bước nằm trong từ điển');
assert.equal(viTabs.current, 'Đang mở', 'Nhãn bước đang mở nằm trong từ điển');
const viLevelCopy = loadPortalDictionary().vi.verification.level;
for (const text of ['Tạo và in tờ mã', 'Chụp 9 ảnh tại nhà máy', 'Chọn một lô hàng'])
  assert.ok(viLevelCopy.factoryGuideTitles.concat(viLevelCopy.partnerGuideTitles, viLevelCopy.exportGuideTitles).includes(text), `Có hướng dẫn “${text}”`);
assert.ok(loadPortalDictionary().vi.verification.panel.submit.submit === 'Nộp hồ sơ', 'Có nhãn “Nộp hồ sơ”');
assert.ok(viLevelCopy.factoryGuideBodies.join(' ').includes('kể cả ảnh đã gửi qua Zalo, đều nhận'), 'L2 nói rõ ảnh qua Zalo vẫn nhận');
assert.ok(!levelPage.includes('Gửi <strong>ảnh gốc'), 'Không đòi ảnh gốc');
assert.ok(!levelPage.includes('AI quét những gì'), 'Đã bỏ khối giải thích AI khỏi trang L2/L3');

/* 2b. Bước 1 (giấy tờ) dùng đúng ngôn ngữ thị giác của L2/L3 nhưng không có nút nộp. */
const documents = withCopy(read('app/supplier/portal/documents/page.tsx'), VI.documents);
assert.match(documents, /<LevelTabs current=\{1\} partner=/, 'Trang L1 dùng chung dải tab ba bước');
assert.match(documents, /role="progressbar"/, 'L1 có dải tiến độ giấy tờ');
// Bước 1 dùng đúng bố cục hai cột của L2/L3 (nội dung bên trái, cột tóm tắt dính bên
// phải), nhưng cột phải là nơi tải tệp chứ không phải nơi nộp hồ sơ.
assert.match(documents, /lg:grid-cols-\[minmax\(0,1fr\)_330px\]/, 'L1 dùng lưới hai cột như L2/L3');
assert.match(documents, /lg:sticky lg:top-20/, 'Cột phải dính khi lướt, như L2/L3');
const aside = documents.slice(documents.indexOf("<aside"), documents.indexOf("</aside>"));
const mainColumn = documents.slice(documents.indexOf('<div className="min-w-0 space-y-4">'), documents.indexOf("<aside"));
assert.match(mainColumn, /<L1DocUpload checklistKey=\{row\.key\}/, 'Cột trái rộng là nơi tải giấy đăng ký kinh doanh');
assert.match(mainColumn, /<SupplierCertificateUpload certificates=/, 'Cột trái rộng là nơi tải chứng nhận chất lượng');
assert.match(mainColumn, /role="progressbar"/, 'Tiến độ giấy tờ nằm cạnh ô tải');
assert.match(aside, /<VerificationBenefits items=\{copy\.benefits\.items\} title=\{copy\.benefits\.title\} \/>/, 'Cột phải nói nhà cung cấp nhận được gì');
assert.match(aside, /copy\.approved\.title/, 'Cột phải liệt kê loại giấy đã duyệt');
assert.match(loadPortalDictionary().vi.documents.approved.title, /Chứng nhận đã duyệt theo loại/, 'Tiêu đề khối đã duyệt nằm trong từ điển');
assert.match(documents, /EvidenceThumbnail/, 'L1 hiển thị tệp dạng ảnh thu nhỏ');

// Phần giá trị: dùng chung một khối, nằm trong cột hẹp bên cạnh, trên danh sách chứng nhận.
assert.match(documents, /<VerificationBenefits items=\{copy\.benefits\.items\}/, 'L1 dùng cùng khối giá trị với L2/L3');
assert.ok(documents.indexOf('<VerificationBenefits') > documents.indexOf('<aside'), 'Khối giá trị nằm trong cột hẹp bên cạnh');
const l1Benefits = loadPortalDictionary().vi.documents.benefits;
assert.equal(l1Benefits.items.length, 5, 'Năm giá trị nổi bật, không viết dài');
for (const line of l1Benefits.items) {
  assert.ok(line.length <= 90, `Gạch đầu dòng quá dài: ${line}`);
}
assert.match(documents, /copy\.approved\.title/, 'Danh sách chứng nhận gom theo loại giấy');
assert.match(documents, /approvedByKey\.map/, 'Chỉ loại có giấy đã duyệt mới được vẽ');
assert.match(documents, /BadgeCheck/, 'Mỗi loại đã duyệt có dấu xác nhận');
assert.doesNotMatch(documents, /Giấy đã duyệt/, 'Đã bỏ cột Giấy đã duyệt khỏi bảng cũ');
assert.match(documents, /<L1DocUpload checklistKey=\{row\.key\}/, 'L1 tải được giấy tờ ngay trong từng thẻ');
assert.match(documents, /<SupplierCertificateUpload certificates=/, 'L1 vẫn tải được chứng nhận');
assert.match(documents, /Lý do cần bổ sung:/, 'L1 hiện lý do khi bị trả hồ sơ');
assert.doesNotMatch(documents, /runScan|Nộp hồ sơ/, 'Bước 1 không có nút nộp: nhân viên mở đợt kiểm');
assert.doesNotMatch(documents, /AI quét những gì/, 'Không lặp lại khối giải thích AI đã bỏ ở L2/L3');

/* 2c. L2 và L3 nói rõ nhà cung cấp nhận được gì: cùng một khối, năm gạch đầu dòng,
   đặt trong cột hẹp bên cạnh như L1, trên thẻ nộp hồ sơ. Chỉ nói thứ người mua nhìn
   thấy; không hứa đơn hàng và không nói nhân viên sẽ giới thiệu nhà cung cấp. */
assert.ok(has('app/supplier/portal/verification/benefits.tsx'), 'Có khối giá trị dùng chung cho ba bước');
const benefitsBlock = withCopy(read('app/supplier/portal/verification/benefits.tsx'), VI.verification.benefits);
assert.match(benefitsBlock, /Bạn nhận được gì/, 'Khối giá trị có tiêu đề');
assert.match(benefitsBlock, /Check className/, 'Mỗi dòng có dấu xác nhận');
assert.match(benefitsBlock, /space-y-1/, 'Danh sách xếp dọc cho vừa cột hẹp');
assert.match(levelPage, /benefits=\{copy\.benefits\}/, 'L2 và L3 truyền giá trị vào cột hẹp');
assert.doesNotMatch(levelPage, /<VerificationBenefits/, 'Trang không tự vẽ khối, chỉ truyền dữ liệu');
const levelPanel = withCopy(read('app/supplier/portal/verification/verification-panel.tsx'), VI.verification.panel);
const panelAside = levelPanel.slice(levelPanel.indexOf('<aside'), levelPanel.indexOf('</aside>', levelPanel.indexOf('<aside')));
assert.match(panelAside, /<VerificationBenefits items=\{benefits\} title=\{benefitsTitle\} \/>/, 'Cột hẹp của L2/L3 có khối giá trị');
assert.ok(panelAside.indexOf('<VerificationBenefits') < panelAside.indexOf('copy.submit.title'),
  'Khối giá trị đứng trên thẻ nộp hồ sơ');
const benefitGroups = [VI.verification.level.factoryBenefits, VI.verification.level.partnerBenefits, VI.verification.level.exportBenefits];
assert.equal(benefitGroups.length, 3, 'Đủ ba biến thể: L2 nhà máy, L2 đối tác, L3 xuất khẩu');
for (const lines of benefitGroups) {
  assert.equal(lines.length, 5, 'Mỗi cấp đúng năm giá trị');
  for (const line of lines) {
    assert.ok(line.length <= 90, `Gạch đầu dòng quá dài: ${line}`);
    assert.doesNotMatch(line, /tăng đơn|chắc chắn có đơn|top 1|lên top/i, 'Không hứa đơn hàng hay thứ hạng tuyệt đối');
    assert.doesNotMatch(line, /giới thiệu|nhân viên sẽ chọn|nhân viên chọn/i, 'Không nói nhân viên giới thiệu nhà cung cấp');
  }
}

const auditPage = read('app/crm/suppliers/[slug]/audit/[step]/page.tsx');
const auditForm = read('app/crm/suppliers/[slug]/audit/[step]/audit-form.tsx');
assert.match(auditPage, /certificateMedia=\{certificateMedia\}/, 'CRM chuyển đúng tệp gốc chứng nhận vào màn kiểm');
assert.match(auditForm, /Mở tệp gốc/, 'Người kiểm CRM mở được tệp chứng nhận trong luồng chứng nhận riêng');
assert.match(auditForm, /Luồng chứng nhận · xét riêng/, 'Chứng nhận có khu vực riêng, không nằm trong checklist ĐKKD');
assert.doesNotMatch(auditForm, /Bắt buộc 1 trong 3|một trong ba/, 'Bỏ điều kiện cũ một-trong-ba khỏi giao diện CRM');
assert.match(auditForm, /useState\(false\)/, 'Tệp cũ không gắn mục được thu gọn mặc định');

/* 3. Giao diện mới nhưng giữ đủ chức năng của bảng điều khiển cũ. */
const panel = withCopy(read('app/supplier/portal/verification/verification-panel.tsx'), VI.verification.panel);
for (const [label, pattern] of [
  ['tạo mã xác minh', /issueSubmissionCodeAction/],
  ['tải tờ mã', /downloadCodeSheet|Tải tờ mã về/],
  ['in tờ mã', /printCodeSheet|In tờ mã/],
  ['định vị', /navigator\.geolocation|gpsText/],
  ['lưu lô hàng', /saveShipmentAction/],
  ['thêm link nguồn', /addSourceLinkAction/],
  ['xóa link nguồn', /deleteSourceLinkAction/],
  ['AI quét thử', /runScan\(false\)/],
  ['AI quét & nộp', /runScan\(true\)/],
  ['khóa hồ sơ sau khi nộp', /!view\.editable|locked/],
  ['gợi ý AI', /Gợi ý từ AI/],
  ['tiến độ', /role="progressbar"/],
])
  assert.match(panel, pattern, `Bảng điều khiển còn chức năng ${label}`);

const shipmentCard = panel.slice(panel.indexOf('{/* L3 · lô hàng'), panel.indexOf('{/* Bộ bằng chứng'));
assert.match(VI.verification.panel.shipment.privacy,
  /Chứng từ của bạn được bảo mật và không hiển thị công khai\.[\s\S]*Chọn một lô hàng đã xuất và tải chứng từ của lô đó để nhân viên kiểm tra\./,
  'Ghi chú L3 nói rõ bảo mật và việc cần làm');
assert.match(shipmentCard, /copy\.shipment\.privacy/, 'Thẻ lô hàng đọc ghi chú từ từ điển');
assert.match(shipmentCard, /level === 3 &&/, 'Ghi chú bảo mật chỉ thuộc luồng xuất khẩu L3');

// Nộp chỉ mở khi đủ mục và hồ sơ còn sửa được; nút nộp không bị biến thành nút chết.
assert.match(panel, /disabled=\{busy !== "" \|\| evidenceBusy \|\| locked \|\| !view\.ready\}[\s\S]{0,400}runScan\(true\)/,
  'Nút nộp bị khóa khi thiếu mục hoặc hồ sơ đã nộp');
assert.match(panel, /lg:sticky lg:top-20/, 'Cột tóm tắt dính khi lướt danh sách dài');
assert.match(panel, /sticky bottom-0[^"]*lg:hidden/, 'Điện thoại có thanh hành động luôn thấy');
assert.match(panel, /xl:grid-cols-3/, 'Bằng chứng xếp thành lưới thẻ như sàn TMĐT');

/* 4. Thẻ bằng chứng: ảnh thu nhỏ, tải tệp, xóa tệp, chi tiết kỹ thuật, không ép camera. */
const card = withCopy(read('app/supplier/portal/verification/submission-item-card.tsx'), VI.verification.panel.card);
assert.match(card, /\/api\/supplier-portal\/submissions\/\$\{encodeURIComponent\(submissionId\)\}\/upload/,
  'Thẻ tải tệp lên đúng route cũ');
assert.match(card, /deleteSubmissionItemAction/, 'Thẻ vẫn xóa được bằng chứng');
assert.match(card, /accept=\{accept\}/, 'Vẫn giới hạn đúng loại tệp');
assert.match(card, /level === 3 \|\| \(partner && spec\.key === "partner_factory_contract"\) \? "image\/jpeg,image\/png,image\/webp,application\/pdf"/,
  'L2 nhà máy chỉ ảnh, hợp đồng và L3 nhận thêm PDF');
assert.doesNotMatch(card, /capture=\{level === 2/, 'Không ép mở camera');
assert.match(card, /Chi tiết kỹ thuật/, 'L2 vẫn xem được chi tiết kỹ thuật/AI');
assert.match(card, /level === 2 && !partner \? copy\.detailsTech : copy\.detailsFile/, 'L3 không hiện nhãn AI trong chi tiết tệp');
assert.match(VI.verification.panel.card.detailsTech, /Chi tiết kỹ thuật & AI/, 'Nhãn chi tiết L2 nằm trong từ điển');
assert.equal(VI.verification.panel.card.detailsFile, 'Chi tiết tệp', 'Nhãn chi tiết L3 nằm trong từ điển');
assert.match(card, /hardFlags/, 'Cờ bắt buộc vẫn nổi bật trên thẻ');
assert.match(card, /bắt buộc có tờ mã xác minh đặt cạnh cảnh/, 'Ảnh 🔖 nhắc tờ mã ngay trong thẻ');
assert.match(card, /Mở ảnh gốc|Mở PDF/, 'Bấm mở được tệp gốc qua route kiểm quyền');

/* 5. Menu tách hai mục, và các lối vào khác trỏ đúng trang. */
const sidebar = read('components/supplier-sidebar.tsx');
// Nhãn menu nay nằm trong từ điển cổng (giai đoạn 2): menu giữ khoá, từ điển giữ chữ.
assert.match(sidebar, /href: "\/supplier\/portal\/verification\/factory", labelKey: "factory", icon: Factory/,
  'Menu có mục L2');
assert.match(sidebar, /href: "\/supplier\/portal\/verification\/export", labelKey: "exportHistory", icon: Ship/,
  'Menu có mục L3');
{
  const portalCopy = loadPortalDictionary();
  assert.match(portalCopy.vi.shell.nav.factory, /Xác thực nhà máy L2/, 'Nhãn L2 tiếng Việt');
  assert.match(portalCopy.vi.shell.nav.exportHistory, /Lịch sử xuất khẩu L3/, 'Nhãn L3 tiếng Việt');
  assert.doesNotMatch(portalCopy.en.shell.nav.factory + portalCopy.vi.shell.nav.factory, /L2 · L3/,
    'Không còn mục menu gộp');
}

const progress = read('lib/supplier-portal/verification-progress.ts');
assert.match(progress, /href: "\/supplier\/portal\/verification\/factory"/, 'Dải tiến độ dẫn tới trang L2');
assert.match(progress, /href: "\/supplier\/portal\/verification\/export"/, 'Dải tiến độ dẫn tới trang L3');
const profile = read('app/supplier/portal/profile/page.tsx');
assert.match(profile, /href="\/supplier\/portal\/verification\/factory"/, 'Hồ sơ doanh nghiệp dẫn tới trang L2');
assert.match(profile, /href="\/supplier\/portal\/verification\/export"/, 'Hồ sơ doanh nghiệp dẫn tới trang L3');

/* 6. Không rò nút nộp bằng chứng sang trang buyer. */
const storefront = read('app/(public)/suppliers/[slug]/page.tsx');
assert.doesNotMatch(storefront, /VerificationSubmissionPanel|verificationActions/, 'Trang công khai không có nút nộp bằng chứng');
assert.doesNotMatch(read('components/public/supplier-storefront.tsx'), /verification\/factory|verification\/export/,
  'Khung buyer không dẫn vào cổng nội bộ');

console.log('✅ Verification pages: L2 và L3 là hai trang riêng, giao diện dạng sàn TMĐT, giữ nguyên toàn bộ chức năng.');
