// node scripts/check-crm-aplus-staff.mjs
// Nhân viên Vexim soạn A+ hộ nhà cung cấp (dịch vụ bên ngoài): sửa thẳng nội dung A+, lưu là đăng ngay,
// đúng quyền, cùng kiểm tra/dịch/video như nhà cung cấp, ghi nhật ký, tệp vào đúng thư mục nhà cung cấp.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const actions = read("app/crm/aplus-staff-actions.ts");
assert.match(actions, /^"use server";/);
assert.match(actions, /guard\("products\.manage"\)/, "A+ sản phẩm: quyền quản lý sản phẩm");
assert.match(actions, /guard\("suppliers\.manage"\)/, "A+ doanh nghiệp: quyền quản lý nhà cung cấp");
assert.match(actions, /prepareAplusForSave\(modules, ctx, ids\(retranslate\)\)/, "Cùng kiểm tra và dịch như nhà cung cấp lưu");
assert.match(actions, /verifyAplusVideos\(checked\.modules, target\.before, ctx\)/, "Video phải đúng sản phẩm/nhà cung cấp");
assert.match(actions, /content_mode: "aplus" as const/, "Lưu là đăng: trang sản phẩm hiện A+");
assert.match(actions, /action: target\.productId \? "staff\.product_aplus_saved" : "staff\.company_aplus_saved"/, "Ghi nhật ký tên nhân viên");
assert.doesNotMatch(actions, /aplus_drafts|pending/, "Không có bước chờ nhà cung cấp duyệt");

const upload = read("lib/products/aplus-staff-upload.ts");
assert.match(upload, /hasPermission\(session\.role, permission\)/);
assert.match(upload, /storeAplusImage\(`aplus\/\$\{target\.supplierId\}\/\$\{target\.productId \?\? COMPANY_APLUS_ID\}`, bytes\)/, "Ảnh vào thư mục A+ của đúng nhà cung cấp");
assert.match(upload, /purpose: "company"/, "Video A+ doanh nghiệp gắn mục đích company");
assert.match(upload, /isAplusImageFile\(path, target\.supplierId, target\.productId \?\? COMPANY_APLUS_ID\)/, "Chỉ xem ảnh của đúng chỗ đang soạn");
assert.match(read("app/api/crm/aplus/product/[id]/route.ts"), /staffAplusUpload\(request, t, "products\.manage"\)/);
assert.match(read("app/api/crm/aplus/company/[supplierId]/route.ts"), /staffAplusUpload\(request, t, "suppliers\.manage"\)/);

const verify = read("lib/products/aplus-video-verify.ts");
assert.match(verify, /video\?\.meta\.purpose !== "company" \|\| video\?\.meta\.supplier_id !== ctx\.supplierId/);
assert.match(verify, /video\?\.meta\.product_id !== ctx\.productId/);
assert.match(read("app/supplier/portal/aplus-actions.ts"), /verifyAplusVideos\(checked\.modules, before, ctx\)/, "Nhà cung cấp lưu dùng cùng kiểm tra video");
assert.match(read("app/supplier/portal/storefront/company-aplus-actions.ts"), /verifyAplusVideos\(checked\.modules, before, ctx\)/);

assert.match(read("app/crm/products/[slug]/aplus/page.tsx"), /requirePagePermission\("products\.manage"/);
assert.match(read("app/crm/suppliers/[slug]/aplus/page.tsx"), /requirePagePermission\("suppliers\.manage"/);
const workspace = read("app/crm/aplus-workspace.tsx");
assert.match(workspace, /Bấm lưu là nội dung đăng ngay/);
assert.match(workspace, /endpoint: `\/api\/crm\/aplus\/product\/\$\{id\}`/);
assert.match(read("app/crm/products/[slug]/edit/aplus-review.tsx"), /href=\{`\/crm\/products\/\$\{productId\}\/aplus`\}/, "Nút soạn hộ ở trang sản phẩm CRM");
assert.match(read("app/crm/suppliers/[slug]/company-aplus-review.tsx"), /href=\{`\/crm\/suppliers\/\$\{supplierId\}\/aplus`\}/, "Nút soạn hộ ở trang nhà cung cấp CRM");
assert.equal(existsSync(new URL("../supabase/migrations/20261222_aplus_drafts.sql", import.meta.url)), false, "Không cần bảng bản nháp");
console.log("✅ CRM soạn A+ hộ nhà cung cấp: đúng quyền, lưu là đăng ngay, cùng kiểm tra/dịch/video, ghi nhật ký, tệp đúng thư mục.");
