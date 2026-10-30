"use server";

import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { isProductFormEnabled } from "@/lib/products/product-form-staging-access";
import { translateProductName } from "@/lib/ai/product-name-translation";
import { checkProductNameTranslationLimit } from "@/lib/ai/product-name-rate-limit";

type Result = { ok: true; sourceName: string; englishName: string } | { ok: false; message: string };

/** Produce a temporary preview only; neither create a draft nor publish a name. */
export async function translateSupplierProductNameAction(input: unknown): Promise<Result> {
  const source = typeof input === "string" ? input.trim() : "";
  if (source.length < 3 || source.length > 180) return { ok: false, message: "Tên sản phẩm chưa hợp lệ để dịch." };
  try {
    if (!isProductFormEnabled() || !getSupabaseClient()) return { ok: false, message: "Dịch tự động hiện chưa sẵn sàng." };
    const access = await supplierPortalAccess(supabaseStore);
    if (!access || !portalApproved(access.supplier)) return { ok: false, message: "Không xác nhận được quyền dịch tên sản phẩm." };
    if (!await checkProductNameTranslationLimit(`supplier:${access.supplier.id}`))
      return { ok: false, message: "Dịch tự động tạm thời không khả dụng. Vexim sẽ kiểm tra tên khi duyệt." };
    const englishName = await translateProductName(source);
    if (!englishName) return { ok: false, message: "Chưa dịch được tên. Vexim sẽ kiểm tra khi duyệt." };
    const current = await supplierPortalAccess(supabaseStore);
    if (!current || !portalApproved(current.supplier) || current.user.id !== access.user.id || current.supplier.id !== access.supplier.id)
      return { ok: false, message: "Không xác nhận được quyền dịch tên sản phẩm." };
    return { ok: true, sourceName: source, englishName };
  } catch (error) {
    console.error("[product-form] name translation failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, message: "Chưa dịch được tên. Vexim sẽ kiểm tra khi duyệt." };
  }
}
