import { NextResponse } from "next/server";

import { createProductAction } from "@/app/actions";
import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import { fieldsFor, saveProductAttributes } from "@/lib/product-attributes";
import { parseImportWorkbook, rowToProductRaw } from "@/lib/products/excel-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Nhập sản phẩm từ Excel phía nhân viên. Hai chế độ dùng chung một lần đọc file:
 * preview chỉ kiểm tra và báo lỗi theo dòng, commit mới tạo sản phẩm nháp qua
 * đúng luồng tạo sản phẩm thủ công để giữ nguyên gán ngành, đồng bộ hồ sơ và
 * trạng thái chưa sẵn sàng gửi buyer.
 */
export async function POST(request: Request) {
  const gate = await guard("products.manage");
  if (gate) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ ok: false, message: "Không đọc được dữ liệu gửi lên." }, { status: 400 }); }

  const supplierId = String(form.get("supplier_id") ?? "").trim();
  const categorySlug = String(form.get("category") ?? "").trim();
  const mode = String(form.get("mode") ?? "preview") === "commit" ? "commit" : "preview";
  const file = form.get("file");
  if (!supplierId || !categorySlug) {
    return NextResponse.json({ ok: false, message: "Hãy chọn nhà cung cấp và danh mục trước." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, message: "Chưa chọn file Excel." }, { status: 400 });
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ ok: false, message: "Chỉ nhận file .xlsx theo mẫu của hệ thống." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, message: "File vượt quá 10 MB." }, { status: 413 });
  }

  const store = getStore();
  const [supplier, category] = await Promise.all([store.getSupplier(supplierId), store.getCategoryBySlug(categorySlug)]);
  if (!supplier) return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
  if (!category) return NextResponse.json({ ok: false, message: "Không tìm thấy danh mục." }, { status: 404 });

  const parsed = parseImportWorkbook(new Uint8Array(await file.arrayBuffer()), fieldsFor(category));
  if (parsed.fatalError) return NextResponse.json({ ok: false, message: parsed.fatalError }, { status: 400 });

  const validRows = parsed.rows.filter((r) => !r.errors.length);
  const previewRows = parsed.rows.map((r) => ({
    rowNumber: r.rowNumber,
    name: r.name || "(thiếu tên)",
    errors: r.errors,
    warnings: r.warnings,
  }));

  if (mode === "preview") {
    return NextResponse.json({
      ok: true, mode,
      total: parsed.rows.length,
      validCount: validRows.length,
      errorCount: parsed.rows.length - validRows.length,
      rows: previewRows,
    });
  }

  const created: Array<{ rowNumber: number; name: string; id: string }> = [];
  const failed: Array<{ rowNumber: number; name: string; message: string }> = [];
  for (const row of validRows) {
    const result = await createProductAction(rowToProductRaw(row, supplierId, category.slug));
    if (!result.ok || !result.id) {
      failed.push({ rowNumber: row.rowNumber, name: row.name, message: result.message ?? "Không tạo được sản phẩm." });
      continue;
    }
    // Ghim quyết định danh mục theo đúng file mẫu đã chọn, kể cả khi suy đoán
    // từ tên sản phẩm trỏ sang ngành khác, và lưu thuộc tính theo danh mục này.
    const product = await store.getProduct(result.id).catch(() => null);
    if (product && (product.category !== category.slug || product.reviewed_category_slug !== category.slug)) {
      await store.updateProduct(product.id, {
        category: category.slug,
        reviewed_category_slug: category.slug,
        specs: saveProductAttributes(category, row.productAttributes, product.specs ?? {}),
      }).catch(() => null);
    }
    created.push({ rowNumber: row.rowNumber, name: row.name, id: result.id });
  }

  return NextResponse.json({
    ok: true, mode,
    total: parsed.rows.length,
    validCount: validRows.length,
    errorCount: parsed.rows.length - validRows.length,
    rows: previewRows,
    created,
    failed,
    message: `Đã nhập ${created.length} sản phẩm nháp cho ${supplier.display_name || supplier.name}. Sản phẩm chưa sẵn sàng gửi buyer; hãy bổ sung ảnh hoặc catalogue trong từng hồ sơ sản phẩm rồi duyệt như bình thường.`,
  });
}
