// node --experimental-strip-types --no-warnings scripts/check-product-certificates.mjs
//
// Chứng nhận theo từng sản phẩm (Phase 2, không cần migration): dùng lại
// certificates.requested_product_ids / approved_product_ids.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  certificateLabel,
  certificateLinkable,
  certificateProductState,
  productCertificates,
  withApprovedProduct,
  withRequestedProduct,
} from '../lib/products/product-certificates.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* 1. Trạng thái liên kết: đã duyệt thắng yêu cầu, còn lại là chưa gắn. */
const cert = (patch = {}) => ({ id: 'c1', name: 'HACCP', issuer: 'SGS', valid_until: null, ...patch });
assert.equal(certificateProductState(cert(), 'p1'), 'none');
assert.equal(certificateProductState(cert({ requested_product_ids: ['p1'] }), 'p1'), 'requested');
assert.equal(certificateProductState(cert({ requested_product_ids: ['p1'], approved_product_ids: ['p1'] }), 'p1'), 'approved',
  'đã duyệt thì không còn là "chờ duyệt"');
assert.equal(certificateProductState(cert({ requested_product_ids: ['p2'] }), 'p1'), 'none', 'chỉ tính đúng sản phẩm');
assert.equal(certificateProductState({ ...cert(), requested_product_ids: null }, 'p1'), 'none');

/* 2. Gom theo sản phẩm cho form và trang sản phẩm. */
const grouped = productCertificates([
  cert({ id: 'a', approved_product_ids: ['p1'] }),
  cert({ id: 'b', requested_product_ids: ['p1'] }),
  cert({ id: 'c' }),
], 'p1');
assert.deepEqual(grouped.approved.map((c) => c.id), ['a']);
assert.deepEqual(grouped.requested.map((c) => c.id), ['b']);

/* 3. Nhà cung cấp chỉ ghi yêu cầu, không đụng danh sách đã duyệt. */
assert.deepEqual(withRequestedProduct(cert(), 'p1', true), ['p1']);
assert.deepEqual(withRequestedProduct(cert({ requested_product_ids: ['p1'] }), 'p1', false), []);
assert.deepEqual(withRequestedProduct(cert({ requested_product_ids: ['p2'] }), 'p1', true), ['p2', 'p1'], 'giữ yêu cầu của sản phẩm khác');
assert.deepEqual(withRequestedProduct(cert({ approved_product_ids: ['p1'] }), 'p1', false), [],
  'bỏ yêu cầu không xoá quyết định đã duyệt');

/* 4. Nhân viên duyệt/bỏ duyệt: bỏ duyệt cũng rút yêu cầu. */
assert.deepEqual(withApprovedProduct(cert({ requested_product_ids: ['p1'] }), 'p1', true),
  { approved_product_ids: ['p1'], requested_product_ids: [] });
assert.deepEqual(withApprovedProduct(cert({ approved_product_ids: ['p1', 'p2'], requested_product_ids: ['p1'] }), 'p1', false),
  { approved_product_ids: ['p2'], requested_product_ids: [] });
assert.deepEqual(withApprovedProduct(cert({ approved_product_ids: ['p2'] }), 'p1', true),
  { approved_product_ids: ['p2', 'p1'], requested_product_ids: [] });

/* 5. Chỉ chứng nhận còn hạn mới được gắn; nhãn đọc được một dòng. */
const today = new Date('2026-10-30T00:00:00Z');
assert.equal(certificateLinkable(cert(), today), true, 'không ghi hạn thì vẫn cho gắn');
assert.equal(certificateLinkable(cert({ valid_until: '2026-10-29' }), today), false);
assert.equal(certificateLinkable(cert({ valid_until: '2027-01-01' }), today), true);
assert.match(certificateLabel(cert({ valid_until: '2027-01-01' })), /HACCP · SGS · hết hạn/);
assert.match(certificateLabel({ id: 'x', name: '  ' }), /Chứng nhận/, 'thiếu tên thì vẫn có nhãn');

/* 6. Nối dây: portal xin gắn, CRM duyệt, không mở lại ô tự khai. */
const supplierAction = read('app/supplier/portal/product-certificate-actions.ts');
assert.match(supplierAction, /requested_product_ids/, 'nhà cung cấp chỉ ghi yêu cầu');
assert.doesNotMatch(supplierAction, /withApprovedProduct|approved_product_ids:/, 'nhà cung cấp không được tự duyệt');
assert.match(supplierAction, /listCertificates\(access\.supplier\.id\)/, 'chỉ dùng chứng nhận của chính nhà cung cấp');
assert.match(supplierAction, /certificateLinkable/, 'chặn chứng nhận hết hạn');

const crmAction = read('app/crm/products/[slug]/certificate-actions.ts');
assert.match(crmAction, /guard\("products\.manage"\)/, 'duyệt liên kết cần quyền duyệt sản phẩm');
assert.match(crmAction, /withApprovedProduct/, 'nhân viên duyệt bằng hàm dùng chung');
assert.match(crmAction, /certificate\.supplier_id !== product\.supplier_id/, 'chặn gắn chứng nhận của nhà cung cấp khác');

const portalPage = read('app/supplier/portal/products/[id]/page.tsx');
assert.match(portalPage, /ProductCertificatesForm/, 'trang sản phẩm có khối chứng nhận');
const portalForm = read('app/supplier/portal/products/product-certificates-form.tsx');
assert.match(portalForm, /useActionState/, 'form báo kết quả cho nhà cung cấp');
assert.doesNotMatch(portalForm, /\bbuyer\b|\bNCC\b/, 'chuỗi hiển thị dùng "người mua"/"nhà cung cấp"');
/* Tải chứng nhận ngay trong khối: không rời trang nên dữ liệu đang nhập ở các khối trên còn nguyên. */
assert.match(portalForm, /fetch\("\/api\/supplier-portal\/certificates"/, 'khối chứng nhận tự tải tệp lên');
assert.match(portalForm, /setJustUploaded/, 'chứng nhận vừa tải được ghép vào danh sách để gắn ngay');
assert.doesNotMatch(portalForm, /<Link|href="\/supplier\/portal\/documents"/, 'không đẩy nhà cung cấp sang trang khác');
assert.doesNotMatch(portalForm, /router\.(refresh|push)/, 'không điều hướng lại trang khi tải tệp');
const crmPage = read('app/crm/products/[slug]/edit/page.tsx');
assert.match(crmPage, /Duyệt liên kết/, 'CRM có nút duyệt liên kết');

/* 7. Không thêm bảng/cột: vẫn là cột chứng nhận sẵn có. */
const migration = read('supabase/migrations/20261072_product_keywords_sample_price_packaging.sql');
assert.doesNotMatch(migration, /certificate/i, 'chứng nhận theo sản phẩm không cần migration');

console.log('✅ Chứng nhận theo sản phẩm: nhà cung cấp xin gắn, Vexim duyệt, dùng lại cột chứng nhận sẵn có.');
