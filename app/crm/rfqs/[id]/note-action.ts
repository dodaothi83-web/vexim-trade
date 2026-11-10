"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { assertStaffMayProcessRfq } from "@/lib/rfq/staff-access";

/**
 * Thêm ghi chú nội bộ vào RFQ (lưu trong specs.notes_internal để không cần đổi schema).
 * Sử dụng append kiểu: "[2026-10-16 14:30] Minh: nội dung\n[time] Author: nd"
 */
export async function addRfqNoteAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) return;
  const rfqId = String(fd.get("rfq_id") || "");
  const text = String(fd.get("note") || "").trim();
  if (!rfqId || !text) return;
  const store = getStore();
  const rfq = await assertStaffMayProcessRfq(store, rfqId);
  const ts = new Date().toLocaleString("vi-VN", { hour12: false });
  // Ghi đúng người viết: ghi chú RFQ là bằng chứng nội bộ khi đối soát với người mua.
  const session = await getSession();
  const author = session?.name?.trim() || session?.email || "Không rõ";
  const line = `[${ts}] ${author}: ${text}`;
  const notes = (rfq.specs as Record<string, unknown>).notes_internal;
  const next = typeof notes === "string" && notes ? `${notes}\n${line}` : line;
  await store.updateRfq(rfqId, {
    specs: { ...(rfq.specs as Record<string, unknown>), notes_internal: next },
  });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}
