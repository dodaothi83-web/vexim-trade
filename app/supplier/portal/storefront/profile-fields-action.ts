"use server";

import { revalidatePath } from "next/cache";

import { ensureSupplierProfileEnglish } from "@/lib/ai/supplier-translation-service";
import { getPortalMessages } from "@/lib/i18n/server";
import { STOREFRONT_PROFILE_FIELDS, type StorefrontProfilePatch } from "@/lib/storefront-profile-fields";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import type { SupplierInput } from "@/lib/types";

type Result = { ok: boolean; message: string };

/**
 * Sửa thông tin hồ sơ ngay trong "Thiết kế trang" (khối Giới thiệu công ty, Năng lực sản xuất,
 * Điều kiện giao dịch, Thông tin công ty, Thị trường xuất khẩu). Chỉ cập nhật đúng các trường
 * gửi lên, cùng quy tắc với "Hồ sơ công ty"; không nhận tên pháp lý, địa chỉ đăng ký, MOQ hay
 * kết quả xác minh (dữ liệu Vexim giữ). Lưu là dùng ngay trên trang, rồi dịch sang tiếng Anh.
 */
export async function saveStorefrontProfileFieldsAction(input: StorefrontProfilePatch): Promise<Result> {
  const { m } = await getPortalMessages();
  const copy = m.profile.edit.result;
  const d = m.designer.profile;
  const access = await supplierPortalAccess();
  if (!access) return { ok: false, message: copy.login };
  const { supplier, store, user } = access;
  if (!portalApproved(supplier)) return { ok: false, message: copy.notOpen };
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const patch: Partial<SupplierInput> = {};
  const str = (key: string, max: number) => typeof raw[key] === "string" ? (raw[key] as string).trim().slice(0, max) : "";
  const list = (key: string) => str(key, 800).split(/[,;\n]/).map((value) => value.trim()).filter(Boolean).slice(0, 12);
  for (const key of Object.keys(raw)) {
    const field = STOREFRONT_PROFILE_FIELDS[key as keyof typeof STOREFRONT_PROFILE_FIELDS];
    if (!field) continue;
    if (field.kind === "text") {
      const value = str(key, field.max);
      if ("required" in field && field.required && !value) return { ok: false, message: d.required };
      (patch as Record<string, unknown>)[key] = value || null;
    } else if (field.kind === "list") {
      (patch as Record<string, unknown>)[key] = list(key);
    } else {
      const value = str(key, 12);
      if (value && (!/^\d+$/.test(value) || Number(value) > field.max)) return { ok: false, message: copy.badNumber };
      (patch as Record<string, unknown>)[key] = value ? Number(value) : null;
    }
  }
  if (!Object.keys(patch).length) return { ok: false, message: d.nothing };
  try {
    await store.updateSupplier(supplier.id, patch);
  } catch (error) {
    console.error("[storefront-profile] save", error);
    return { ok: false, message: copy.saveFailed };
  }
  await store.addAuditLog({ actor_id: user.id, actor_email: user.email, entity: "supplier", entity_id: supplier.id,
    action: "supplier.profile_owner_updated", before: null, after: { updated_fields: Object.keys(patch), via: "storefront_designer" } })
    .catch((error) => console.error("[storefront-profile] audit", error));
  // Dịch sang tiếng Anh như khi sửa ở Hồ sơ công ty; lỗi dịch không làm mất dữ liệu vừa lưu.
  let note = "";
  try {
    const translated = await ensureSupplierProfileEnglish(store, supplier.id, { id: user.id, email: user.email });
    if (translated.status === "failed" || translated.status === "unconfigured") note = ` ${copy.translationPending}`;
  } catch (error) {
    console.error("[storefront-profile] translation", error);
    note = ` ${copy.translationPending}`;
  }
  revalidatePath("/supplier/portal/profile");
  revalidatePath("/supplier/portal/storefront");
  revalidatePath("/supplier/portal/storefront/design");
  revalidatePath(`/suppliers/${supplier.slug || supplier.id}`);
  return { ok: true, message: `${d.saved}${note}` };
}
