"use server";

import { revalidatePath } from "next/cache";

import { ensureSupplierProfileEnglish } from "@/lib/ai/supplier-translation-service";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import type { SupplierInput } from "@/lib/types";

type Result = { ok: boolean; message: string };

const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
const list = (form: FormData, key: string) => text(form, key, 800)
  .split(/[,;\n]/).map((value) => value.trim()).filter(Boolean).slice(0, 12);

function positiveInt(form: FormData, key: string, max: number): number | null {
  const raw = text(form, key, 12);
  if (!raw) return null;
  if (!/^\d+$/.test(raw) || Number(raw) > max) throw new Error("Có một số thông tin chưa đúng định dạng. Vui lòng kiểm tra lại.");
  return Number(raw);
}

/**
 * NCC được cập nhật nội dung vận hành của chính mình sau khi đã mở cổng.
 * Không nhận status, quyền truy cập, tên pháp nhân, mã số thuế hoặc kết quả xác minh từ form.
 */
export async function saveSupplierProfileEditAction(form: FormData): Promise<Result> {
  const access = await supplierPortalAccess();
  if (!access) return { ok: false, message: "Vui lòng đăng nhập lại bằng tài khoản nhà cung cấp." };
  const { supplier, store, user } = access;
  if (!portalApproved(supplier)) return { ok: false, message: "Hồ sơ chưa được mở quyền chỉnh sửa." };

  try {
    const contactName = text(form, "contact_name", 120);
    const phone = text(form, "phone", 40);
    const products = text(form, "products", 1000);
    if (!contactName || !phone || !products)
      return { ok: false, message: "Cần thông tin liên hệ, số điện thoại và mặt hàng chính." };
    const website = text(form, "website", 250);
    if (website && !/^https?:\/\/[^\s.]+(?:\.[^\s.]+)+(?:[:\/?#][^\s]*)?$/i.test(website))
      return { ok: false, message: "Website phải là URL http(s) hợp lệ." };

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
      capacity_per_month: text(form, "capacity_per_month", 180) || null,
      moq_text: text(form, "moq_text", 180) || null,
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
      if (translated.status === "failed" || translated.status === "unconfigured")
        translationNote = " Bản dịch tiếng Anh chưa cập nhật được; thông tin gốc đã được lưu.";
    } catch (error) {
      console.error("[supplier-profile] owner edit translation", error);
      translationNote = " Bản dịch tiếng Anh chưa cập nhật được; thông tin gốc đã được lưu.";
    }

    revalidatePath("/supplier/portal");
    revalidatePath("/supplier/portal/profile");
    revalidatePath("/supplier/portal/profile/edit");
    revalidatePath("/supplier/portal/storefront");
    revalidatePath(`/suppliers/${supplier.slug || supplier.id}`);
    revalidatePath(`/crm/suppliers/${supplier.slug || supplier.id}`);
    revalidatePath(`/crm/suppliers/${supplier.id}`);
    return { ok: true, message: `Đã lưu hồ sơ.${translationNote}` };
  } catch (error) {
    console.error("[supplier-profile] owner edit", error);
    return { ok: false, message: error instanceof Error ? error.message : "Không lưu được hồ sơ. Vui lòng thử lại." };
  }
}
