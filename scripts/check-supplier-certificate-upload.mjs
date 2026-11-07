// node --experimental-strip-types --no-warnings scripts/check-supplier-certificate-upload.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  legacyCertificateFileCovered,
  visibleLegacyCertificateFiles,
} from '../lib/supplier-portal/legacy-certificate-files.ts';

import { loadPortalDictionary } from './lib/portal-dictionary.mjs';

const portalCopy = loadPortalDictionary();
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../app/supplier/portal/documents/page.tsx');
const upload = read('../app/supplier/portal/certificate-upload.tsx');
const evidenceRoute = read('../app/api/supplier-portal/evidence/route.ts');
const notify = read('../lib/supplier-portal/notify.ts');
const dashboard = read('../lib/supplier-portal/dashboard.ts');

/* 1. Tệp chứng nhận cũ: ẩn khi kho đã có bản ghi cùng loại giấy, giữ khi chưa chắc. */
const covered = [
  ['Chứng nhận HACCP TINIMEX.png', ['HACCP'], 'tên giấy nằm trong tên tệp'],
  ['haccp.pdf', ['Chứng nhận HACCP TINIMEX'], 'tên tệp nằm trong tên giấy'],
  ['Chứng nhận ISO 22000 TINIMEX.pdf', ['ISO 22000'], 'khớp cả cụm ISO 22000'],
];
for (const [caption, names, why] of covered) {
  assert.equal(legacyCertificateFileCovered(caption, names), true, `Phải ẩn tệp cũ: ${why}`);
}
const kept = [
  ['Chứng nhận ISO 22000 TINIMEX.png', ['ISO 22000:2018'], 'khác năm, chưa chắc cùng giấy'],
  ['Chứng nhận HACCP TINIMEX.png', ['Giấy chứng nhận'], 'tên giấy chỉ có từ đệm'],
  ['Tệp đã tải', ['HACCP'], 'tệp không có tên giấy'],
  ['Chứng nhận HACCP TINIMEX.png', [], 'kho chưa có bản ghi nào'],
  ['ISO.pdf', ['Halal'], 'không liên quan'],
];
for (const [caption, names, why] of kept) {
  assert.equal(legacyCertificateFileCovered(caption, names), false, `Không được ẩn: ${why}`);
}
const filtered = visibleLegacyCertificateFiles(
  [{ caption: 'Chứng nhận HACCP TINIMEX.png' }, { caption: 'Chứng nhận Halal 2026.pdf' }],
  ['HACCP'],
);
assert.equal([...filtered].map((file) => file.caption).join(' | '), 'Chứng nhận Halal 2026.pdf');

/* 2. Trang Giấy tờ lọc dòng di vật bằng chính hàm trên, chỉ xét giấy chưa bị từ chối. */
assert.match(page, /import \{ visibleLegacyCertificateFiles \} from "@\/lib\/supplier-portal\/legacy-certificate-files"/);
assert.match(page, /visibleLegacyCertificateFiles\(/);
assert.match(page, /certificates\.filter\(\(certificate\) => certificate\.review_status !== "rejected"\)\.map\(\(certificate\) => certificate\.name\)/);

/* 3. Từ 11/2026 ô tải chứng nhận luôn mở; đơn vị thương mại có thêm ô hợp đồng với nhà máy. */
assert.ok(!/certificateUploadBlockedReason/.test(page), 'Trang Giấy tờ không còn khoá ô tải chứng nhận');
assert.match(page, /trading=\{trading\}/);
assert.match(upload, /name="relationship_file"/, 'Có ô tải hợp đồng / ủy quyền với nhà máy');
assert.match(portalCopy.vi.documents.certUpload.contractTitle, /Hợp đồng với nhà máy/, 'Nhãn ô hợp đồng nằm trong từ điển');
const route = read('../app/api/supplier-portal/certificates/route.ts');
assert.ok(!/cần xác thực nhà máy đối tác trước khi tải chứng nhận/.test(route), 'API không còn chặn đơn vị thương mại tải chứng nhận');
assert.match(route, /PARTNER_CONTRACT_CAPTION/);

/* 4. Duyệt đăng giấy đứng tên nhà máy khác: cần hợp đồng đã tải và nhân viên đánh dấu đã xem. */
const certActions = read('../app/crm/suppliers/[slug]/audit/[step]/certificate-actions.ts');
assert.match(certActions, /filter\(isPartnerContractDocument\)/);
assert.match(certActions, /options\.partnerContractConfirmed/);
assert.match(certActions, /supplier\.supplier_type !== "trading"/, 'Nhà máy vẫn chỉ đăng giấy đứng tên chính mình');

/* 5. Không còn chữ "AI quét" ở câu nhà cung cấp nhìn thấy. */
assert.ok(!/AI quét/.test(evidenceRoute), 'Thông báo tải giấy tờ L1 không được nhắc AI quét');
assert.ok(evidenceRoute.includes('Đã tải giấy tờ để Vexim đối chiếu.'));
assert.ok(!/AI sẽ tự quét lại/.test(notify), 'Email nhắc hạn không được nhắc AI quét');
assert.ok(!/AI sẽ tự quét lại/.test(dashboard), 'Việc trên bảng điều khiển không được nhắc AI quét');
assert.ok(notify.includes('hệ thống sẽ đọc lại ngày hết hạn và đơn vị đứng tên.'));
assert.ok(portalCopy.vi.notices.certificate.expiringDetail.includes('hệ thống sẽ đọc lại ngày hết hạn và đơn vị đứng tên.'),
  'Câu nhắc gia hạn chứng nhận nằm trong từ điển thông báo');

/* 6. Bước xác thực doanh nghiệp chỉ còn đúng một giấy: Giấy chứng nhận đăng ký kinh doanh. */
const policy = read('../lib/supplier-portal/policy.ts');
const profile = read('../app/supplier/portal/supplier-profile-form.tsx');
assert.match(policy, /COMPANY_DOCUMENT_KEYS = \["business_license"\] as const/);
assert.ok(!/food_safety|export_license/.test(policy.slice(policy.indexOf('COMPANY_DOCUMENT_KEYS ='), policy.indexOf('COMPANY_DOCUMENT_KEYS =') + 120)),
  'Không còn ô ATTP / giấy phép xuất khẩu trong bước xác thực doanh nghiệp');
assert.match(profile, /COMPANY_DOCUMENT_KEYS\.map/, 'Form đăng ký dựng ô tải từ danh sách một giấy');
assert.ok(!/INITIAL_DOCUMENT_KEYS\.map\(/.test(profile), 'Form đăng ký không còn 5 ô tải giấy tờ');
assert.match(profile, /title=\{m\.docs\[/, 'Nhãn ô tải giấy đọc từ từ điển');
assert.match(portalCopy.vi.onboarding.docs.business_license, /Giấy chứng nhận đăng ký kinh doanh/,
  'Bản tiếng Việt giữ đúng tên giấy cũ');
assert.match(portalCopy.vi.documents.title, /Xác thực doanh nghiệp/);
assert.match(page, /title=\{copy\.title\}/, 'Tiêu đề trang đọc từ từ điển');
assert.match(portalCopy.vi.documents.steps.bodies[0], /Một tệp PDF hoặc ảnh, thấy rõ tên doanh nghiệp và mã số thuế\./,
  'Trang Giấy tờ chỉ đòi Giấy chứng nhận đăng ký kinh doanh cho bước xác thực doanh nghiệp');
assert.match(page, /Chứng nhận chất lượng/, 'Trang Giấy tờ cũng là nơi tải chứng nhận chất lượng');

/* 7. Không còn mã bước nội bộ trong câu nhà cung cấp thấy (bỏ qua dòng chú thích). */
const visibleLines = (text) => text.split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .filter((line) => /"[^"]*\bL1\b[^"]*"/.test(line));
for (const [name, text] of [['documents', page], ['dashboard', dashboard],
  ['portal home', read('../app/supplier/portal/page.tsx')], ['profile', read('../app/supplier/portal/profile/page.tsx')]]) {
  assert.deepEqual(visibleLines(text), [], `${name}: không dùng mã bước L1 trong câu nhà cung cấp thấy`);
}
assert.ok(!visibleLines(notify).some((line) => /cổng nhà cung cấp/.test(line)),
  'Email nhắc hạn không còn "giấy tờ L1" trong câu gửi nhà cung cấp');

console.log('✅ Chứng nhận trên hồ sơ: ẩn tệp cũ đã có bản ghi, ô tải luôn mở, giấy của nhà máy khác cần hợp đồng và nhân viên xem trước khi đăng.');
