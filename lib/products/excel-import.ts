import * as XLSX from "xlsx";

import type { ProductAttributeField } from "../types";

/**
 * Nhập sản phẩm hàng loạt từ Excel phía nhân viên Vexim.
 *
 * Nguyên tắc: một khung cột cố định dùng chung, cộng thêm cột thuộc tính sinh
 * theo từng danh mục từ cấu hình của danh mục đó. File của nhà cung cấp không
 * đúng mẫu sẽ bị báo lỗi theo từng dòng để sửa lại, không nhập thẳng.
 */

export const MAX_IMPORT_ROWS = 200;

export interface FixedColumn {
  key: string;
  header: string;
  hint: string;
}

export const FIXED_COLUMNS: FixedColumn[] = [
  { key: "name", header: "Tên sản phẩm", hint: "Bắt buộc. Tối đa 250 ký tự." },
  { key: "description", header: "Mô tả", hint: "Tối đa 1500 ký tự." },
  { key: "spec", header: "Quy cách", hint: "Ví dụ: 25kg/bao, độ ẩm tối đa 14%." },
  { key: "moq", header: "MOQ", hint: "Ví dụ: 5 MT hoặc 1 cont 20ft." },
  { key: "unit", header: "Đơn vị tính", hint: "Ví dụ: MT, kg, thùng." },
  { key: "lead_time_days", header: "Thời gian giao hàng (ngày)", hint: "Chỉ nhập số ngày, ví dụ 30." },
  { key: "packaging", header: "Đóng gói", hint: "Ví dụ: Bao PP 25kg, hút chân không." },
  { key: "monthly_capacity", header: "Công suất mỗi tháng", hint: "Ví dụ: 500 MT/tháng." },
  { key: "oem", header: "Nhận OEM (Có/Không)", hint: "Điền Có hoặc Không." },
  { key: "odm", header: "Nhận ODM (Có/Không)", hint: "Điền Có hoặc Không." },
  { key: "samples", header: "Có mẫu thử (Có/Không)", hint: "Điền Có hoặc Không." },
  { key: "certifications", header: "Chứng nhận (tự khai)", hint: "Chỉ là thông tin tự khai, Vexim kiểm chứng riêng trước khi hiển thị chứng nhận." },
  { key: "export_port", header: "Cảng xuất", hint: "Ví dụ: Cát Lái." },
  { key: "ref_price", header: "Giá tham khảo", hint: "Chỉ nhập số, ví dụ 1250. Giá luôn ẩn mặc định, chỉ hiện khi có đồng ý riêng." },
  { key: "currency", header: "Tiền tệ", hint: "Ví dụ USD. Để trống sẽ hiểu là USD khi có giá." },
  { key: "price_valid_until", header: "Hạn giá (ngày/tháng/năm)", hint: "Ví dụ 31/12/2026." },
];

export interface ImportRow {
  rowNumber: number;
  name: string;
  values: Record<string, string>;
  productAttributes: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface ImportParseResult {
  rows: ImportRow[];
  fatalError: string | null;
}

function attributeHeader(label: string, key: string): string {
  return `${label} [${key}]`;
}

/** Sinh file mẫu Excel cho một danh mục: trang dữ liệu, trang hướng dẫn, trang ví dụ. */
export function buildTemplateWorkbook(fields: ProductAttributeField[]): XLSX.WorkBook {
  const headers = [...FIXED_COLUMNS.map((c) => c.header), ...fields.map((f) => attributeHeader(f.label, f.key))];
  const wb = XLSX.utils.book_new();

  const dataSheet = XLSX.utils.aoa_to_sheet([headers]);
  dataSheet["!cols"] = headers.map((h) => ({ wch: Math.min(42, Math.max(16, h.length + 4)) }));
  XLSX.utils.book_append_sheet(wb, dataSheet, "Sản phẩm");

  const guide: string[][] = [
    ["HƯỚNG DẪN ĐIỀN FILE SẢN PHẨM"],
    [""],
    ["1. Điền mỗi sản phẩm một dòng tại trang \"Sản phẩm\", bắt đầu từ dòng 2. Tối đa 200 sản phẩm mỗi file."],
    ["2. Không đổi tên cột, không gộp ô, không thêm dòng trống ở giữa danh sách."],
    ["3. Sản phẩm nhập từ file sẽ ở trạng thái nháp chờ Vexim duyệt. Ảnh sản phẩm bổ sung sau trong hồ sơ sản phẩm."],
    ["4. Giá tham khảo luôn ẩn mặc định trên website, chỉ hiển thị khi nhà cung cấp đồng ý riêng bằng văn bản."],
    [""],
    ["CỘT", "GIẢI THÍCH"],
    ...FIXED_COLUMNS.map((c) => [c.header, c.hint] as [string, string]),
    ...fields.map((f) => [
      attributeHeader(f.label, f.key),
      f.type === "select" ? `Chỉ chọn một trong các giá trị: ${f.options.join(", ")}` : "Điền chữ tự do, tối đa 200 ký tự.",
    ] as [string, string]),
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guide);
  guideSheet["!cols"] = [{ wch: 42 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, guideSheet, "Hướng dẫn");

  const exampleValues: Record<string, string> = {
    name: "VÍ DỤ: Hạt điều nhân trắng W320",
    description: "Hạt điều nhân trắng loại W320, sấy khô, đóng bao hút chân không.",
    spec: "W320, độ ẩm tối đa 5%",
    moq: "5 MT",
    unit: "MT",
    lead_time_days: "30",
    packaging: "Thùng carton 50lb, hút chân không",
    monthly_capacity: "200 MT/tháng",
    oem: "Có",
    odm: "Không",
    samples: "Có",
    certifications: "HACCP, ISO 22000",
    export_port: "Cát Lái",
    ref_price: "1250",
    currency: "USD",
    price_valid_until: "31/12/2026",
  };
  const exampleRow = [
    ...FIXED_COLUMNS.map((c) => exampleValues[c.key] ?? ""),
    ...fields.map((f) => (f.type === "select" ? f.options[0] ?? "" : "Giá trị mẫu")),
  ];
  const exampleSheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  exampleSheet["!cols"] = dataSheet["!cols"];
  XLSX.utils.book_append_sheet(wb, exampleSheet, "Ví dụ");

  return wb;
}

export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).trim();
}

function parseBool(text: string): boolean | null {
  const v = text.trim().toLowerCase();
  if (!v) return false;
  if (["có", "co", "yes", "y", "true", "1", "x"].includes(v)) return true;
  if (["không", "khong", "no", "n", "false", "0"].includes(v)) return false;
  return null;
}

function parsePrice(text: string): number | null | "invalid" {
  if (!text.trim()) return null;
  const cleaned = text.replace(/[^\d.,]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return "invalid";
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Cả hai dấu cùng xuất hiện: dấu đứng sau là dấu thập phân.
    normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(cleaned) ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

function parseDate(text: string): string | null | "invalid" {
  const v = text.trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? v : "invalid";
  }
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const day = Number(d), month = Number(mo), year = Number(y);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return "invalid";
}

/** Đọc và kiểm tra file Excel theo mẫu của danh mục. Không ghi dữ liệu ở bước này. */
export function parseImportWorkbook(data: ArrayBuffer | Buffer | Uint8Array, fields: ProductAttributeField[]): ImportParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: "buffer", cellDates: true });
  } catch {
    return { rows: [], fatalError: "Không đọc được file. Hãy dùng file mẫu .xlsx do hệ thống cung cấp." };
  }
  const sheetName = wb.SheetNames.includes("Sản phẩm") ? "Sản phẩm" : wb.SheetNames[0];
  if (!sheetName) return { rows: [], fatalError: "File không có trang dữ liệu nào." };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: "", raw: true });
  if (!aoa.length) return { rows: [], fatalError: "Trang dữ liệu trống." };

  const headers = (aoa[0] as unknown[]).map((h) => cellText(h));
  const fixedIndex = new Map<string, number>();
  for (const col of FIXED_COLUMNS) {
    const idx = headers.findIndex((h) => h.toLowerCase() === col.header.toLowerCase());
    if (idx >= 0) fixedIndex.set(col.key, idx);
  }
  if (!fixedIndex.has("name")) {
    return { rows: [], fatalError: "Không tìm thấy cột \"Tên sản phẩm\". Hãy tải lại file mẫu của danh mục này và không đổi tên cột." };
  }
  const attributeIndex = new Map<string, number>();
  for (const f of fields) {
    const idx = headers.findIndex((h) => h.includes(`[${f.key}]`) || h.toLowerCase() === f.label.toLowerCase());
    if (idx >= 0) attributeIndex.set(f.key, idx);
  }

  const get = (cells: unknown[], idx: number | undefined) => (idx === undefined ? "" : cellText(cells[idx]));
  const rows: ImportRow[] = [];
  const seenNames = new Map<string, number>();

  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i] as unknown[];
    const values: Record<string, string> = {};
    for (const col of FIXED_COLUMNS) values[col.key] = get(cells, fixedIndex.get(col.key));
    if (Object.values(values).every((v) => !v)) continue;

    const rowNumber = i + 1;
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = values.name;
    if (!name) errors.push("Thiếu tên sản phẩm.");
    else if (name.length > 250) errors.push("Tên sản phẩm vượt quá 250 ký tự.");
    else {
      const key = name.toLowerCase();
      if (seenNames.has(key)) warnings.push(`Trùng tên với dòng ${seenNames.get(key)} trong cùng file.`);
      else seenNames.set(key, rowNumber);
    }
    if (values.description.length > 1500) errors.push("Mô tả vượt quá 1500 ký tự.");
    if (values.spec.length > 1000) errors.push("Quy cách vượt quá 1000 ký tự.");
    if (values.moq.length > 120) errors.push("MOQ vượt quá 120 ký tự.");
    if (values.unit.length > 50) errors.push("Đơn vị tính vượt quá 50 ký tự.");
    if (values.lead_time_days) {
      const digits = values.lead_time_days.replace(/[^\d]/g, "");
      const n = Number(digits);
      if (!digits || !Number.isInteger(n) || n < 1 || n > 3650) errors.push("Thời gian giao hàng phải là số ngày từ 1 đến 3650.");
    }
    for (const key of ["oem", "odm", "samples"] as const) {
      if (parseBool(values[key]) === null) errors.push(`Cột ${key === "oem" ? "OEM" : key === "odm" ? "ODM" : "mẫu thử"} chỉ điền Có hoặc Không.`);
    }
    const price = parsePrice(values.ref_price);
    if (price === "invalid") errors.push("Giá tham khảo phải là số không âm.");
    const validUntil = parseDate(values.price_valid_until);
    if (validUntil === "invalid") errors.push("Hạn giá phải theo dạng ngày/tháng/năm.");

    const productAttributes: Record<string, string> = {};
    for (const f of fields) {
      const raw = get(cells, attributeIndex.get(f.key));
      if (!raw) continue;
      if (raw.length > 200) { errors.push(`Thuộc tính ${f.label} vượt quá 200 ký tự.`); continue; }
      if (f.type === "select") {
        const canonical = f.options.find((o) => o.toLowerCase() === raw.toLowerCase());
        if (!canonical) { errors.push(`${f.label}: giá trị "${raw}" không nằm trong danh sách cho phép (${f.options.join(", ")}).`); continue; }
        productAttributes[f.key] = canonical;
      } else {
        productAttributes[f.key] = raw;
      }
    }

    rows.push({ rowNumber, name, values, productAttributes, errors, warnings });
    if (rows.length > MAX_IMPORT_ROWS) {
      return { rows: rows.slice(0, MAX_IMPORT_ROWS), fatalError: `File vượt quá ${MAX_IMPORT_ROWS} sản phẩm. Hãy tách thành nhiều file nhỏ hơn.` };
    }
  }

  if (!rows.length) return { rows: [], fatalError: "Không có dòng sản phẩm nào trong file." };
  return { rows, fatalError: null };
}

/** Chuyển một dòng đã kiểm tra thành dữ liệu tạo sản phẩm. Dòng có lỗi không được gọi hàm này. */
export function rowToProductRaw(row: ImportRow, supplierId: string, categorySlug: string): Record<string, unknown> {
  const v = row.values;
  const price = parsePrice(v.ref_price);
  const validUntil = parseDate(v.price_valid_until);
  return {
    supplier_id: supplierId,
    category: categorySlug,
    name: row.name,
    description: v.description || null,
    spec: v.spec || null,
    moq: v.moq || null,
    unit: v.unit || null,
    lead_time_days: v.lead_time_days ? Number(v.lead_time_days.replace(/[^\d]/g, "")) : null,
    packaging: v.packaging || null,
    monthly_capacity: v.monthly_capacity || null,
    oem: parseBool(v.oem) === true,
    odm: parseBool(v.odm) === true,
    samples: parseBool(v.samples) === true,
    certifications: v.certifications || null,
    export_port: v.export_port || null,
    ref_price: price === "invalid" ? null : price,
    currency: v.currency || (price !== null && price !== "invalid" ? "USD" : null),
    price_valid_until: validUntil === "invalid" ? null : validUntil,
    product_attributes: row.productAttributes,
  };
}
