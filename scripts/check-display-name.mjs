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
  /productBelongsToCategory\(p, category, knownCategories\)/,
  "Danh mục vẫn suy từ tên gốc, không suy từ tên soạn sẵn",
);
assert.doesNotMatch(
  catalog,
  /productBelongsToCategory\(\{[^}]*name:\s*publicProductTitle/,
  "Tên soạn sẵn không được tự chứng minh cho danh mục",
);

const supplierPage = readFileSync(new URL("../app/(public)/suppliers/[slug]/page.tsx", import.meta.url), "utf8");
assert.match(supplierPage, /name=\{safe\(publicProductTitle\(p\)\)\}/, "Thẻ sản phẩm trên hồ sơ NCC cũng đọc tên soạn sẵn");
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
assert.match(form, /Buyer sẽ thấy:/, "Form cho xem trước tên buyer đọc");
assert.match(form, /Tên hiển thị ghi/, "Tên hiển thị lệch quy cách thì cảnh báo");

console.log("✅ Tên hiển thị cho buyer: soạn từ dữ kiện có cấu trúc, tên gốc giữ nguyên và danh mục vẫn suy từ tên gốc.");
