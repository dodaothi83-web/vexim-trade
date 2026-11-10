"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { randomUUID } from "crypto";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import type { RfqMatchStatus } from "@/lib/types";
import { CLOSED_RFQ_STATUSES, MANUAL_MATCH_STATUSES, isSupplierQuestionRfq } from "@/lib/rfq/workflow";
import { QUOTABLE_MATCH_STATUSES, QUOTE_CURRENCIES, QUOTE_INCOTERMS } from "@/lib/supplier-portal/quote";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { canDirectPublishRfqQuote } from "@/lib/rfq/portal-core";
import { runRfqPortalAlerts } from "@/lib/rfq/portal-alerts";

// Chỉ ghi tay các trạng thái không kèm email: liên hệ ngoài hệ thống, NCC từ chối hoặc im lặng.
// "Đã có báo giá" ghi khi lưu giá; "Đã trình người mua" / "Người mua chọn" / "Không được chọn" do nút nghiệp vụ ghi.
const MATCH_STATUS_VALUES = MANUAL_MATCH_STATUSES;

async function enforce() {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
}

export async function addMatchAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const supplierId = String(fd.get("supplier_id"));
  if (!rfqId || !supplierId) return;
  const store = getStore();
  const rfq = await store.getRfq(rfqId);
  if (rfq?.source_page === "/rfq?intent=question" || rfq?.specs?.inquiry_kind === "supplier_question") {
    throw new Error("Chỉ liên hệ nhà cung cấp mà người mua đã chọn. Cần thêm nhà cung cấp khác thì tạo RFQ mới sau khi người mua đồng ý.");
  }
  const existing = await store.listRfqMatches(rfqId);
  if (existing.some((m) => m.supplier_id === supplierId)) {
    revalidatePath(`/crm/rfqs/${rfqId}`);
    return;
  }
  await store.createRfqMatch({
    id: randomUUID(),
    rfq_id: rfqId,
    supplier_id: supplierId,
    status: "proposed",
  });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}

export async function removeMatchAction(fd: FormData) {
  await enforce();
  const matchId = String(fd.get("match_id"));
  const rfqId = String(fd.get("rfq_id"));
  if (!matchId || !rfqId) return;
  const store = getStore();
  const match = await store.getRfqMatch(matchId);
  if (!match || match.rfq_id !== rfqId) throw new Error("Nhà cung cấp không thuộc RFQ này.");
  if (match.sent_to_supplier_at || match.sent_to_buyer_at) {
    throw new Error("Lời mời đã gửi; không thể xoá lịch sử báo giá và trao đổi. Hãy cập nhật trạng thái thay thế.");
  }
  await store.deleteRfqMatch(matchId);
  revalidatePath(`/crm/rfqs/${rfqId}`);
}

export async function updateMatchQuoteAction(fd: FormData) {
  await enforce();
  const matchId = String(fd.get("match_id"));
  const rfqId = String(fd.get("rfq_id"));
  if (!matchId || !rfqId) return;
  const store = getStore();
  const [rfq, match] = await Promise.all([store.getRfq(rfqId), store.getRfqMatch(matchId)]);
  if (!rfq || !match || match.rfq_id !== rfqId || !match.sent_to_supplier_at ||
      CLOSED_RFQ_STATUSES.includes(rfq.status) || isSupplierQuestionRfq(rfq) ||
      !QUOTABLE_MATCH_STATUSES.includes(match.status)) {
    throw new Error("Chỉ nhập hoặc điều chỉnh báo giá cho lời mời còn hiệu lực trong RFQ này.");
  }
  const priceRaw = String(fd.get("quote_price") ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(priceRaw) || !(Number(priceRaw) > 0) || Number(priceRaw) >= 1e9) {
    throw new Error("Nhập đơn giá dương, tối đa 4 chữ số thập phân.");
  }
  const currency = String(fd.get("quote_currency") ?? "").trim().toUpperCase();
  const unit = String(fd.get("quote_unit") ?? "").trim();
  const incoterm = String(fd.get("quote_incoterm") ?? "").trim().toUpperCase();
  const lead = String(fd.get("quote_lead_time_days") ?? "").trim();
  if (!(QUOTE_CURRENCIES as readonly string[]).includes(currency) || !unit || unit.length > 20 ||
      withoutDirectContacts(unit) !== unit || !(QUOTE_INCOTERMS as readonly string[]).includes(incoterm) ||
      (lead && (!/^\d+$/.test(lead) || Number(lead) < 1 || Number(lead) > 365))) {
    throw new Error("Kiểm tra tiền tệ, đơn vị, Incoterm và thời gian giao trước khi lưu.");
  }
  const saved = await store.updateRfqMatchIfState(match.id, match.supplier_id, match.status, match.updated_at, {
    status: "quoted", quote_price: Number(priceRaw), quote_currency: currency, quote_unit: unit,
    quote_incoterm: incoterm, quote_lead_time_days: lead ? Number(lead) : null,
  });
  if (!saved) throw new Error("Báo giá đã thay đổi ở cửa sổ khác. Tải lại trang trước khi lưu.");
  if (canDirectPublishRfqQuote(rfq, saved)) {
    const published = await store.publishRfqQuotes(rfq.id, [saved.id], { [saved.id]: saved.updated_at });
    if (!published.length) throw new Error("Đã lưu bản nháp nhưng báo giá vừa thay đổi, chưa công bố. Tải lại và kiểm tra trước khi thử lại.");
    await runRfqPortalAlerts(store, { matchIds: [saved.id] })
      .catch((error) => console.error("[rfq] direct quote published; mail will retry", error));
  }
  revalidatePath(`/crm/rfqs/${rfqId}`);
  revalidatePath(`/buyer/account/requests/${rfqId}`);
  revalidatePath("/buyer/account");
}

export async function updateMatchStatusAction(fd: FormData) {
  await enforce();
  const matchId = String(fd.get("match_id"));
  const rfqId = String(fd.get("rfq_id"));
  const status = String(fd.get("status") || "proposed") as RfqMatchStatus;
  if (!matchId || !rfqId) return;
  // Selection is a business event: use selectSupplierAction so the portal and email stay in sync.
  if (!MATCH_STATUS_VALUES.includes(status)) throw new Error("Trạng thái này do nút nghiệp vụ cập nhật: lưu giá, Trình người mua hoặc Chốt nhà cung cấp.");
  const store = getStore();
  const match = await store.getRfqMatch(matchId);
  if (!match || match.rfq_id !== rfqId || !!match.sent_to_buyer_at ||
      (match.sent_to_supplier_at && status === "proposed")) {
    throw new Error("Trạng thái lời mời đã thay đổi. Tải lại RFQ trước khi tiếp tục.");
  }
  await store.updateRfqMatch(matchId, { status });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}
