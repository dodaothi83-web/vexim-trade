"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { parseSupplierQuote, recordSupplierPortalQuote } from "@/lib/supplier-portal/quote";
import { getPortalMessages } from "@/lib/i18n/server";
import { presentShortlistToBuyer } from "@/lib/rfq/outreach";

/** Khi lỗi, trả lại giá trị đã nhập vì React đặt lại form sau mỗi lần gửi. */
export type SupplierQuoteState = { error: string | null; values?: Record<string, string> };

const FIELDS = ["price", "currency", "unit", "incoterm", "lead_time_days", "valid_until", "note"] as const;
const keep = (fd: FormData) => Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "").slice(0, 1000)]));

/** Nhà cung cấp gửi báo giá hoặc từ chối một lời mời của chính mình. */
export async function submitSupplierQuoteAction(_prev: SupplierQuoteState, fd: FormData): Promise<SupplierQuoteState> {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) redirect("/supplier/portal");
  const errors = (await getPortalMessages()).m.rfqs.quote.errors;

  const parsed = parseSupplierQuote(fd);
  if (!parsed.ok) return { error: errors[parsed.error], values: keep(fd) };

  let result: Awaited<ReturnType<typeof recordSupplierPortalQuote>>;
  try {
    result = await recordSupplierPortalQuote({
      store: access.store,
      supplier: access.supplier,
      actorEmail: access.user.email,
      matchId: String(fd.get("match_id") ?? ""),
      quote: parsed.value,
    });
  } catch (error) {
    const key = error instanceof Error ? error.message : "";
    if (key !== "notFound" && key !== "closed") console.error("[supplier-portal] quote not saved", error);
    return { error: key === "notFound" || key === "closed" ? errors[key] : errors.unknown, values: keep(fd) };
  }
  // RFQ trực tiếp: gửi báo giá tới người mua ngay (email so sánh ẩn danh, ghi mốc phản hồi SLA).
  // Gửi lỗi thì báo giá vẫn được lưu; nhân viên bấm "Trình người mua" trong CRM để gửi lại.
  let delivered = false;
  if (result.intent === "quote" && result.direct) {
    try {
      delivered = (await presentShortlistToBuyer({ rfqId: result.rfqId })).sent;
    } catch (error) {
      console.error(`[supplier-portal] quote saved but buyer delivery failed for ${result.code}`, error);
    }
  }
  revalidatePath("/supplier/portal/rfqs");
  revalidatePath("/supplier/portal");
  revalidatePath(`/crm/rfqs/${result.rfqId}`);
  const outcome = result.intent === "decline" ? "declined" : delivered ? "delivered" : "sent";
  redirect(`/supplier/portal/rfqs?quote=${outcome}&code=${encodeURIComponent(result.code)}`);
}
