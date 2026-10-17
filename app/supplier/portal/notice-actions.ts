"use server";

import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierDashboard } from "@/lib/supplier-portal/dashboard";

/** Read receipts can be set only for an event currently visible to this supplier. */
export async function markSupplierNoticeReadAction(form: FormData): Promise<void> {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return;
  const key = String(form.get("notice_key") ?? "");
  if (key.length > 100 || !/^(rfq|selected|returned|approved|contacted):[a-z0-9-]+$/i.test(key)) return;
  const { store, supplier, reviews } = access;
  const [invites, requests] = await Promise.all([
    store.listSupplierRfqInvitations(supplier.id), store.listSupplierVerificationRequests(supplier.id),
  ]);
  const visible = buildSupplierDashboard({ supplierId: supplier.id, invites, requests, reviews,
    products: [], reads: [], days: 30 }).notices.some((n) => n.key === key);
  if (!visible) return;
  await store.markSupplierNoticeRead(supplier.id, key);
  revalidatePath("/supplier/portal");
}
