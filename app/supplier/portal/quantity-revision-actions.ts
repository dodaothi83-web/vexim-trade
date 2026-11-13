"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { entryCurrencyIssue, validateQuantityPricing } from "@/lib/products/quantity-pricing";
import { validateV2Form, v2StagingEnabled } from "@/lib/products/quantity-v2-validation";
import { getPortalMessages } from "@/lib/i18n/server";
import { notifyStaffPriceRevision } from "@/lib/supplier-portal/notify";

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

function statusMessage(status: string, copy: { dataChanged: string; notOwned: string; pendingFailed: string }): string {
  if (status === "changed" || status === "product_changed") return copy.dataChanged;
  if (status === "not_owned") return copy.notOwned;
  return copy.pendingFailed;
}

/** Save a validated proposed table without touching the buyer's approved snapshot. */
export async function submitQuantityPriceRevisionAction(form: FormData): Promise<Result> {
  // Server action không nhận `copy` từ client nên tự đọc locale đang chọn.
  const { m } = await getPortalMessages();
  const copy = m.quantity;
  try {
    const id = String(form.get("product_id") ?? "");
    const expectedPending = pendingId(form.get("expected_price_revision_id"));
    if (expectedPending === undefined) return { ok: false, message: copy.invalidPriceRevision };
    const ctx = await context(id);
    if (!ctx) return { ok: false, message: copy.noAccess };
    if (!matchesProductVersion(form, ctx.product.updated_at)) return { ok: false, message: statusMessage("product_changed", copy) };
    if (ctx.product.price_publicly_visible && form.get("confirm_quantity_price_consent") !== "yes") {
      return { ok: false, message: copy.consentRequired };
    }
    const version = form.get("quantity_version");
    if (version !== null && version !== "1" && version !== "2") return { ok: false, message: copy.invalidTableVersion };
    let validation: ReturnType<typeof validateQuantityPricing> | ReturnType<typeof validateV2Form>;
    const policy = await readQuantityPricingPolicy(ctx.category.id);
    if (version === "2") {
      if (!v2StagingEnabled()) return { ok: false, message: copy.newUnitUnavailable };
      validation = validateV2Form(form, ctx.product.name, standardGradesForCategory(ctx.category), policy);
    } else {
      const raw = form.get("quantity_tiers_json");
      if (typeof raw !== "string" || raw.length > 12_000) return { ok: false, message: copy.invalidTable };
      let rows: unknown;
      try { rows = JSON.parse(raw); } catch { return { ok: false, message: copy.invalidTable }; }
      if (!Array.isArray(rows) || rows.length > 100 || rows.some((row) => !row || typeof row !== "object" ||
        typeof (row as { minKg?: unknown }).minKg !== "string" || typeof (row as { priceUsdPerKg?: unknown }).priceUsdPerKg !== "string" ||
        (row as { minKg: string }).minKg.length > 32 || (row as { priceUsdPerKg: string }).priceUsdPerKg.length > 32 ||
        ((row as { incoterm?: unknown }).incoterm !== undefined && (typeof (row as { incoterm?: unknown }).incoterm !== "string" ||
          (row as { incoterm: string }).incoterm.length > 20)))) {
        return { ok: false, message: copy.invalidTable };
      }
      const grade = String(form.get("grade") ?? "").trim().slice(0, 180);
      const incoterm = String(form.get("incoterm") ?? "").trim().slice(0, 20);
      const currency = String(form.get("quantity_currency") ?? "").trim().slice(0, 3) || "USD";
      const currencyIssue = entryCurrencyIssue(currency);
      if (currencyIssue) return { ok: false, message: currencyIssue };
const salesUnit = String(form.get("quantity_sales_unit") ?? "").trim().slice(0, 20) || "kg";
      validation = validateQuantityPricing({ grade, incoterm, currency, unit: salesUnit, nameVi: ctx.product.name, nameEn: "", tiers: rows }, standardGradesForCategory(ctx.category), policy);
    }
    if (!validation.value) return { ok: false, message: validation.errors[0]?.message ?? copy.invalidTable };
    const { data, error } = await ctx.db.rpc("submit_quantity_price_revision", {
      p_product_id: id, p_supplier_id: ctx.access.supplier.id, p_expected_pending_id: expectedPending,
      p_expected_product_updated_at: ctx.product.updated_at, p_grade: validation.value.grade,
      p_incoterm: validation.value.incoterm, p_tiers: validation.value.tiers, p_warnings: validation.warnings,
    });
    if (error) throw new Error(error.message);
    const result = interpretRpc(data);
    if (result.status !== "pending" || !result.revisionId) return { ok: false, message: statusMessage(result.status, copy) };
    await ctx.access.store.addAuditLog({ actor_id: ctx.access.user.id, actor_email: ctx.access.user.email, entity: "product", entity_id: id,
      action: "supplier.quantity_price_revision_submitted", before: { pending_revision_id: expectedPending },
      after: { revision_id: result.revisionId, warnings: validation.warnings.map((warning) => warning.code) },
    }).catch((error) => console.error("[quantity-pricing] price submission audit", error));
    // Báo Vexim có giá mới chờ rà soát. Thư lỗi không làm hỏng việc lưu: giá vẫn nằm trong hàng chờ CRM.
    await notifyStaffPriceRevision(ctx.access.supplier, { id, name: ctx.product.name }).catch(() => "failed");
    revalidatePath(`/supplier/portal/products/${id}`);
    revalidatePath(`/supplier/portal/products/${id}/quantity-pricing`);
    revalidatePath(`/crm/products/${id}/edit`);
    revalidatePath("/crm/products/quantity-review");
    return { ok: true, revisionId: result.revisionId, warnings: validation.warnings.map((issue) => issue.message), message: copy.submitted };
  } catch (error) {
    console.error("[quantity-pricing] price submission", error);
    return { ok: false, message: copy.saveFailed };
  }
}

/** Reject cached supplier forms; existing name revisions remain available to staff. */
export async function submitEnglishNameRevisionAction(_form: FormData): Promise<Result> {
  const { m } = await getPortalMessages();
  return { ok: false, message: m.quantity.englishNameBlocked };
}
