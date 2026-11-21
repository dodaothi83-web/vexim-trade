import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const sc = await import("../lib/supplier-showcase.ts");

// 1. Kiểm tra nội dung: bắt buộc tiêu đề, giới hạn độ dài, chặn liên hệ, bắt buộc tiếng Anh.
assert.equal(sc.showcaseTextProblem("Grading line", "Kernels are sorted before packing."), null);
assert.equal(sc.showcaseTextProblem("  ", ""), "titleRequired");
assert.equal(sc.showcaseTextProblem("x".repeat(81), ""), "titleTooLong");
assert.equal(sc.showcaseTextProblem("Grading", "x".repeat(401)), "bodyTooLong");
assert.equal(sc.showcaseTextProblem("Contact us", "sales@example.com"), "contact", "Chặn email");
assert.equal(sc.showcaseTextProblem("Visit", "www.example.vn"), "contact", "Chặn đường dẫn");
assert.equal(sc.showcaseTextProblem("Hotline", "0912 345 678"), "contact", "Chặn số điện thoại");
assert.equal(sc.showcaseTextProblem("Vùng nguyên liệu Bình Phước", "Điều thô thu mua trực tiếp"), "language", "Người mua đọc tiếng Anh");
assert.equal(sc.showcaseTextProblem("Raw cashew sourcing in Bình Phước", "Graded at our warehouse."), null, "Địa danh có dấu trong câu tiếng Anh vẫn được");

// 2. Đọc dữ liệu an toàn, giữ tối đa 6 khối, bỏ khối tiếng Việt khi hiện công khai.
const block = (i, title = `Block ${i}`) => ({ id: `b${i}`, image_path: `suppliers/s/showcase-${i}.jpg`, title, body: "" });
assert.equal(sc.normalizeShowcaseBlocks(Array.from({ length: 9 }, (_, i) => block(i))).length, 6);
assert.deepEqual(sc.normalizeShowcaseBlocks("bad"), []);
assert.equal(sc.normalizeShowcaseBlocks([{ id: "x", title: "No image" }]).length, 0, "Khối thiếu ảnh bị bỏ");
assert.deepEqual(sc.publicShowcaseBlocks([block(1), block(2, "Dây chuyền phân loại hạt điều")]).map((b) => b.id), ["b1"]);

// 3. Đổi chỗ khối.
const moved = sc.moveShowcaseBlock([block(1), block(2), block(3)], "b3", -1);
assert.deepEqual(moved.map((b) => b.id), ["b1", "b3", "b2"]);
assert.deepEqual(sc.moveShowcaseBlock([block(1)], "b1", -1).map((b) => b.id), ["b1"]);

// 4. CSDL giới hạn 6 khối.
assert.match(read("supabase/migrations/20261125_supplier_showcase.sql"), /jsonb_array_length\(showcase_blocks\) <= 6/);

// 5. Chỉ Premium/Pro còn hiệu lực mới thêm khối; danh tính từ phiên; xem trước chỉ đọc ảnh của chính mình.
const route = read("app/api/supplier-portal/showcase/route.ts");
assert.match(route, /supplierPlanRules\(supplier\)\.premiumStorefront/);
assert.match(route, /const path = `suppliers\/\$\{supplier\.id\}\/showcase-/);
assert.match(route, /const prefix = `suppliers\/\$\{access\.supplier\.id\}\/showcase-`/);
const actions = read("app/supplier/portal/storefront/showcase-actions.ts");
assert.match(actions, /startsWith\(`suppliers\/\$\{access\.supplier\.id\}\/showcase-`\)/, "Chỉ xoá tệp của chính nhà cung cấp");

// 6. Ảnh công khai chỉ khi đang nằm trong hồ sơ đã đăng và gói còn quyền.
const media = read("app/public-media/[...path]/route.ts");
assert.match(media, /normalizeShowcaseBlocks\(supplier\?\.showcase_blocks\)\.some\(\(block\) => block\.image_path === rel\)/);
assert.match(media, /supplier\.status !== "published" \|\| !supplierPlanRules\(supplier\)\.premiumStorefront/);
assert.match(media, /const aclGated = isProductImage \|\| supplierImage \|\| showcaseImage \|\| aplusImage;/, "Ảnh thu hồi được thì không cache lâu");

// 7. Trang công khai: giao diện cao cấp và khối nội dung chỉ khi gói còn hiệu lực, kèm ghi chú không phải bằng chứng.
const storefront = read("components/public/supplier-storefront.tsx");
assert.match(storefront, /const premium = supplierPlanRules\(s\)\.premiumStorefront;/);
assert.match(storefront, /const showcase = premium && !companyAplus\.length \? publicShowcaseBlocks\(s\.showcase_blocks\) : \[\];/);
assert.match(read("components/public/premium-storefront.tsx"), /They are not evidence of a Vexim check\./);
assert.doesNotMatch(storefront, /Premium supplier|Pro supplier/, "Không gắn nhãn gói cho người mua (gói không phải xác minh)");

console.log("✅ Trang nhà cung cấp cao cấp: khối nội dung tiếng Anh, chặn liên hệ, tối đa 6, ảnh chỉ công khai khi gói còn hiệu lực.");
