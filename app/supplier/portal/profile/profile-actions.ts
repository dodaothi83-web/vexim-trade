"use server";

import { revalidatePath } from "next/cache";

import { ensureSupplierProfileEnglish } from "@/lib/ai/supplier-translation-service";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { getPortalMessages } from "@/lib/i18n/server";
import type { SupplierInput } from "@/lib/types";

type Result = { ok: boolean; message: string };

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
const list = (form: FormData, key: string) => text(form, key, 800)
  .split(/[,;\n]/).map((value) => value.trim()).filter(Boolean).slice(0, 12);

/**
 * NCC được cập nhật nội dung vận hành của chính mình sau khi đã mở cổng.
 * Không nhận status, quyền truy cập, tên pháp nhân, mã số thuế hoặc kết quả xác minh từ form.
 *
 * Thông báo trả về đi theo ngôn ngữ đang chọn: đây là chữ người dùng đọc, không phải log.
 */
export async function saveSupplierProfileEditAction(form: FormData): Promise<Result> {
  const { m } = await getPortalMessages();
  const copy = m.profile.edit.result;
  const access = await supplierPortalAccess();
  if (!access) return { ok: false, message: copy.login };
  const { supplier, store, user } = access;
  if (!portalApproved(supplier)) return { ok: false, message: copy.notOpen };

  function positiveInt(form: FormData, key: string, max: number): number | null {
    const raw = text(form, key, 12);
    if (!raw) return null;
    if (!/^\d+$/.test(raw) || Number(raw) > max) throw new Error(copy.badNumber);
    return Number(raw);
  }

  try {
    const contactName = text(form, "contact_name", 120);
    const phone = text(form, "phone", 40);
    const products = text(form, "products", 1000);
    if (!contactName || !phone || !products) return { ok: false, message: copy.missingRequired };
    const website = text(form, "website", 250);
    if (website && !/^https?:\/\/[^\s.]+(?:\.[^\s.]+)+(?:[:/?#][^\s]*)?$/i.test(website))
      return { ok: false, message: copy.badWebsite };

    const patch: Partial<SupplierInput> = {
      trade_name: text(form, "trade_name", 180) || null,
      display_name: text(form, "display_name", 180) || null,
      contact_name: contactName,
      contact_title: text(form, "contact_title", 100) || null,
      phone,
      zalo: text(form, "zalo", 40) || null,
      website: website || null,
      country: text(form, "country", 100) || "Vietnam",
      province: text(form, "province", 100) || null,
      products,
      markets: text(form, "markets", 800) || null,
      intro_source: text(form, "intro_source", 1500) || null,
      founded_year: positiveInt(form, "founded_year", new Date().getFullYear()),
      employees: positiveInt(form, "employees", 1000000),
      // Missing fields from an older client must not clear existing annual output or legacy terms.
      ...(form.has("annual_output") ? { annual_output: text(form, "annual_output", 180) || null } : {}),
      lead_time_days: positiveInt(form, "lead_time_days", 3650),
      payment_terms: text(form, "payment_terms", 200) || null,
      ports: list(form, "ports"),
      incoterms: list(form, "incoterms"),
      export_markets: list(form, "export_markets"),
      private_label: form.get("private_label") === "yes",
    };
    await store.updateSupplier(supplier.id, patch);
    await store.addAuditLog({
      actor_id: user.id, actor_email: user.email, entity: "supplier", entity_id: supplier.id,
      action: "supplier.profile_owner_updated",
      before: { status: supplier.status, onboarding_status: supplier.onboarding_status ?? null },
      after: { updated_fields: Object.keys(patch), status: supplier.status, onboarding_status: supplier.onboarding_status ?? null },
    }).catch((error) => console.error("[supplier-profile] owner edit audit", error));

    // Dịch là bước hỗ trợ sau khi lưu. Lỗi hoặc thiếu cấu hình AI không làm mất dữ liệu vừa lưu.
    let translationNote = "";
    try {
      const translated = await ensureSupplierProfileEnglish(store, supplier.id, { id: user.id, email: user.email });
      if (translated.status === "failed" || translated.status === "unconfigured") translationNote = ` ${copy.translationPending}`;
    } catch (error) {
      console.error("[supplier-profile] owner edit translation", error);
      translationNote = ` ${copy.translationPending}`;
    }

    revalidatePath("/supplier/portal");
    revalidatePath("/supplier/portal/profile");
    revalidatePath("/supplier/portal/profile/edit");
    revalidatePath("/supplier/portal/storefront");
    revalidatePath(`/suppliers/${supplier.slug || supplier.id}`);
    revalidatePath(`/crm/suppliers/${supplier.slug || supplier.id}`);
    revalidatePath(`/crm/suppliers/${supplier.id}`);
    return { ok: true, message: `${copy.saved}${translationNote}` };
  } catch (error) {
    console.error("[supplier-profile] owner edit", error);
    return { ok: false, message: error instanceof Error ? error.message : copy.saveFailed };
  }
}
