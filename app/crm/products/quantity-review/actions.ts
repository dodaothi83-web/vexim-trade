"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { nameContainsGrade, validateQuantityPricing } from "@/lib/products/quantity-pricing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type QuantityReviewResult = { ok: boolean; message: string };

/** Staff decisions on price and English name are separate. No legacy public field is mutated. */
export async function decideQuantityRevisionAction(form: FormData): Promise<QuantityReviewResult> {
  try {
    const session = await getSession();
    if (!session || !["admin", "reviewer"].includes(session.role)) return { ok: false, message: "Chỉ quản trị hoặc trưởng kiểm duyệt được xét duyệt." };
    const db = getSupabaseClient();
    if (!db) return { ok: false, message: "Không kết nối được cơ sở dữ liệu." };
    // Never use local fallback to authorize a service-role write.
    const actor = await supabaseStore.getUser(session.uid);
    if (!actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase() || !UUID.test(actor.id)) {
      return { ok: false, message: "Không xác nhận được quyền xét duyệt." };
    }
    const productId = String(form.get("product_id") ?? "");
    const revisionId = String(form.get("revision_id") ?? "");
    const expectedUpdatedAt = String(form.get("product_updated_at") ?? "");
    const kind = String(form.get("kind") ?? "");
    const decision = String(form.get("decision") ?? "");
    const note = String(form.get("note") ?? "").trim();
    if (!UUID.test(productId) || !UUID.test(revisionId) || !["price", "name"].includes(kind) || !["approve", "reject"].includes(decision) ||
        !expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt)) || note.length > 1000 || (decision === "reject" && !note)) {
      return { ok: false, message: "Yêu cầu không hợp lệ; khi từ chối cần ghi lý do." };
    }
    const product = await supabaseStore.getProduct(productId);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    const table = kind === "price" ? "product_quantity_price_revisions" : "product_english_name_revisions";
    const { data: revision, error: readError } = await db.from(table).select("*")
      .eq("id", revisionId).eq("product_id", productId).eq("status", "pending").maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!revision) return { ok: false, message: "Bản chờ duyệt đã thay đổi. Hãy tải lại trang." };
    if (decision === "approve") {
      if (product.updated_at !== expectedUpdatedAt || revision.product_updated_at !== product.updated_at) {
        return { ok: false, message: "Thông tin sản phẩm đã đổi sau khi gửi. NCC cần gửi lại trước khi duyệt." };
      }
      const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
      const category = slug ? await supabaseStore.getCategoryBySlug(slug) : null;
      if (!category || category.status !== "published" || !category.is_published) return { ok: false, message: "Danh mục không còn được công khai." };
      const grades = standardGradesForCategory(category);
      if (kind === "name") {
        if (revision.source_name !== product.name || typeof revision.english_name !== "string" || !revision.english_name.trim() ||
            nameContainsGrade(product.name, grades) || nameContainsGrade(revision.english_name, grades)) {
          return { ok: false, message: "Tên đã đổi, chưa có bản tiếng Anh hoặc chứa grade. NCC cần sửa và gửi lại." };
        }
      } else {
        if (!Array.isArray(revision.tiers) || revision.tiers.length > 100 || revision.tiers.some((row: unknown) =>
          !row || typeof row !== "object" || typeof (row as { minKg?: unknown }).minKg !== "number" || typeof (row as { priceUsdPerKg?: unknown }).priceUsdPerKg !== "number")) {
          return { ok: false, message: "Dữ liệu bảng giá không hợp lệ." };
        }
        const policy = await readQuantityPricingPolicy(category.id);
        const checked = validateQuantityPricing({ grade: String(revision.grade ?? ""), incoterm: String(revision.incoterm ?? ""),
          nameVi: product.name, nameEn: "", tiers: revision.tiers.map((row: { minKg: number; priceUsdPerKg: number }) => ({ minKg: String(row.minKg), priceUsdPerKg: String(row.priceUsdPerKg) })) }, grades, policy);
        if (!checked.value) return { ok: false, message: `Không thể duyệt: ${checked.errors[0]?.message ?? "bảng giá không hợp lệ."}` };
        // Bounds are warnings: reviewer can approve an outlier deliberately.
      }
    }
    const { data, error } = await db.rpc(kind === "price" ? "decide_quantity_price_revision" : "decide_product_english_name_revision", {
      p_product_id: productId, p_revision_id: revisionId, p_actor_id: actor.id,
      p_approve: decision === "approve", p_expected_product_updated_at: expectedUpdatedAt,
    });
    if (error) throw new Error(error.message);
    if (data !== (decision === "approve" ? "approved" : "rejected")) {
      return { ok: false, message: data === "product_changed" ? "Sản phẩm đã đổi; NCC cần gửi lại trước khi duyệt." : "Bản chờ duyệt đã thay đổi. Hãy tải lại trang." };
    }
    await supabaseStore.addAuditLog({ actor_id: actor.id, actor_email: actor.email, entity: "product", entity_id: productId,
      action: `quantity_pricing.${kind}_${decision}`, before: { revision_id: revisionId, status: "pending" },
      after: { revision_id: revisionId, status: data, note: note || null },
    }).catch((error) => console.error("[quantity-review] audit", error));
    revalidatePath("/crm/products/quantity-review");
    revalidatePath(`/crm/products/${productId}/edit`);
    revalidatePath(`/supplier/portal/products/${productId}`);
    return { ok: true, message: decision === "approve" ? "Đã duyệt phiên bản. Hiển thị buyer cho mô hình mới chưa được bật." : "Đã từ chối phiên bản; bản đã duyệt trước đó không thay đổi." };
  } catch (error) {
    console.error("[quantity-review] decision", error);
    return { ok: false, message: "Không lưu được quyết định. Kiểm tra kết nối và migration 20261056." };
  }
}
