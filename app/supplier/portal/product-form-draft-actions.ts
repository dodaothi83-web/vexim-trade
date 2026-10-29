"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { parseProductFormDraft, type ProductFormDraft } from "@/lib/products/product-form-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: false; message: string } | { ok: true; id: string; revision: number; draft?: ProductFormDraft | null };

/** Always authorize using the same Supabase store that owns the private draft. */
async function context() {
  const db = getSupabaseClient();
  if (!db) return null;
  const access = await supplierPortalAccess(supabaseStore);
  if (!access || !portalApproved(access.supplier)) return null;
  return { db, access };
}

function rpcResult(data: unknown): Result {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, message: "Không lưu được bản nháp. Vui lòng thử lại." };
  const row = data as Record<string, unknown>;
  if (row.status === "changed" || row.status === "state_changed") return { ok: false, message: "Bản nháp hoặc trạng thái sản phẩm đã thay đổi. Hãy tải lại trang." };
  if (row.status === "request_conflict") return { ok: false, message: "Phiên tạo sản phẩm không còn hợp lệ. Hãy tải lại trang." };
  if (row.status !== "saved" || typeof row.product_id !== "string" || !UUID.test(row.product_id) ||
      typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 1)
    return { ok: false, message: "Không lưu được bản nháp. Vui lòng thử lại." };
  return { ok: true, id: row.product_id, revision: row.revision };
}

/** Create a private product shell and draft together; retrying the same request is idempotent. */
export async function createProductFormDraftAction(requestId: string, input: unknown): Promise<Result> {
  const parsed = parseProductFormDraft(input);
  if (!UUID.test(requestId) || !parsed) return { ok: false, message: "Dữ liệu bản nháp không hợp lệ." };
  try {
    const ctx = await context();
    if (!ctx) return { ok: false, message: "Không xác nhận được quyền quản lý sản phẩm." };
    const { data, error } = await ctx.db.rpc("create_product_form_draft", {
      p_supplier_id: ctx.access.supplier.id, p_request_id: requestId, p_payload: parsed,
    });
    if (error) throw new Error(error.message);
    const result = rpcResult(data);
    if (result.ok) revalidatePath("/supplier/portal/products");
    return result;
  } catch (error) {
    console.error("[product-form-draft] create", error);
    return { ok: false, message: "Không lưu được bản nháp. Vui lòng thử lại." };
  }
}

/** Save without changing approved buyer-visible data. A stale editor cannot overwrite newer work. */
export async function saveProductFormDraftAction(productId: string, expectedRevision: number, input: unknown): Promise<Result> {
  const parsed = parseProductFormDraft(input);
  if (!UUID.test(productId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !parsed)
    return { ok: false, message: "Dữ liệu bản nháp không hợp lệ." };
  try {
    const ctx = await context();
    if (!ctx) return { ok: false, message: "Không xác nhận được quyền quản lý sản phẩm." };
    const { data, error } = await ctx.db.rpc("save_product_form_draft", {
      p_supplier_id: ctx.access.supplier.id, p_product_id: productId, p_expected_revision: expectedRevision, p_payload: parsed,
    });
    if (error) throw new Error(error.message);
    const result = rpcResult(data);
    if (result.ok) revalidatePath(`/supplier/portal/products/${productId}`);
    return result;
  } catch (error) {
    console.error("[product-form-draft] save", error);
    return { ok: false, message: "Không lưu được bản nháp. Vui lòng thử lại." };
  }
}

/** The form must pass its own owner check before a private draft can be read. */
export async function loadProductFormDraftAction(productId: string): Promise<Result> {
  if (!UUID.test(productId)) return { ok: false, message: "Sản phẩm không hợp lệ." };
  try {
    const ctx = await context();
    if (!ctx) return { ok: false, message: "Không xác nhận được quyền quản lý sản phẩm." };
    const product = await supabaseStore.getProduct(productId);
    if (!product || product.supplier_id !== ctx.access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    const { data, error } = await ctx.db.from("product_form_drafts").select("revision,payload")
      .eq("product_id", productId).eq("supplier_id", ctx.access.supplier.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: true, id: productId, revision: 0, draft: null };
    const draft = parseProductFormDraft(data.payload);
    if (!draft || !Number.isSafeInteger(data.revision) || data.revision < 1) throw new Error("Invalid stored draft");
    return { ok: true, id: productId, revision: data.revision, draft };
  } catch (error) {
    console.error("[product-form-draft] load", error);
    return { ok: false, message: "Không tải được bản nháp. Vui lòng thử lại." };
  }
}
