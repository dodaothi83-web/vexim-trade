// Ảnh đại diện / ảnh bìa cũ của nhà cung cấp trên CDN (s/<supplierId>/<32 hex>/<cỡ>.webp).
// Chỉ ảnh profile-/cover- trong thư mục của chính nhà cung cấp; giấy tờ, chứng nhận và mọi tệp
// riêng tư khác không bao giờ có khoá CDN.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { publicImagePath as mod, publicUrl } from './lib/media-mocks.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const { supplierImageCdnBase, publicSupplierImagePath } = mod;

const id = '280864a2-63d3-44cb-8ea4-10d84eabc657';
const profile = `suppliers/${id}/profile-8ec9e279-059b-4ba8-831c-6583910e1acb.jpg`;
const cover = `suppliers/${id}/cover-cbfc022f-7fa8-4c94-b89c-d7ae6e2263e0.jpg`;
const profileKey = `s/${id}/8ec9e279059b4ba8831c6583910e1acb`;
const coverKey = `s/${id}/cbfc022f7fa84c94b89cd7ae6e2263e0`;

// Khoá suy ra từ tệp gốc.
assert.equal(supplierImageCdnBase(id, profile, 'profile'), profileKey);
assert.equal(supplierImageCdnBase(id, `/${profile}`, 'profile'), profileKey, 'bỏ dấu / đầu');
assert.equal(supplierImageCdnBase(id, cover, 'cover'), coverKey);
assert.equal(supplierImageCdnBase(id, `suppliers/${id}/profile-8EC9E279-059B-4BA8-831C-6583910E1ACB.JPG`, 'profile'), profileKey, 'uuid in hoa vẫn ra khoá chữ thường');

// Không bao giờ có khoá CDN.
for (const [path, kind, why] of [
  [profile, 'cover', 'sai loại ảnh'],
  [`suppliers/other-id/profile-8ec9e279-059b-4ba8-831c-6583910e1acb.jpg`, 'profile', 'thư mục nhà cung cấp khác'],
  [`suppliers/${id}/profile-r2-8ec9e279-059b-4ba8-831c-6583910e1acb.webp`, 'profile', 'ảnh mới đã ở bucket công khai'],
  [`suppliers/${id}/8ec9e279-059b-4ba8-831c-6583910e1acb.pdf`, 'profile', 'giấy tờ'],
  [`suppliers/${id}/certificates/profile-8ec9e279-059b-4ba8-831c-6583910e1acb.jpg`, 'profile', 'thư mục con'],
  [`verifications/${id}/profile-8ec9e279-059b-4ba8-831c-6583910e1acb.jpg`, 'profile', 'tài liệu xác minh'],
  [`supplier-submissions/${id}/profile-8ec9e279-059b-4ba8-831c-6583910e1acb.jpg`, 'profile', 'hồ sơ NCC gửi'],
  [`suppliers/${id}/showcase-8ec9e279-059b-4ba8-831c-6583910e1acb.jpg`, 'profile', 'khối nội dung'],
  [`suppliers/${id}/profile-8ec9e279-059b-4ba8-831c-6583910e1acb.pdf`, 'profile', 'đuôi không phải ảnh'],
  ['https://example.com/logo.jpg', 'profile', 'URL ngoài'],
  [null, 'profile', 'không có ảnh'],
]) {
  assert.equal(supplierImageCdnBase(id, path, kind), null, `Không chép: ${why}`);
}

const supplier = { id, profile_image: profile, cover_image: cover, profile_image_cdn_key: profileKey, cover_image_cdn_key: coverKey };
const withEnv = (env, fn) => {
  const saved = { MEDIA_CDN_ENABLED: process.env.MEDIA_CDN_ENABLED, NEXT_PUBLIC_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try { fn(); } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
};

// Cờ tắt: luôn giữ đường dẫn cũ.
withEnv({ MEDIA_CDN_ENABLED: undefined }, () => {
  assert.equal(publicSupplierImagePath(supplier, 'profile'), profile);
  assert.equal(publicSupplierImagePath(supplier, 'cover'), cover);
});

withEnv({ MEDIA_CDN_ENABLED: 'true', NEXT_PUBLIC_R2_PUBLIC_URL: 'https://media.veximtrade.com' }, () => {
  assert.equal(publicSupplierImagePath(supplier, 'profile'), `${profileKey}/400.webp`, 'ảnh đại diện dùng bản 400');
  assert.equal(publicSupplierImagePath(supplier, 'cover'), `${coverKey}/1600.webp`, 'ảnh bìa dùng bản 1600');
  assert.equal(publicSupplierImagePath(supplier, 'profile', 1024), `${profileKey}/1024.webp`);
  assert.equal(publicUrl.publicMediaUrl(publicSupplierImagePath(supplier, 'profile')),
    `https://media.veximtrade.com/${profileKey}/400.webp`, 'link thẳng tới CDN');
  // Chưa chép: giữ ảnh gốc.
  assert.equal(publicSupplierImagePath({ ...supplier, profile_image_cdn_key: null }, 'profile'), profile);
  // Nhà cung cấp đã đổi ảnh: khoá cũ không khớp, dùng ảnh mới.
  const fresh = `suppliers/${id}/profile-r2-11111111-2222-4333-8444-555555555555.webp`;
  assert.equal(publicSupplierImagePath({ ...supplier, profile_image: fresh }, 'profile'), fresh);
  assert.equal(publicUrl.publicMediaUrl(fresh), `https://media.veximtrade.com/${fresh}`);
  // Khoá của nhà cung cấp khác không bao giờ được dùng.
  assert.equal(publicSupplierImagePath({ ...supplier, profile_image_cdn_key: `s/other/${'a'.repeat(32)}` }, 'profile'), profile);
  // Đã xoá ảnh: không hiện gì.
  assert.equal(publicSupplierImagePath({ ...supplier, cover_image: null }, 'cover'), null);
});

// Trang công khai đi qua helper; trang thẻ tìm kiếm nhận được bản CDN của chính nhà cung cấp.
const supplierPage = read('app/(public)/suppliers/[slug]/page.tsx');
assert.match(supplierPage, /publicSupplierImagePath\(s, "cover"\)/);
assert.match(supplierPage, /publicSupplierImagePath\(s, "profile"\)/);
assert.match(supplierPage, /publicSupplierImagePath\(r, "profile"\)/);
assert.doesNotMatch(supplierPage, /mediaUrl\((?:s|r)\.(?:profile|cover)_image\)/, 'không dùng thẳng đường dẫn gốc');
assert.match(read('app/(public)/search/page.tsx'), /profileImage: publicSupplierImagePath\(supplier, "profile"\)/);
assert.match(read('lib/public/product-catalog.ts'), /supplierProfileImage: publicSupplierImagePath\(s, "profile"\)/);
const card = read('components/public/search-supplier-card.tsx');
assert.match(card, /relative\.startsWith\(`s\/\$\{id\}\/`\) && isCdnImagePath\(relative\)/, 'thẻ tìm kiếm chỉ nhận bản CDN của chính nhà cung cấp');

// Chép / dọn bản chép.
const cdn = read('lib/media/cdn.ts');
assert.match(cdn, /export async function publishSupplierImageToCdn/);
assert.match(cdn, /const base = supplierImageCdnBase\(supplier\.id, path, kind\);\n  if \(!base \|\| !path\) throw/, 'chỉ chép ảnh có khoá hợp lệ');
for (const file of ['app/api/suppliers/[id]/profile-image/route.ts', 'app/api/supplier-portal/profile-image/route.ts']) {
  assert.match(read(file), /removeSupplierImageFromCdn\(/, `${file} xoá bản chép của ảnh cũ`);
}
assert.equal((read('app/api/suppliers/[id]/profile-image/route.ts').match(/removeSupplierImageFromCdn\(sup, kind\)/g) ?? []).length, 2, 'đổi và xoá ảnh trong CRM đều dọn bản chép');
assert.match(read('app/actions.ts'), /removeSupplierImageFromCdn\(supplier, "profile", \{ rowDeleted: true \}\)/);

// Batch quản trị đọc thêm bảng suppliers.
const route = read('app/api/crm/media-cdn/route.ts');
assert.match(route, /from\("suppliers"\)\.select\(SUPPLIER_COLUMNS\)/);
assert.match(route, /publishSupplierImageToCdn\(j\.supplier, j\.kind\)/);
assert.match(route, /supplierImages:/);

// Migration chỉ thêm cột, không đổi profile_image/cover_image.
const migration = read('supabase/migrations/20261230_supplier_image_cdn_key.sql');
assert.match(migration, /add column if not exists profile_image_cdn_key text/);
assert.match(migration, /add column if not exists cover_image_cdn_key text/);
assert.doesNotMatch(migration, /\bupdate\b|drop column/i);

console.log('check-supplier-image-cdn: OK');
