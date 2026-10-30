"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { validateQuantityPricing } from "@/lib/products/quantity-pricing";
import { validateV2Form, v2StagingEnabled } from "@/lib/products/quantity-v2-validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: boolean; message: string };

/** Staff submit a proposal, never overwrite a published price or impersonate the supplier. */
export async function submitStaffQuantityPriceAction(form: FormData): Promise<Result> {
  try {
    const session = await getSession();
    if (!session || !hasPermission(session.role, "products.manage")) return { ok: false, message: "Bạn không có quyền quản lý sản phẩm." };
    const db = getSupabaseClient();
    const actor = db ? await supabaseStore.getUser(session.uid) : null;
    if (!db || !actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase() || !UUID.test(actor.id)) {
      return { ok: false, message: "Không xác nhận được quyền quản lý sản phẩm." };
    }
    const id = String(form.get("product_id") ?? "");
    const pendingRaw = form.get("expected_price_revision_id");
    const pending = pendingRaw === null || pendingRaw === "" ? null : typeof pendingRaw === "string" && UUID.test(pendingRaw) ? pendingRaw : undefined;
    if (!UUID.test(id) || pending === undefined) return { ok: false, message: "Phiên bản giá không hợp lệ." };
    const product = await supabaseStore.getProduct(id);
    if (!product || !["draft", "approved", "changes_requested", "paused"].includes(product.supplier_review_status ?? "approved")) {
      return { ok: false, message: "Sản phẩm không ở trạng thái cho phép gửi bảng giá." };
    }
    if (!product.updated_at || form.get("expected_product_updated_at") !== product.updated_at) return { ok: false, message: "Sản phẩm đã thay đổi. Hãy tải lại trang." };
    if (product.price_publicly_visible && form.get("confirm_quantity_price_consent") !== "yes") {
      return { ok: false, message: "Hãy xác nhận đã nhận cam kết giá của NCC trước khi gửi." };
    }
    const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
    const category = slug ? await supabaseStore.getCategoryBySlug(slug) : null;
    if (!category || category.status !== "published" || !category.is_published) return { ok: false, message: "Danh mục sản phẩm chưa được xuất bản." };
    const version = form.get("quantity_version");
    if (version !== null && version !== "1" && version !== "2") return { ok: false, message: "Phiên bản bảng giá không hợp lệ." };
    let checked: ReturnType<typeof validateQuantityPricing> | ReturnType<typeof validateV2Form>;
    const policy = await readQuantityPricingPolicy(category.id);
    if (version === "2") {
      if (!v2StagingEnabled()) return { ok: false, message: "Đơn vị mới chưa sẵn sàng để sử dụng." };
      checked = validateV2Form(form, product.name, standardGradesForCategory(category), policy);
    } else {
      const raw = form.get("quantity_tiers_json");
      if (typeof raw !== "string" || raw.length > 12_000) return { ok: false, message: "Bảng giá không hợp lệ." };
      let tiers: unknown;
      try { tiers = JSON.parse(raw); } catch { return { ok: false, message: "Bảng giá không hợp lệ." }; }
      if (!Array.isArray(tiers) || tiers.length > 100 || tiers.some((row) => !row || typeof row !== "object" ||
        typeof (row as { minKg?: unknown }).minKg !== "string" || typeof (row as { priceUsdPerKg?: unknown }).priceUsdPerKg !== "string" ||
        (row as { minKg: string }).minKg.length > 32 || (row as { priceUsdPerKg: string }).priceUsdPerKg.length > 32)) {
        return { ok: false, message: "Bảng giá không hợp lệ." };
      }
      checked = validateQuantityPricing({ grade: String(form.get("grade") ?? "").trim().slice(0, 180),
        incoterm: String(form.get("incoterm") ?? "").trim().slice(0, 20),
        currency: String(form.get("quantity_currency") ?? "").trim().slice(0, 3) || "USD", nameVi: product.name,
        nameEn: "", tiers }, standardGradesForCategory(category), policy);
    }
    if (!checked.value) return { ok: false, message: checked.errors[0]?.message ?? "Bảng giá không hợp lệ." };
    const { data, error } = await db.rpc("submit_quantity_price_revision", {
      p_product_id: id, p_supplier_id: product.supplier_id, p_expected_pending_id: pending,
      p_expected_product_updated_at: product.updated_at, p_grade: checked.value.grade, p_incoterm: checked.value.incoterm,
      p_tiers: checked.value.tiers, p_warnings: checked.warnings,
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object" || data.status !== "pending" || typeof data.revision_id !== "string" || !UUID.test(data.revision_id)) {
      return { ok: false, message: "Phiên bản giá hoặc sản phẩm đã thay đổi. Hãy tải lại trang." };
    }
    await supabaseStore.addAuditLog({ actor_id: actor.id, actor_email: actor.email, entity: "product", entity_id: id,
      action: "staff.quantity_price_revision_submitted", before: { pending_revision_id: pending },
      after: { revision_id: data.revision_id, warnings: checked.warnings.map((issue) => issue.code), supplier_confirmation_attested: product.price_publicly_visible === true },
    }).catch((error) => console.error("[quantity-pricing] staff submission audit", error));
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath("/crm/products/quantity-review");
    return { ok: true, message: "Đã gửi bảng giá vào hàng chờ Vexim xác nhận. Giá buyer hiện tại chưa thay đổi." };
  } catch (error) {
    console.error("[quantity-pricing] staff submission", error);
    return { ok: false, message: "Không lưu được bảng giá. Kiểm tra kết nối và cấu hình trước khi thử lại." };
  }
}
