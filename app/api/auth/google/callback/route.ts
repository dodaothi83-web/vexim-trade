import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { notifyStaffSupplierAccount } from "@/lib/supplier-portal/notify";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { GOOGLE_FLOW_COOKIE, GOOGLE_SIGNUP_COOKIE, googleClient, googleCookieOptions, isVerifiedGoogleUser, parseGoogleFlow, googleRequestOrigin, googleOriginAllowed } from "@/lib/auth/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = googleRequestOrigin(request);
  const target = (path: string) => NextResponse.redirect(new URL(path, origin));
  const clear = (res: NextResponse) => { res.cookies.set(GOOGLE_FLOW_COOKIE, "", googleCookieOptions(origin.startsWith("https:"), 0)); res.headers.set("Cache-Control", "no-store"); return res; };
  if (!googleOriginAllowed(origin)) return clear(target("/login?oauth=origin"));
  const { cookies } = await import("next/headers");
  const flow = parseGoogleFlow((await cookies()).get(GOOGLE_FLOW_COOKIE)?.value);
  const retry = flow?.intent === "signup" ? "/supplier/register" : "/login";
  const code = url.searchParams.get("code");
  if (!flow || !code || code.length > 2048 || url.searchParams.has("error")) return clear(target(`${retry}?oauth=cancelled`));
  const client = googleClient(flow.items);
  if (!client) return clear(target(`${retry}?oauth=unavailable`));
  try {
    // PKCE proves the callback belongs to the browser that started this flow; code is single-use.
    const flowId = url.searchParams.get("sb_flow_id") ?? undefined;
    const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !isVerifiedGoogleUser(data.user)) return clear(target(`${retry}?oauth=unverified`));
    const google = data.user;
    const store = getStore();
    if (store.mode !== "supabase") return clear(target(`${retry}?oauth=unavailable`));
    let user = await store.getUserByEmail(google.email);
    if (flow.intent === "signup") {
      if (user) return clear(target("/login?oauth=existing"));
      // Only an explicit supplier registration with a verified Google identity may create this
      // restricted role. Google login alone never provisions an app account or staff role.
      const admins = await store.listUsers();
      if (!admins.some((a) => a.role === "admin" && a.is_active)) return clear(target(`${retry}?oauth=unavailable`));
      user = await store.createUser({ email: google.email.toLowerCase(),
        name: (typeof google.user_metadata?.full_name === "string" ? google.user_metadata.full_name.trim().slice(0, 120) : "") || google.email.split("@")[0],
        role: "supplier", supplier_id: null, auth_provider: "supabase", password_hash: null, is_active: true });
      await store.addAuditLog({ actor_id: user.id, actor_email: user.email, entity: "user", entity_id: user.id,
        action: "supplier.account_registered", before: null, after: { role: "supplier", supplier_id: null, provider: "google" } })
        .catch((error) => console.error("[google-oauth] audit log failed", error));
      await notifyStaffSupplierAccount({ email: user.email, name: user.name, provider: "google" })
        .catch((error) => console.error("[google-oauth] staff notification failed", error));
    }
    if (!user || !user.is_active) return clear(target("/login?oauth=not_allowed"));
    const res = clear(target(user.role === "supplier" ? "/supplier/portal" : "/crm/dashboard"));
    res.cookies.set(GOOGLE_SIGNUP_COOKIE, "", googleCookieOptions(origin.startsWith("https:"), 0));
    res.cookies.set(SESSION_COOKIE, createSessionToken({ uid: user.id, email: user.email,
      name: user.name ?? user.email, role: user.role, via: "supabase" }),
      { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/", maxAge: 7 * 24 * 60 * 60 });
    await store.touchUserLogin(user.id).catch(() => null);
    revalidatePath("/", "layout");
    return res;
  } catch (error) {
    console.error("[google-oauth] callback", error);
    return clear(target(`${retry}?oauth=failed`));
  }
}
