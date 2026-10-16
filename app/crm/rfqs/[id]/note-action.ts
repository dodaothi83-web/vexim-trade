"use server";

import { revalidatePath } from "next/cache";

import { guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

/**
 * Thêm ghi chú nội bộ vào RFQ (lưu trong specs.notes_internal để không cần đổi schema).
 * Sử dụng append kiểu: "[2026-10-16 14:30] Minh: nội dung\n[time] Author: nd"
 */
export async function addRfqNoteAction(fd: FormData): Promise<void> {
  const g = await guard("suppliers.manage");
  if (g) return;
  const rfqId = String(fd.get("rfq_id") || "");
  const text = String(fd.get("note") || "").trim();
  if (!rfqId || !text) return;
  const store = getStore();
  const rfq = await store.getRfq(rfqId);
  if (!rfq) return;
  const ts = new Date().toLocaleString("vi-VN", { hour12: false });
  const author = "Sale"; // TODO: lấy từ session user.name
  const line = `[${ts}] ${author}: ${text}`;
  const notes = (rfq.specs as Record<string, unknown>).notes_internal;
  const next = typeof notes === "string" && notes ? `${notes}\n${line}` : line;
  await store.updateRfq(rfqId, {
    specs: { ...(rfq.specs as Record<string, unknown>), notes_internal: next },
  });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}
