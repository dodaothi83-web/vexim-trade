#!/usr/bin/env node
/**
 * Kiểm tra logic nhập sản phẩm từ Excel: sinh mẫu theo danh mục, đọc file,
 * kiểm lỗi theo dòng và chuyển dòng hợp lệ thành dữ liệu sản phẩm nháp.
 * Chạy: node --experimental-strip-types --no-warnings scripts/check-product-excel-import.mjs
 */
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import { buildTemplateWorkbook, parseImportWorkbook, rowToProductRaw, workbookToBuffer } from "../lib/products/excel-import.ts";

const categoryFields = [
  { key: "grade", label: "Grade", type: "select", options: ["W240", "W320", "W450"], filterable: true },
  { key: "origin_note", label: "Ghi chú xuất xứ", type: "text", options: [] },
];

// 1. File mẫu có đủ cột cố định và cột thuộc tính sinh theo danh mục.
const template = buildTemplateWorkbook(categoryFields);
assert.deepEqual(template.SheetNames, ["Sản phẩm", "Hướng dẫn", "Ví dụ"]);
const headers = XLSX.utils.sheet_to_json(template.Sheets["Sản phẩm"], { header: 1 })[0];
assert.ok(headers.includes("Tên sản phẩm"), "thiếu cột tên");
assert.ok(headers.includes("Grade [grade]"), "thiếu cột thuộc tính grade");
assert.ok(headers.includes("Ghi chú xuất xứ [origin_note]"), "thiếu cột thuộc tính text");

// 2. Đọc file điền sẵn: một dòng đúng, ba dòng lỗi khác nhau.
const wb = XLSX.utils.book_new();
const rows = [
  headers,
  ["Hạt điều W320", "Mô tả", "W320", "5 MT", "MT", "30", "Thùng 50lb", "200 MT/tháng", "Có", "Không", "Có", "HACCP", "Cát Lái", "1.250,50", "", "31/12/2026", "w320", "Bình Phước"],
  ["", "Thiếu tên", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["Hạt điều lỗi grade", "", "", "", "", "ba mươi", "", "", "Có lẽ", "", "", "", "", "abc", "", "2026-13-40", "W999", ""],
  ["Hạt điều W320", "Trùng tên dòng 2", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "W240", ""],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sản phẩm");
const parsed = parseImportWorkbook(workbookToBuffer(wb), categoryFields);
assert.equal(parsed.fatalError, null);
assert.equal(parsed.rows.length, 4);

const [ok, noName, bad, dup] = parsed.rows;
assert.deepEqual(ok.errors, []);
assert.equal(ok.productAttributes.grade, "W320"); // viết thường vẫn khớp giá trị chuẩn
assert.ok(noName.errors.some((e) => e.includes("Thiếu tên")));
assert.ok(bad.errors.some((e) => e.includes("Thời gian giao hàng")));
assert.ok(bad.errors.some((e) => e.includes("Giá tham khảo")));
assert.ok(bad.errors.some((e) => e.includes("Hạn giá")));
assert.ok(bad.errors.some((e) => e.includes("OEM")));
assert.ok(bad.errors.some((e) => e.includes("W999")));
assert.ok(dup.warnings.some((w) => w.includes("Trùng tên")));

// 3. Dòng hợp lệ chuyển thành dữ liệu sản phẩm đúng định dạng.
const raw = rowToProductRaw(ok, "sup-1", "cashew");
assert.equal(raw.supplier_id, "sup-1");
assert.equal(raw.category, "cashew");
assert.equal(raw.lead_time_days, 30);
assert.equal(raw.ref_price, 1250.5);
assert.equal(raw.currency, "USD");
assert.equal(raw.price_valid_until, "2026-12-31");
assert.deepEqual(raw.product_attributes, { grade: "W320", origin_note: "Bình Phước" });

// 4. File không đúng mẫu phải báo lỗi chung thay vì nhập bừa.
const junk = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(junk, XLSX.utils.aoa_to_sheet([["Cột lạ"], ["x"]]), "Sheet1");
const badFile = parseImportWorkbook(workbookToBuffer(junk), categoryFields);
assert.ok(badFile.fatalError && badFile.fatalError.includes("Tên sản phẩm"));

console.log("ĐẠT: mẫu theo danh mục, kiểm lỗi theo dòng và chuyển dữ liệu nháp đều đúng.");
