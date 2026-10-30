import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Old application link: accounts are created first; the first business form lives in the locked portal. */
export default async function SupplierApplyPage() {
  const session = await getSession();
  redirect(session ? (session.role === "supplier" ? "/supplier/portal" : "/crm/dashboard") : "/supplier/register");
}
