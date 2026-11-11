import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';

/**
 * Nạp module TS/TSX của app trong tiến trình node (alias `@/…`, JSX, không cần build).
 * Cùng kiểu với các bài kiểm tra khác của kho: giữ script chạy được trên mã nguồn thật
 * thay vì đọc chuỗi và đoán.
 */
const ROOT = new URL('..', import.meta.url).pathname;
const nativeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

function resolveModuleFile(target) {
  const base = resolve(ROOT, target);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function load(file, mocks = {}) {
  const absolute = resolveModuleFile(file);
  if (!absolute) throw new Error(`Cannot resolve ${file}`);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports;
  const mod = { exports: {} };
  moduleCache.set(absolute, mod);
  const code = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const require = (id) => {
    if (id in mocks) return mocks[id];
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return jsxRuntime;
    if (id === 'lucide-react') return icons;
    if (id.startsWith('@/')) return load(id.slice(2), mocks);
    if (id.startsWith('.')) return load(resolve(dirname(absolute), id), mocks);
    return nativeRequire(id);
  };
  vm.runInThisContext(`(function (exports, require, module) { ${code}\n})`, { filename: absolute })(mod.exports, require, mod);
  return mod.exports;
}

const {
  certificateImageUrl, isCertificateImageAsset, publicCertificateImage, publicSupplierCertificates,
} = load('lib/public/certificates.ts');
const { isExpired } = load('lib/media/readiness.ts');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const TODAY = '2026-11-11';

const media = (patch = {}) => ({
  id: 'media-cert-1', owner_type: 'supplier', supplier_id: 'sup-1', product_id: null, verification_id: null,
  checklist_key: null, kind: 'certificate', audience: 'internal', status: 'unverified', expires_on: null,
  caption: 'HACCP', storage_path: 'suppliers/sup-1/certificates/haccp.jpg', thumb_path: null, external_url: null,
  mime: 'image/jpeg', bytes: 120_000, width: null, height: null, sort_order: 0, created_by: 'usr-1',
  created_at: TODAY, updated_at: TODAY, ...patch,
});

const certificate = (patch = {}) => ({
  id: 'cert-1', supplier_id: 'sup-1', name: 'HACCP Codex Alimentarius', issuer: 'TQC', number: null,
  valid_until: '2027-10-02', file_media_id: 'media-cert-1', check_status: 'verified', checked_at: TODAY,
  checked_by: 'usr-1', notes: null, created_at: TODAY, updated_at: TODAY,
  review_status: 'approved', publicly_visible: true, staff_hidden: false,
  superseded_by_certificate_id: null, holder_match: 'owner', holder_name: null,
  certificate_scheme: 'haccp', ...patch,
});

/* 1. Nhận diện ảnh: PDF và tệp không phải ảnh không bao giờ được coi là ảnh trưng bày. */
assert.equal(isCertificateImageAsset(media()), true);
assert.equal(isCertificateImageAsset(media({ storage_path: 'suppliers/sup-1/certificates/haccp.JPG' })), true,
  'Đuôi tệp viết hoa vẫn là ảnh');
assert.equal(isCertificateImageAsset(media({ mime: null })), true, 'Thiếu MIME thì dựa vào đuôi tệp');
assert.equal(isCertificateImageAsset(media({ storage_path: 'suppliers/sup-1/certificates/haccp.pdf', mime: 'application/pdf' })), false,
  'Giấy scan PDF không phải ảnh trưng bày');
assert.equal(isCertificateImageAsset(media({ storage_path: 'suppliers/sup-1/certificates/haccp.jpg', mime: 'application/pdf' })), false,
  'MIME khai PDF thì không tin đuôi tệp');
assert.equal(isCertificateImageAsset(null), false);
assert.equal(isCertificateImageAsset(media({ storage_path: null })), false);
assert.equal(certificateImageUrl('media-cert-1'), '/public-media/certificate/media-cert-1');

/* 2. Hồ sơ công khai trả về đường dẫn ảnh, và chỉ khi tệp là ảnh. */
const visible = publicSupplierCertificates('sup-1', [certificate()], [media()], TODAY);
assert.equal(visible.length, 1);
assert.equal(visible[0].imageUrl, '/public-media/certificate/media-cert-1', 'Thẻ chứng nhận có ảnh công khai');
assert.equal(visible[0].validUntil, '2027-10-02');
assert.equal(publicSupplierCertificates('sup-1', [certificate()], [media({ storage_path: 'suppliers/sup-1/certificates/haccp.pdf', mime: 'application/pdf' })], TODAY)[0].imageUrl,
  null, 'Giấy PDF vẫn hiện thẻ, chỉ không có ảnh');
assert.equal(publicSupplierCertificates('sup-1', [certificate()], [], TODAY)[0].imageUrl, null,
  'Không có dòng media thì không dựng đường dẫn ảnh');

/* 3. Cổng đọc ảnh: mọi điều kiện công khai phải còn đúng, sai một điều là đóng. */
const gate = (certPatch = {}, mediaPatch = {}, certs) => publicCertificateImage(
  media(mediaPatch), certs ?? [certificate(certPatch)], TODAY);
assert.ok(gate(), 'Giấy đã duyệt + công khai + còn hạn thì ảnh mở');
for (const [patch, reason] of [
  [{ review_status: 'pending' }, 'chưa duyệt'],
  [{ review_status: 'changes_requested' }, 'bị trả lại'],
  [{ publicly_visible: false }, 'chưa công khai'],
  [{ staff_hidden: true }, 'bị nhân viên ẩn'],
  [{ superseded_by_certificate_id: 'cert-2' }, 'đã bị giấy mới thay thế'],
  [{ valid_until: '2026-01-01' }, 'đã hết hạn'],
  [{ valid_until: null }, 'không có hạn'],
  [{ holder_match: null }, 'chưa rõ đơn vị đứng tên'],
  [{ holder_match: 'partner', holder_name: '  ' }, 'đối tác không có tên trên giấy'],
  [{ file_media_id: 'media-khac' }, 'giấy không trỏ tới tệp này'],
]) {
  assert.equal(gate(patch), null, `Ảnh đóng khi ${reason}`);
}
assert.equal(publicCertificateImage(media(), [], TODAY), null, 'Không có chứng nhận nào thì không mở ảnh');
assert.equal(publicCertificateImage(media({ kind: 'document' }), [certificate()], TODAY), null,
  'Chỉ tệp chứng nhận mới được trưng bày');
assert.equal(publicCertificateImage(media({ supplier_id: null }), [certificate()], TODAY), null);
assert.equal(publicCertificateImage(media({ storage_path: 'suppliers/sup-1/certificates/haccp.pdf', mime: 'application/pdf' }),
  [certificate()], TODAY), null, 'PDF không qua route ảnh công khai');
assert.ok(isExpired(media({ expires_on: '2020-01-01' })), 'Tệp hết hạn theo ngày của chính tệp');
assert.equal(publicCertificateImage(media({ expires_on: '2020-01-01' }), [certificate()], TODAY), null,
  'Tệp media hết hạn thì ảnh đóng');

/* 4. Route ảnh dùng lại cổng trên, không chép điều kiện và không đi qua kho công khai. */
const route = read('app/public-media/certificate/[mediaId]/route.ts');
assert.match(route, /publicCertificateImage\(/, 'Route ảnh dùng đúng hàm cổng công khai');
assert.match(route, /getStore\(\)/, 'Route đọc dữ liệu từ kho thật, không tin tham số trên URL');
assert.match(route, /notFound\(\)/, 'Mọi trường hợp không hợp lệ trả 404 giống nhau');
assert.match(route, /public, max-age=60/, 'Cache ngắn để thu hồi giấy có hiệu lực ngay');
assert.match(route, /X-Robots-Tag/, 'Ảnh chứng nhận không được đánh chỉ mục');
assert.doesNotMatch(route, /request\.url|searchParams/, 'Route không nhận đường dẫn tệp từ người dùng');
assert.match(read('app/public-media/[...path]/route.ts'), /Giấy tờ chứng nhận\/phim không qua route này/,
  'Kho ảnh công khai vẫn không phục vụ giấy chứng nhận');

/* 5. Thẻ trưng bày: ảnh + tiêu đề + ngày hết hạn; PDF rơi về bìa tài liệu có ghi chú rõ. */
const { SupplierCertificateRail } = load('components/public/supplier-certificate-rail.tsx');
const html = renderToStaticMarkup(React.createElement(SupplierCertificateRail, {
  certificates: [
    visible[0],
    { ...visible[0], id: 'cert-2', name: 'ISO 22000', imageUrl: null, validUntil: '2028-03-01', issuer: 'SGS' },
  ],
}));
assert.match(html, /src="\/public-media\/certificate\/media-cert-1"/, 'Ảnh chứng nhận được trưng bày');
assert.match(html, /alt="HACCP Codex Alimentarius certificate issued by TQC"/, 'Ảnh có mô tả cho trình đọc màn hình');
assert.match(html, /HACCP Codex Alimentarius<\/h3>/, 'Tiêu đề nằm dưới ảnh');
assert.match(html, /Valid until <strong[^>]*>2027-10-02<\/strong>/, 'Ngày hết hạn nằm dưới tiêu đề');
assert.match(html, /ISO 22000<\/h3>/, 'Giấy PDF vẫn có thẻ riêng');
assert.match(html, /PDF on file/, 'Giấy PDF ghi rõ là tệp PDF, không giả làm ảnh');
const rail = read('components/public/supplier-certificate-rail.tsx');
assert.match(rail, /aria-label="Previous certificates"/, 'Có nút lùi cho người dùng chuột');
assert.match(rail, /aria-label="Next certificates"/, 'Có nút tiến cho người dùng chuột');
assert.match(rail, /scrollBy\(/, 'Nút mũi tên trượt đúng một thẻ');
assert.match(html, /role="region"/, 'Danh sách là một vùng có tên cho trình đọc màn hình');
assert.match(html, /tabindex="0"/, 'Vùng trượt nhận focus bàn phím');
assert.match(html, /snap-x snap-mandatory/, 'Danh sách trượt ngang, dừng theo từng thẻ');
assert.match(html, /focus-visible:ring-brand-300/, 'Vùng trượt nhận được focus bàn phím');
const holderLine = renderToStaticMarkup(React.createElement(SupplierCertificateRail, {
  certificates: [{ ...visible[0], holderMatch: 'partner', holderName: 'Dong Nai Factory' }],
}));
assert.match(holderLine, /Third-party holder · Dong Nai Factory/, 'Giấy đứng tên bên thứ ba vẫn nói rõ');
assert.doesNotMatch(holderLine, /Registered to supplier/, 'Không gán nhầm giấy đối tác cho nhà cung cấp');

/* 6. Trang hồ sơ dùng danh sách trưng bày thay cho lưới chữ cũ. */
const storefront = read('components/public/supplier-storefront.tsx');
assert.match(storefront, /<SupplierCertificateRail certificates=\{certificates\} \/>/, 'Hồ sơ công khai dùng danh sách trưng bày');
assert.doesNotMatch(storefront, /grid gap-3 sm:grid-cols-2">\s*\{certificates\.map/, 'Lưới hai cột cũ đã bỏ');

console.log('✅ Certificate gallery: ảnh đã duyệt mới công khai, PDF ở lại kho nội bộ, thẻ có tiêu đề và ngày hết hạn.');
