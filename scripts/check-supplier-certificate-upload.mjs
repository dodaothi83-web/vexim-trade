// node --experimental-strip-types --no-warnings scripts/check-supplier-certificate-upload.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  legacyCertificateFileCovered,
  visibleLegacyCertificateFiles,
} from '../lib/supplier-portal/legacy-certificate-files.ts';

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

/* 3. Đơn vị thương mại chưa có L2 nhà máy đối tác: ô tải đóng sẵn kèm lý do. */
assert.match(page, /const l2Scope = approvedL2Scope\(reviews\);/);
assert.match(page, /supplier\.supplier_type === "trading" && !partnerContractApproved/);
assert.match(page, /Sản phẩm vẫn đăng bán bình thường\./);
assert.match(page, /blockedReason=\{certificateUploadBlockedReason\}/);

/* 4. Component: có lý do thì hiện khung khoá + lối sang bước 2, không render form tải. */
const lockedBranch = upload.slice(upload.indexOf('if (blockedReason)'), upload.indexOf('<form'));
assert.ok(lockedBranch.includes('Chưa mở được ô tải chứng nhận'), 'Khung khoá phải có tiêu đề');
assert.ok(lockedBranch.includes('disabled'), 'Ô chọn tệp phải khoá');
assert.ok(!lockedBranch.includes('onSubmit={onSubmit}'), 'Khung khoá không được chứa form tải');
assert.match(upload, /href="\/supplier\/portal\/verification\/factory"/);
assert.match(upload, /blockedReason\?: string \| null;/);

/* 5. Không còn chữ "AI quét" ở câu nhà cung cấp nhìn thấy. */
assert.ok(!/AI quét/.test(evidenceRoute), 'Thông báo tải giấy tờ L1 không được nhắc AI quét');
assert.ok(evidenceRoute.includes('Đã tải giấy tờ để Vexim đối chiếu.'));
assert.ok(!/AI sẽ tự quét lại/.test(notify), 'Email nhắc hạn không được nhắc AI quét');
assert.ok(!/AI sẽ tự quét lại/.test(dashboard), 'Việc trên bảng điều khiển không được nhắc AI quét');
assert.ok(notify.includes('hệ thống sẽ đọc lại ngày hết hạn và đơn vị đứng tên.'));
assert.ok(dashboard.includes('hệ thống sẽ đọc lại ngày hết hạn và đơn vị đứng tên.'));

console.log('✅ Chứng nhận trên hồ sơ: ẩn tệp cũ đã có bản ghi, khoá ô tải với đơn vị thương mại chưa xác thực nhà máy đối tác.');
