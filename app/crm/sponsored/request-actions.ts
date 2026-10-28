"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { sponsoredRequestStore } from "@/lib/sponsored/requests";
import type { SponsoredRequestStatus } from "@/lib/types";

const PATH = "/crm/sponsored";
function back(code: string, bad = false): never { redirect(`${PATH}?${bad ? "err" : "ok"}=${code}#yeu-cau-ncc`); }

export async function updateSponsoredRequestAction(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, "sponsored.requests.manage")) back("request-forbidden", true);
  const store = sponsoredRequestStore();
  if (!store) back("request-error", true);
  const id = String(form.get("id") ?? "");
  const expected = String(form.get("expected") ?? "") as SponsoredRequestStatus;
  const status = String(form.get("status") ?? "") as SponsoredRequestStatus;
  if (!id || id.length > 100 || !(expected === "new" && (status === "contacted" || status === "closed") || expected === "contacted" && status === "closed")) back("request-invalid", true);

  // getSession can use a signed cookie during an outage. Never use that fallback
  // to mutate requests: verify the active role against the strict store again.
  let user: Awaited<ReturnType<typeof store.getUser>>;
  try { user = await store.getUser(session.uid); }
  catch (error) { console.error("[sponsored] could not verify request handler", error); back("request-error", true); }
  if (!user || !user.is_active || user.role !== session.role ||
      user.email.trim().toLowerCase() !== session.email.trim().toLowerCase() ||
      !hasPermission(user.role, "sponsored.requests.manage")) back("request-forbidden", true);

  let updated = false;
  try { updated = !!await store.updateSponsoredRequestIfStatus(id, expected, status, user.id); }
  catch (error) { console.error("[sponsored] could not update request", error); back("request-error", true); }
  if (!updated) back("request-changed", true);
  revalidatePath(PATH);
  revalidatePath("/supplier/portal/boost");
  back(status === "contacted" ? "request-contacted" : "request-closed");
}
