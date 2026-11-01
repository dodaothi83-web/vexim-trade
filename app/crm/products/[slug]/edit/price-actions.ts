"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { entryCurrencyIssue, validateQuantityPricing } from "@/lib/products/quantity-pricing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: boolean; message: string };

/**
 * Vexim chốt giá thay nhà cung cấp ngay trên trang duyệt sản phẩm.
 * Bảng giá cũ bị thay thế, bảng mới gắn với thông tin sản phẩm hiện tại nên
 * sản phẩm không còn bị chặn với lý do "thông tin đã đổi sau khi duyệt giá".
 */
export async function adjustQuantityPriceAction(form: FormData): Promise<Result> {
  try {
    const session = await getSession();
    if (!session || !hasPermission(session.role, "products.manage")) return { ok: false, message: "Bạn không có quyền quản lý sản phẩm." };
    const db = getSupabaseClient();
    const actor = db ? await supabaseStore.getUser(session.uid) : null;
    if (!db || !actor?.is_active || actor.role !== session.role ||
        actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase() || !UUID.test(actor.id)) {
      return { ok: false, message: "Không xác nhận được quyền quản lý sản phẩm." };
    }
    const id = String(form.get("product_id") ?? "");
    const expectedUpdatedAt = String(form.get("expected_product_updated_at") ?? "");
    if (!UUID.test(id) || !expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      return { ok: false, message: "Phiên bản giá không hợp lệ." };
    }
    const product = await supabaseStore.getProduct(id);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    if (product.updated_at !== expectedUpdatedAt) return { ok: false, message: "Sản phẩm đã thay đổi. Hãy tải lại trang trước khi nhập giá." };
    // Giá do Vexim nhập thay nhà cung cấp: chỉ khi người duyệt xác nhận nhà cung cấp
    // đã cam kết đúng grade, Incoterm và số lượng, và giá này được chia sẻ cho người mua.
    if (product.price_publicly_visible && form.get("confirm_quantity_price_consent") !== "yes") {
      return { ok: false, message: "Hãy xác nhận nhà cung cấp đã cam kết giá này trước khi áp dụng." };
    }
    const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
    const category = slug ? await supabaseStore.getCategoryBySlug(slug) : null;
    if (!category || category.status !== "published" || !category.is_published) return { ok: false, message: "Danh mục sản phẩm chưa được xuất bản." };
    const raw = form.get("quantity_tiers_json");
    if (typeof raw !== "string" || raw.length > 12_000) return { ok: false, message: "Bảng giá không hợp lệ." };
    let tiers: unknown;
    try { tiers = JSON.parse(raw); } catch { return { ok: false, message: "Bảng giá không hợp lệ." }; }
    if (!Array.isArray(tiers) || tiers.length > 100 || tiers.some((row) => !row || typeof row !== "object" ||
      typeof (row as { minKg?: unknown }).minKg !== "string" || typeof (row as { priceUsdPerKg?: unknown }).priceUsdPerKg !== "string" ||
      (row as { minKg: string }).minKg.length > 32 || (row as { priceUsdPerKg: string }).priceUsdPerKg.length > 32)) {
      return { ok: false, message: "Bảng giá không hợp lệ." };
    }
    const currency = String(form.get("quantity_currency") ?? "").trim().slice(0, 3) || "USD";
    const currencyIssue = entryCurrencyIssue(currency);
    if (currencyIssue) return { ok: false, message: currencyIssue };
    const policy = await readQuantityPricingPolicy(category.id);
    const checked = validateQuantityPricing({
      grade: String(form.get("grade") ?? "").trim().slice(0, 180),
      incoterm: String(form.get("incoterm") ?? "").trim().slice(0, 20),
      currency, nameVi: product.name, nameEn: "", tiers,
    }, standardGradesForCategory(category), policy);
    if (!checked.value) return { ok: false, message: checked.errors[0]?.message ?? "Bảng giá không hợp lệ." };
    const previous = (await db.from("product_quantity_price_revisions")
      .select("id,status,grade,incoterm,tiers,product_context").eq("product_id", id)
      .in("status", ["approved", "pending"])).data ?? [];
    const { data, error } = await db.rpc("staff_set_quantity_price", {
      p_product_id: id, p_actor_id: actor.id, p_grade: checked.value.grade, p_incoterm: checked.value.incoterm,
      p_tiers: checked.value.tiers, p_warnings: checked.warnings,
    });
    if (error) throw new Error(error.message);
    const payload = data as { status?: unknown; revision_id?: unknown } | null;
    if (!payload || payload.status !== "saved" || typeof payload.revision_id !== "string" || !UUID.test(payload.revision_id)) {
      return { ok: false, message: payload?.status === "missing_product" ? "Không tìm thấy sản phẩm." : "Chưa lưu được bảng giá. Hãy thử lại." };
    }
    await supabaseStore.addAuditLog({ actor_id: actor.id, actor_email: actor.email, entity: "product", entity_id: id,
      action: "staff.quantity_price_adjusted",
      before: { revisions: previous.map((row) => ({ id: row.id, status: row.status, grade: row.grade,
        incoterm: row.incoterm, tiers: row.tiers, re_based: !row.product_context })) },
      after: { revision_id: payload.revision_id, status: "approved", grade: checked.value.grade,
        incoterm: checked.value.incoterm, currency: checked.value.currency, tiers: checked.value.tiers,
        warnings: checked.warnings.map((issue) => issue.code),
        supplier_confirmation_attested: product.price_publicly_visible === true },
    }).catch((error) => console.error("[staff-price] audit", error));
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/crm/products/quantity-review");
    revalidatePath("/products", "layout");
    revalidatePath("/");
    return { ok: true, message: "Đã chốt bảng giá Vexim nhập thay nhà cung cấp. Bấm Duyệt và đăng để đưa sản phẩm lên." };
  } catch (error) {
    console.error("[staff-price] adjust", error);
    return { ok: false, message: "Không lưu được bảng giá. Kiểm tra kết nối rồi thử lại." };
  }
}
