"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { nameContainsGrade, validateQuantityPricing } from "@/lib/products/quantity-pricing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: boolean; message: string; revisionId?: string; warnings?: string[] };

async function context(id: string) {
  if (!UUID.test(id)) return null;
  // This workflow stores private revisions in Supabase: never authenticate
  // against the local fallback while writing live revisions.
  const access = await supplierPortalAccess(supabaseStore);
  const db = getSupabaseClient();
  if (!access || !db || !portalApproved(access.supplier)) return null;
  const product = await supabaseStore.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id ||
      !["draft", "approved", "changes_requested", "paused"].includes(product.supplier_review_status ?? "approved")) return null;
  const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
  const category = slug ? await supabaseStore.getCategoryBySlug(slug) : null;
  if (!category || category.status !== "published" || !category.is_published || !product.updated_at) return null;
  return { access, db, product, category };
}

function matchesProductVersion(form: FormData, updatedAt: string): boolean {
  const expected = form.get("expected_product_updated_at");
  return typeof expected === "string" && expected === updatedAt;
}

function pendingId(value: FormDataEntryValue | null): string | null | undefined {
  if (value === null || value === "") return null;
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

function interpretRpc(data: unknown): { status: string; revisionId?: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { status: "invalid" };
  const row = data as Record<string, unknown>;
  return { status: typeof row.status === "string" ? row.status : "invalid", revisionId: typeof row.revision_id === "string" && UUID.test(row.revision_id) ? row.revision_id : undefined };
}

function statusMessage(status: string): string {
  if (status === "changed" || status === "product_changed") return "Dữ liệu đã thay đổi ở phiên khác. Hãy tải lại trước khi lưu.";
  if (status === "not_owned") return "Sản phẩm không thuộc tài khoản của bạn.";
  return "Không lưu được bản chờ duyệt. Vui lòng thử lại.";
}

/** Save a validated proposed table without touching the buyer's approved snapshot. */
export async function submitQuantityPriceRevisionAction(form: FormData): Promise<Result> {
  try {
    const id = String(form.get("product_id") ?? "");
    const expectedPending = pendingId(form.get("expected_price_revision_id"));
    if (expectedPending === undefined) return { ok: false, message: "Phiên bản giá không hợp lệ." };
    const ctx = await context(id);
    if (!ctx) return { ok: false, message: "Không thể quản lý sản phẩm hoặc danh mục này." };
    if (!matchesProductVersion(form, ctx.product.updated_at)) return { ok: false, message: statusMessage("product_changed") };
    if (ctx.product.price_publicly_visible && form.get("confirm_quantity_price_consent") !== "yes") {
      return { ok: false, message: "Hãy xác nhận cam kết giá trước khi công khai." };
    }
    const raw = form.get("quantity_tiers_json");
    if (typeof raw !== "string" || raw.length > 12_000) return { ok: false, message: "Bảng giá không hợp lệ." };
    let rows: unknown;
    try { rows = JSON.parse(raw); } catch { return { ok: false, message: "Bảng giá không hợp lệ." }; }
    if (!Array.isArray(rows) || rows.length > 100 || rows.some((row) => !row || typeof row !== "object" ||
      typeof row.minKg !== "string" || typeof row.priceUsdPerKg !== "string" || row.minKg.length > 32 || row.priceUsdPerKg.length > 32)) {
      return { ok: false, message: "Bảng giá không hợp lệ." };
    }
    const grade = String(form.get("grade") ?? "").trim().slice(0, 180);
    const incoterm = String(form.get("incoterm") ?? "").trim().slice(0, 20);
    const nameEn = String(form.get("name_en") ?? "").trim().slice(0, 180);
    const policy = await readQuantityPricingPolicy(ctx.category.id);
    const validation = validateQuantityPricing({ grade, incoterm, nameVi: ctx.product.name, nameEn, tiers: rows }, standardGradesForCategory(ctx.category), policy);
    if (!validation.value) return { ok: false, message: validation.errors[0]?.message ?? "Bảng giá không hợp lệ." };
    const { data, error } = await ctx.db.rpc("submit_quantity_price_revision", {
      p_product_id: id, p_supplier_id: ctx.access.supplier.id, p_expected_pending_id: expectedPending,
      p_expected_product_updated_at: ctx.product.updated_at, p_grade: validation.value.grade,
      p_incoterm: validation.value.incoterm, p_tiers: validation.value.tiers, p_warnings: validation.warnings,
    });
    if (error) throw new Error(error.message);
    const result = interpretRpc(data);
    if (result.status !== "pending" || !result.revisionId) return { ok: false, message: statusMessage(result.status) };
    await ctx.access.store.addAuditLog({ actor_id: ctx.access.user.id, actor_email: ctx.access.user.email, entity: "product", entity_id: id,
      action: "supplier.quantity_price_revision_submitted", before: { pending_revision_id: expectedPending },
      after: { revision_id: result.revisionId, warnings: validation.warnings.map((warning) => warning.code) },
    }).catch((error) => console.error("[quantity-pricing] price submission audit", error));
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return { ok: true, revisionId: result.revisionId, warnings: validation.warnings.map((issue) => issue.message), message: "Giá mới đang chờ Vexim xác nhận." };
  } catch (error) {
    console.error("[quantity-pricing] price submission", error);
    return { ok: false, message: "Không lưu được giá. Kiểm tra kết nối và cấu hình giá trước khi thử lại." };
  }
}

/** English names have their own pending revision and never overwrite the live title. */
export async function submitEnglishNameRevisionAction(form: FormData): Promise<Result> {
  try {
    const id = String(form.get("product_id") ?? "");
    const expectedPending = pendingId(form.get("expected_name_revision_id"));
    if (expectedPending === undefined) return { ok: false, message: "Phiên bản tên không hợp lệ." };
    const ctx = await context(id);
    if (!ctx) return { ok: false, message: "Không thể quản lý sản phẩm hoặc danh mục này." };
    if (!matchesProductVersion(form, ctx.product.updated_at)) return { ok: false, message: statusMessage("product_changed") };
    const english = String(form.get("name_en") ?? "").trim();
    if (!english || english.length > 180) return { ok: false, message: "Nhập tên tiếng Anh không quá 180 ký tự." };
    const grades = standardGradesForCategory(ctx.category);
    if (nameContainsGrade(ctx.product.name, grades) || nameContainsGrade(english, grades)) return { ok: false, message: "Không ghi grade trong tên sản phẩm tiếng Việt hoặc tiếng Anh." };
    const { data, error } = await ctx.db.rpc("submit_product_english_name_revision", {
      p_product_id: id, p_supplier_id: ctx.access.supplier.id, p_expected_pending_id: expectedPending,
      p_expected_product_updated_at: ctx.product.updated_at, p_source_name: ctx.product.name,
      p_english_name: english, p_origin: "supplier",
    });
    if (error) throw new Error(error.message);
    const result = interpretRpc(data);
    if (result.status !== "pending" || !result.revisionId) return { ok: false, message: statusMessage(result.status) };
    await ctx.access.store.addAuditLog({ actor_id: ctx.access.user.id, actor_email: ctx.access.user.email, entity: "product", entity_id: id,
      action: "supplier.english_name_revision_submitted", before: { pending_revision_id: expectedPending }, after: { revision_id: result.revisionId },
    }).catch((error) => console.error("[quantity-pricing] name submission audit", error));
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/crm/products/${id}/edit`);
    return { ok: true, revisionId: result.revisionId, message: "Tên tiếng Anh mới đang chờ duyệt." };
  } catch (error) {
    console.error("[quantity-pricing] English name submission", error);
    return { ok: false, message: "Không lưu được tên tiếng Anh. Vui lòng thử lại." };
  }
}
