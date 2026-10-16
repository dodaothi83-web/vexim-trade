"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { randomUUID } from "crypto";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import type { RfqMatchStatus } from "@/lib/types";

async function enforce() {
  const g = await guard("suppliers.manage");
  if (g) redirect("/crm/dashboard");
}

export async function addMatchAction(fd: FormData) {
  await enforce();
  const rfqId = String(fd.get("rfq_id"));
  const supplierId = String(fd.get("supplier_id"));
  if (!rfqId || !supplierId) return;
  const store = getStore();
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
  await store.deleteRfqMatch(matchId).catch(() => null);
  revalidatePath(`/crm/rfqs/${rfqId}`);
}

export async function updateMatchQuoteAction(fd: FormData) {
  await enforce();
  const matchId = String(fd.get("match_id"));
  const rfqId = String(fd.get("rfq_id"));
  if (!matchId || !rfqId) return;
  const patch: Record<string, unknown> = {};
  const price = fd.get("quote_price");
  if (price && price !== "") patch.quote_price = Number(price);
  const currency = fd.get("quote_currency");
  if (currency) patch.quote_currency = String(currency);
  const unit = fd.get("quote_unit");
  if (unit) patch.quote_unit = String(unit);
  const incoterm = fd.get("quote_incoterm");
  if (incoterm) patch.quote_incoterm = String(incoterm);
  const lead = fd.get("quote_lead_time_days");
  if (lead && lead !== "") patch.quote_lead_time_days = Number(lead);
  if ("quote_price" in patch) patch.status = "quoted";
  const store = getStore();
  await store.updateRfqMatch(matchId, patch);
  revalidatePath(`/crm/rfqs/${rfqId}`);
}

export async function updateMatchStatusAction(fd: FormData) {
  await enforce();
  const matchId = String(fd.get("match_id"));
  const rfqId = String(fd.get("rfq_id"));
  const status = String(fd.get("status") || "proposed") as RfqMatchStatus;
  if (!matchId || !rfqId) return;
  const store = getStore();
  await store.updateRfqMatch(matchId, { status });
  revalidatePath(`/crm/rfqs/${rfqId}`);
}
