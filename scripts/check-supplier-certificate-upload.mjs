// node --experimental-strip-types --no-warnings scripts/check-supplier-certificate-upload.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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

/* 8. Kiểm thử route POST với mock ràng buộc CSDL: tệp thuộc NCC không mang ID đợt kiểm.
 * Supabase media_owner_ck yêu cầu verification_id = null với owner_type = supplier;
 * media_checklist_key_ck cũng chỉ nhận key cho tệp thuộc đợt kiểm/hồ sơ tự gửi.
 * ID/key của L1 vẫn được ghi vào bản ghi chứng nhận qua ingestCertificateScan.
 */
const supplier = { id: 'supplier-1', slug: 'supplier-1', onboarding_status: 'approved' };
const l1Review = { id: '11111111-1111-1111-1111-111111111111', target_level: 1, status: 'approved' };
let currentReview = l1Review;
let rejectMedia = false;
let rejectScan = false;
const mediaWrites = [];
const scanInputs = [];
const deletedPaths = [];
const deletedMedia = [];
const store = {
  listCertificates: async () => [],
  getSupplier: async () => supplier,
  createMedia: async (input) => {
    mediaWrites.push(input);
    if (input.owner_type === 'supplier' && (input.verification_id !== null || input.product_id !== null)) {
      throw new Error('createMedia: violates check constraint "media_owner_ck"');
    }
    if (input.checklist_key !== null) throw new Error('createMedia: violates check constraint "media_checklist_key_ck"');
    if (rejectMedia) throw new Error('createMedia: connection lost');
    return { ...input, id: `media-${mediaWrites.length}` };
  },
  deleteMedia: async (id) => { deletedMedia.push(id); },
};
const routeMocks = {
  'next/server': { NextResponse: { json: (body, { status = 200 } = {}) => Response.json(body, { status }) } },
  'next/cache': { revalidatePath: () => {} },
  'node:crypto': { randomUUID: () => '22222222-2222-2222-2222-222222222222' },
  '@/lib/supplier-portal/access': { supplierPortalAccess: async () => ({
    supplier, review: currentReview, user: { id: 'user-1', email: 'supplier@example.com' }, store,
  }) },
  '@/lib/supplier-portal/onboarding': { portalApproved: (value) => value.onboarding_status === 'approved' },
  '@/lib/media/validate': { validateUpload: () => ({ ok: true, mime: 'application/pdf' }), extensionFor: () => 'pdf' },
  '@/lib/media/storage': { putObject: async () => {}, deleteObject: async (path) => { deletedPaths.push(path); } },
  '@/lib/certificate-service': {
    isL1CertificateKey: (key) => key === 'haccp_or_brc',
    defaultCertificateLabelForKey: () => 'Giấy chứng nhận',
    PARTNER_CONTRACT_CAPTION: 'Hợp đồng với nhà máy',
    ingestCertificateScan: async (input) => {
      scanInputs.push(input);
      if (rejectScan) throw new Error('scan store unavailable');
      return { certificate: { id: 'cert-1', name: 'HACCP', review_status: 'pending', publicly_visible: false } };
    },
  },
  '@/lib/crm/badges': { refreshCrmBadges: () => {} },
};
const routeCode = ts.transpileModule(route, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeModule = { exports: {} };
vm.runInThisContext(`(function(exports, require, module) { ${routeCode}\n })`)(routeModule.exports, (id) => {
  assert.ok(id in routeMocks, `Unexpected upload route import ${id}`);
  return routeMocks[id];
}, routeModule);
const { POST } = routeModule.exports;
function uploadRequest(checklistKey) {
  const form = new FormData();
  form.set('file', new File(['%PDF-test'], 'haccp.pdf', { type: 'application/pdf' }));
  if (checklistKey) form.set('checklist_key', checklistKey);
  return new Request('https://example.test/api/supplier-portal/certificates', { method: 'POST', body: form });
}

let response = await POST(uploadRequest('haccp_or_brc'));
assert.equal(response.status, 200, 'An approved supplier with an L1 review can upload a quality certificate');
assert.equal(mediaWrites[0].owner_type, 'supplier');
assert.equal(mediaWrites[0].supplier_id, supplier.id);
assert.equal(mediaWrites[0].audience, 'internal', 'Uploaded certificates remain private until approved');
assert.equal(mediaWrites[0].kind, 'certificate');
assert.equal(mediaWrites[0].verification_id, null, 'Supplier media must not be owned by the L1 review');
assert.equal(mediaWrites[0].checklist_key, null, 'A supplier-owned certificate file has no audit checklist key');
assert.equal(scanInputs[0].verificationId, l1Review.id, 'The certificate record keeps its L1 provenance');
assert.equal(scanInputs[0].checklistKey, 'haccp_or_brc', 'Legacy checklist metadata stays on the certificate');
assert.equal(scanInputs[0].source, 'l1-supplier');
assert.equal(deletedPaths.length, 0);

currentReview = null;
response = await POST(uploadRequest());
assert.equal(response.status, 200, 'An approved supplier without a review can also upload');
assert.equal(mediaWrites[1].verification_id, null);
assert.equal(scanInputs[1].verificationId, null);

rejectMedia = true;
const originalConsoleError = console.error;
try {
  console.error = () => {}; // This branch deliberately simulates a database outage.
  response = await POST(uploadRequest());
} finally {
  console.error = originalConsoleError;
}
assert.equal(response.status, 503);
const uploadErrorMessage = (await response.json()).message;
assert.match(uploadErrorMessage, /hệ thống.*chứng nhận|chứng nhận.*hệ thống/i);
assert.match(uploadErrorMessage, /chưa được ghi nhận/);
assert.doesNotMatch(uploadErrorMessage, /media_owner_ck|createMedia|không khớp tên|L2/i);
assert.equal(deletedPaths.length, 1, 'Failed media insert cleans up the uploaded object');
assert.equal(deletedMedia.length, 0);

rejectMedia = false;
rejectScan = true;
try {
  console.error = () => {};
  response = await POST(uploadRequest());
} finally {
  console.error = originalConsoleError;
}
assert.equal(response.status, 503);
assert.match((await response.json()).message, /kiểm tra.*danh sách/i,
  'After the media insert, do not promise the certificate was never recorded');
assert.deepEqual(deletedMedia, ['media-4']);
assert.equal(deletedPaths.length, 2);

console.log('✅ Chứng nhận trên hồ sơ: tệp supplier hợp lệ với media_owner_ck, giữ liên kết L1 trên chứng nhận, lỗi hệ thống rõ ràng; giấy của nhà máy khác cần hợp đồng và nhân viên xem trước khi đăng.');
