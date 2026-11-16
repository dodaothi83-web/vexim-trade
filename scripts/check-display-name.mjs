#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/check-display-name.mjs
//
// Tên hiển thị cho buyer được soạn từ dữ kiện có cấu trúc, tách khỏi tên gốc của
// nhà cung cấp. Bộ kiểm này khoá bốn điều:
//   1. thứ tự soạn: mặt hàng, quy cách, tỉnh, tối đa hai chỉ tiêu phụ;
//   2. không bao giờ sinh ra chỗ trống ("Chưa xác định"), thiếu dữ kiện thì bỏ phần đó;
//   3. trang buyer đọc tên soạn sẵn và lùi về tên gốc khi để trống;
//   4. danh mục vẫn suy từ tên gốc, không suy từ tên soạn sẵn.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { composeDisplayName, isPlaceholderDisplayName, publicProductTitle } from "../lib/public/display-name.ts";
import {
  DISPLAY_NAME_HARD_MAX,
  DISPLAY_NAME_RECOMMENDED_MAX,
  displayNameLooksClean,
  displayNameWarnings,
} from "../lib/public/display-name-rules.ts";

/* ---------------- 1. Thứ tự soạn ---------------- */

assert.equal(
  composeDisplayName({ categoryLabel: "Pepper", grade: "550 g/l", province: "Dak Lak" }),
  "Pepper 550 g/l, Dak Lak",
  "Quy cách dạng số đo ghép sau nhãn danh mục",
);
assert.equal(
  composeDisplayName({ categoryLabel: "Cashew kernels", grade: "W320", province: "Dong Nai" }),
  "Cashew kernels W320, Dong Nai",
);
assert.equal(
  composeDisplayName({ categoryLabel: "Cinnamon and star anise", grade: "Cassia split", province: "Yen Bai" }),
  "Cassia split, Yen Bai",
  "Quy cách dạng chữ đã tự là tên mặt hàng, không ghép lặp nhãn danh mục",
);

/* Thiếu phần nào thì bỏ phần đó, không điền chỗ trống. */
assert.equal(composeDisplayName({ categoryLabel: "Pepper", province: "Dak Lak" }), "Pepper, Dak Lak");
assert.equal(composeDisplayName({ grade: "550 g/l" }), "550 g/l");
assert.equal(composeDisplayName({}), "", "Không có dữ kiện thì trả rỗng để nơi gọi lùi về tên gốc");
assert.equal(composeDisplayName({ categoryLabel: "Pepper", grade: "550 g/l", province: "Chưa xác định" }), "Pepper 550 g/l");

/* Tỉnh đã nằm trong phần đầu thì không lặp lại ở đuôi. */
assert.equal(composeDisplayName({ grade: "Pepper Dak Lak", province: "Dak Lak" }), "Pepper Dak Lak");

/* ---------------- 2. Chỉ tiêu phụ ---------------- */

assert.equal(
  composeDisplayName({
    categoryLabel: "Pepper",
    grade: "550 g/l",
    province: "Dak Lak",
    attributes: { grade: "550 g/l", moisture: "12.5% max" },
    attributeLabels: { grade: "Density (g/l)", moisture: "Moisture" },
  }),
  "Pepper 550 g/l, Dak Lak, Moisture 12.5% max",
  "Quy cách không lặp lại ở phần đuôi",
);

assert.equal(
  composeDisplayName({
    categoryLabel: "Pepper",
    grade: "550 g/l",
    province: "Dak Lak",
    attributes: { a: "one", b: "two", c: "three" },
    attributeLabels: { a: "A", b: "B", c: "C" },
  }),
  "Pepper 550 g/l, Dak Lak, A one, B two",
  "Chỉ lấy tối đa hai chỉ tiêu phụ",
);

/* Phần đuôi không được đẩy tên quá giới hạn cột 120 ký tự. */
const long = composeDisplayName({
  categoryLabel: "Cashew kernels",
  grade: "W320",
  province: "Dong Nai",
  attributes: { processing: "steam treated and vacuum packed in 22.68 kg cartons" },
  attributeLabels: { processing: "Processing" },
  maxLength: 60,
});
assert.ok(long.length <= 60 && !long.includes("Processing"), "Chỉ tiêu phụ dài bị bỏ, không cắt giữa từ");
assert.equal(
  composeDisplayName({ grade: "x".repeat(130), province: "Dak Lak" }),
  "",
  "Phần đầu quá dài thì trả rỗng, không cắt giữa từ",
);

/* Không bao giờ để chỗ trống lọt vào tên công khai. */
for (const value of ["Chưa xác định", "chua xac dinh", "Unknown", "N/A", "-", "  "]) {
  const composed = composeDisplayName({ categoryLabel: "Pepper", grade: value, province: value });
  assert.doesNotMatch(composed, /chưa xác định|unknown|n\/a/i, `Không sinh chỗ trống từ ${JSON.stringify(value)}`);
}
assert.equal(isPlaceholderDisplayName("Chưa xác định"), true);
assert.equal(isPlaceholderDisplayName("Pepper 550 g/l"), false);

/* ---------------- 3. Trang buyer đọc tên nào ---------------- */

assert.equal(
  publicProductTitle({ name: "Black pepper 550 g/L, machine cleaned", display_name: "Pepper 550 g/l, Dak Lak" }),
  "Pepper 550 g/l, Dak Lak",
);
assert.equal(
  publicProductTitle({ name: "Black pepper 550 g/L, machine cleaned", name_i18n: { en: "Black pepper 550 g/L" }, display_name: "" }),
  "Black pepper 550 g/L",
  "Để trống thì lùi về bản tiếng Anh của tên gốc",
);
assert.equal(publicProductTitle({ name: "Cassia split, 4 mm" }), "Cassia split, 4 mm");
assert.equal(
  publicProductTitle({ name: "Cassia split, 4 mm", display_name: "Chưa xác định" }),
  "Cassia split, 4 mm",
  "Tên soạn sẵn là chỗ trống thì coi như chưa soạn",
);

/* Tên gốc không bị ghi đè: bộ soạn tên không nhận và không trả lại trường `name`. */
const composerSource = readFileSync(new URL("../lib/public/display-name.ts", import.meta.url), "utf8");
const inputShape = composerSource.slice(
  composerSource.indexOf("export interface DisplayNameInput {"),
  composerSource.indexOf("}", composerSource.indexOf("export interface DisplayNameInput {")),
);
assert.doesNotMatch(inputShape, /^\s+name\??:/m, "Bộ soạn tên không đọc tên gốc");

/* ---------------- 4. Nối vào hệ thống ---------------- */

const catalog = readFileSync(new URL("../lib/public/product-catalog.ts", import.meta.url), "utf8");
assert.match(catalog, /publicProductTitle\(p\)/, "Trang buyer đọc tên soạn sẵn");
assert.match(
  catalog,
  /productBelongsToCategory\(product, candidate, categories\)/,
  "Danh mục vẫn suy từ tên gốc, không suy từ tên soạn sẵn",
);
assert.doesNotMatch(
  catalog,
  /productBelongsToCategory\(\{[^}]*name:\s*publicProductTitle/,
  "Tên soạn sẵn không được tự chứng minh cho danh mục",
);

// Thân hồ sơ dùng chung với Trang của tôi trong cổng NCC.
const supplierPage = readFileSync(new URL("../app/(public)/suppliers/[slug]/page.tsx", import.meta.url), "utf8") +
  readFileSync(new URL("../components/public/supplier-storefront.tsx", import.meta.url), "utf8");
assert.match(supplierPage, /publicProductTitle\(p\)/, "Thẻ sản phẩm trên hồ sơ NCC cũng đọc tên soạn sẵn");
assert.match(
  supplierPage,
  /const productCategory = \(p: typeof s\.main_products\[number\]\) =>\s*\n?\s*categories\.find\(\(c\) => productBelongsToCategory\(p, c, categories\)\)/,
  "Hồ sơ NCC vẫn suy danh mục từ tên gốc",
);

const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
assert.match(types, /display_name\?: string \| null;/, "SupplierProduct có trường tên hiển thị");

const actions = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
assert.match(actions, /display_name: displayNameInput\(raw\.display_name\)/, "Lưu sản phẩm nhận tên hiển thị");
assert.match(actions, /isPlaceholderDisplayName\(text\)/, "Chỗ trống không được lưu thành tên hiển thị");

const migration = new URL("../supabase/migrations/20261030_product_display_name.sql", import.meta.url);
assert.ok(existsSync(migration), "Có migration cho cột display_name");
const sql = readFileSync(migration, "utf8");
assert.match(sql, /add column if not exists display_name text/, "Migration chạy lại được");
assert.doesNotMatch(sql, /drop column|rename column/, "Migration không xoá hay đổi tên cột");
assert.doesNotMatch(sql, /update supplier_products/i, "Migration không sửa sản phẩm đang chạy");

const supabase = readFileSync(new URL("../lib/db/supabase.ts", import.meta.url), "utf8");
assert.match(supabase, /missingDisplayNameColumn/, "Cơ sở dữ liệu cũ vẫn lưu được phần còn lại");
assert.match(supabase, /displayNameMigrationRequired/, "Có tên hiển thị mà thiếu cột thì báo rõ, không bỏ im lặng");

const form = readFileSync(new URL("../components/product-form.tsx", import.meta.url), "utf8");
assert.match(form, /composeDisplayName\(\{/, "Form soạn sẵn tên để nhân viên bấm một nút");
assert.match(form, /Dùng tên này/, "Form có nút dùng tên gợi ý");
assert.match(form, /Người mua sẽ thấy:/, "Form cho xem trước tên người mua đọc");
assert.match(form, /Tên hiển thị ghi/, "Tên hiển thị lệch quy cách thì cảnh báo");

/* ---------------- 5. Quy tắc đặt tên: cảnh báo mềm, không cắt cụt ---------------- */

assert.equal(DISPLAY_NAME_RECOMMENDED_MAX, 90, "Trần khuyến nghị là 90 ký tự");
assert.equal(DISPLAY_NAME_HARD_MAX, 120, "Trần cứng của cột là 120 ký tự");

const clean = (value, options) => displayNameWarnings(value, options).map((item) => item.code);

/* Tên tự nhiên, đúng công thức thì không có cảnh báo nào. */
assert.deepEqual(clean("Hạt điều W320, Bình Phước"), [], "Tên tự nhiên không bị làm phiền");
assert.deepEqual(clean("Cashew kernels W320, Binh Phuoc"), []);
assert.deepEqual(clean("Pepper 550 g/l - Grade A, Dak Lak"), [], "Gạch nối thường vẫn tự nhiên");
assert.deepEqual(clean(""), [], "Tên để trống thì chưa có gì để cảnh báo");

/* Ký tự kiểu AI: gạch dài, nháy cong, ba chấm một ký tự, emoji, gạch chân, thanh dọc. */
for (const value of ["Hạt điều W320 — Bình Phước", "Hạt điều W320, Bình Phước…",
  "Hạt điều “W320”, Bình Phước", "Hạt điều W320 ● Bình Phước",
  "Hạt điều W320, Bình Phước 🥜", "Hạt điều_W320", "Hạt điều | W320"]) {
  assert.ok(clean(value).includes("punctuation"), `Phải cảnh báo ký tự kiểu AI: ${value}`);
}

/* Câu chữ kiểu AI: từ tự khen và giọng trợ lý. */
for (const value of ["Premium Cashew Kernels W320", "High Quality Cashew W320",
  "Top grade Cashew W320", "Cashew W320, best in Vietnam", "Discover our cashew W320",
  "Elevate your snack line with cashew W320", "Your trusted cashew supplier",
  "100% natural cashew W320"]) {
  assert.ok(clean(value).includes("ai-phrasing"), `Phải cảnh báo câu chữ kiểu AI: ${value}`);
}

/* Câu chữ kiểu AI / tự khen bằng tiếng Việt — nhóm chiếm phần lớn tên thật. */
for (const value of ["Hạt điều cao cấp W320", "Cà phê chất lượng cao, Đắk Lắk",
  "Gạo ST25 tốt nhất", "Tiêu đen uy tín, Bình Phước", "Điều W320 siêu phẩm",
  "Hạt điều giá sỉ", "Mật ong hot nhất", "Miễn phí giao hàng toàn quốc"]) {
  assert.ok(clean(value).includes("ai-phrasing"), `Phải cảnh báo tự khen tiếng Việt: ${value}`);
}

/* Tên hàng Việt bình thường không được cảnh báo nhầm. */
for (const value of ["Hạt điều nhân trắng W320, Bình Phước", "Hạt tiêu đen 550 g/l, Đắk Lắk",
  "Quế thanh 4 mm, Yên Bái", "Gạo ST25, Sóc Trăng", "Cà phê Robusta sàng 18, Đắk Nông",
  "Mật ong rừng nguyên chất, Đồng Nai", "Sắn lát khô, Tây Ninh",
  "Mây tre đan xuất khẩu, Ninh Bình", "Cá tra phi lê đông lạnh, An Giang",
  "Hạt điều - Bình Phước"]) {
  assert.deepEqual(clean(value), [], `Không được cảnh báo nhầm tên tự nhiên: ${value}`);
}

/* Dài quá trần khuyến nghị: cảnh báo, nhưng tuyệt đối không cắt. */
const longName = "Hạt điều nhân trắng loại W320 đã qua chế biến xuất khẩu, đóng bao 22.68 kg, Bình Phước, giao hàng tháng 12";
assert.ok(longName.length > DISPLAY_NAME_RECOMMENDED_MAX);
assert.ok(clean(longName).includes("too-long"));
assert.equal(displayNameLooksClean(longName), false, "Tên dài thì cần người xem lại");
assert.equal(displayNameLooksClean("Hạt điều W320, Bình Phước"), true);

/* Đơn vị có dấu "/" là cách viết tự nhiên, không phải danh sách grade. */
assert.deepEqual(clean("Pepper 550 g/l, Dak Lak"), [], "g/l không bị coi là danh sách");
assert.deepEqual(clean("Pepper 550 g/l - Grade A"), []);
assert.deepEqual(clean("Cashew W320/W240"), ["slashes"], "Danh sách grade thì vẫn cảnh báo");

/* Quy tắc chỉ đọc: không hàm nào nhận/trả chuỗi đã sửa. */
const rulesSource = readFileSync(new URL("../lib/public/display-name-rules.ts", import.meta.url), "utf8");
assert.doesNotMatch(rulesSource, /\.slice\(0,|\.substring\(|\.substr\(/, "Quy tắc tên không cắt cụt nội dung người dùng gõ");
assert.doesNotMatch(rulesSource, /return\s+raw\b/, "Quy tắc tên không trả lại chuỗi đã sửa để ghi đè");
assert.match(rulesSource, /export function displayNameWarnings\b/, "Quy tắc nằm trong một hàm dùng chung");
assert.doesNotMatch(rulesSource, /throw new Error/, "Không ném lỗi chặn đăng sản phẩm");

/* Form nhà cung cấp và form CRM cùng đọc một bộ quy tắc. */
const supplierEditor = readFileSync(new URL("../app/supplier/portal/products/product-editor.tsx", import.meta.url), "utf8");
const crmQueue = readFileSync(new URL("../app/crm/products/page.tsx", import.meta.url), "utf8");
assert.match(supplierEditor, /displayNameWarnings\(/, "Form nhà cung cấp hiện cảnh báo tại chỗ");
assert.match(form, /displayNameWarnings\(/, "Form CRM hiện cùng cảnh báo");
assert.match(crmQueue, /displayNameWarnings\(/, "Hàng đợi duyệt CRM gắn nhãn tên cần sửa");

/* Nhãn kiểm tra không dùng từ nội bộ trong chuỗi tiếng Việt. */
for (const [file, source] of [["product-form.tsx", form], ["crm/products/page.tsx", crmQueue]]) {
  assert.doesNotMatch(source, /Buyer sẽ (thấy|đọc)/, `Không dùng "Buyer" trong câu tiếng Việt: ${file}`);
}

console.log("✅ Tên hiển thị: soạn từ dữ kiện có cấu trúc, cảnh báo mềm khi tên không tự nhiên, không cắt cụt và tên gốc giữ nguyên.");
