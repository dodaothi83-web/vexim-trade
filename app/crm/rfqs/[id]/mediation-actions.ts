"use server";

import { revalidatePath } from "next/cache";
import { requirePagePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { canReadMediatedDesk, markMediatedRfqRead, sendMediatedRfqMessage, type MediatedError } from "@/lib/rfq/mediated";

export type StaffDeskState = { error: MediatedError | "unknown" | null; body: string; sent: boolean; seq: number };

export async function staffVeximMessageAction(previous: StaffDeskState, fd: FormData): Promise<StaffDeskState> {
  const session = await requirePagePermission("rfq.manage", "/crm/dashboard");
  const rfqId = String(fd.get("rfq_id") ?? "");
  const matchId = String(fd.get("match_id") ?? "");
  const store = getStore();
  const rfq = await store.getRfq(rfqId);
  const match = matchId ? await store.getRfqMatch(matchId) : null;
  const body = String(fd.get("body") ?? "").slice(0, 4001);
  if (!rfq || (matchId && (!match || match.rfq_id !== rfq.id))) {
    return { error: "unavailable", body, sent: false, seq: previous.seq };
  }
  try {
    const result = await sendMediatedRfqMessage({ store, rfq, match,
      sender: "staff", email: session.email, body });
    if (!result.ok) return { error: result.error, body, sent: false, seq: previous.seq };
  } catch (error) {
    console.error("[rfq-mediated] staff message not saved", error);
    return { error: "unknown", body, sent: false, seq: previous.seq };
  }
  revalidatePath(`/crm/rfqs/${rfqId}`);
  revalidatePath(`/buyer/account/requests/${rfqId}`);
  revalidatePath("/buyer/account");
  if (matchId) revalidatePath(`/supplier/portal/rfqs/${matchId}`);
  return { error: null, body: "", sent: true, seq: previous.seq + 1 };
}

export async function staffVeximReadAction(rfqId: string, matchId: string | null, visibleAt: string): Promise<void> {
  await requirePagePermission("rfq.view", "/crm/dashboard");
  const store = getStore();
  const rfq = await store.getRfq(rfqId);
  const match = matchId ? await store.getRfqMatch(matchId) : null;
  if (!rfq || (matchId && (!match || match.rfq_id !== rfqId)) || !canReadMediatedDesk(rfq, match)) return;
  await markMediatedRfqRead({ store, threadId: matchId ?? rfqId, side: "staff", visibleAt });
}
