import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getSupabaseAuthClient, getSupabaseClient } from "@/lib/db/supabase";
import { protectPasswordAuth } from "@/lib/auth/abuse-protection";
import { getSession } from "@/lib/auth/session";
import { passwordProblem } from "@/lib/auth/password";
import { SITE_URL } from "@/lib/site";
import { notifyStaffSupplierAccount } from "@/lib/supplier-portal/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCEPTED_MESSAGE = "Yêu cầu đã được ghi nhận. Hãy thử đăng nhập, hoặc kiểm tra email nếu bạn nhận được hướng dẫn xác nhận. Sau đó khai hồ sơ doanh nghiệp trong cổng nhà cung cấp.";
const NO_STORE = { "Cache-Control": "no-store" };
const accepted = () => NextResponse.json({ ok: true, message: ACCEPTED_MESSAGE }, { headers: NO_STORE });
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });
const unavailable = () => fail("Đăng ký chưa sẵn sàng. Vui lòng thử lại sau.", 503);

/** Never send a confirmation email pointing to loopback from a deployed environment. */
function signupEmailRedirect(): string | null {
  try {
    const url = new URL(process.env.SUPPLIER_SIGNUP_REDIRECT_URL?.trim() || `${SITE_URL}/login`);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const loopback = hostname === "localhost" || hostname.endsWith(".localhost") ||
      /^127\./.test(hostname) || hostname === "[::1]" || hostname === "0.0.0.0";
    if (url.pathname !== "/login" || url.search || url.hash || url.username || url.password) return null;
    if (url.protocol === "https:" && !loopback) return url.href;
    if (process.env.NODE_ENV === "development" && loopback && url.protocol === "http:") return url.href;
  } catch { /* Reject malformed configuration before creating an Auth user. */ }
  return null;
}

function duplicateAuthResponse(error: { code?: string; message?: string } | null, identities: unknown[] | undefined): boolean {
  if (identities?.length === 0) return true;
  const code = error?.code?.toLowerCase() ?? "";
  const message = error?.message?.toLowerCase() ?? "";
  return code === "user_already_exists" || /already (registered|exists)/.test(message);
}

/** Account only: no supplier page, RFQs, verification or portal rights until the logged-in business form and staff decision. */
export async function POST(request: Request) {
  if (await getSession()) return fail("Bạn đã đăng nhập. Hãy mở cổng nhà cung cấp.", 409);
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return fail("Biểu mẫu quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }

  // A filled honeypot gets the same response as every accepted request and
  // never reaches rate-limit credentials, Supabase, staff mail or the database.
  if (String(form.get("website_hp") ?? "")) return accepted();
  if (form.get("consent") !== "yes") return fail("Vui lòng đồng ý tạo tài khoản nhà cung cấp.");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const challengeToken = String(form.get("challenge_token") ?? "").trim();
  if (email.length > 254 || !EMAIL.test(email)) return fail("Email không hợp lệ.");
  if (name.length < 2 || name.length > 120) return fail("Vui lòng nhập tên người đăng ký (2–120 ký tự).");
  if (password.length > 128 || passwordProblem(password)) return fail("Mật khẩu cần 8–128 ký tự, gồm cả chữ và số.");

  const protection = await protectPasswordAuth({ flow: "supplier-signup", headers: request.headers, email, token: challengeToken });
  if (!protection.ok) return fail(protection.message, protection.status);

  // Đường dẫn xác nhận chỉ cần khi Supabase thật sự gửi thư. Dự án đang tắt
  // Confirm email thì không có thư nào, nên cấu hình này không được chặn đăng ký.
  const emailRedirectTo = signupEmailRedirect();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return unavailable();
  const auth = getSupabaseAuthClient();
  const db = getSupabaseClient();
  const store = getStore();
  if (!auth || !db || store.mode !== "supabase") return unavailable();
  try {
    const admins = await store.listUsers();
    if (!admins.some((u) => u.role === "admin" && u.is_active)) return unavailable();
    // Do not confirm whether an email already owns an account. The accepted
    // response is intentionally identical to a new registration response.
    if (await store.getUserByEmail(email)) return accepted();
    // Fail before creating an Auth identity if this deployment lacks the nullable supplier link.
    const schema = await db.from("app_users").select("supplier_id").limit(1);
    if (schema.error) throw schema.error;
  } catch (error) {
    console.error("[supplier-signup] preflight", error);
    return unavailable();
  }

  let authId: string | null = null;
  let needsEmailConfirmation = false;
  try {
    // Chỉ truyền emailRedirectTo khi đường dẫn hợp lệ; để Supabase dùng Site URL
    // (thường là localhost) là cách chắc chắn nhất để thư xác nhận đi sai chỗ.
    const { data, error } = await auth.auth.signUp({ email, password,
      ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}) });
    if (error || !data.user?.id || data.user.identities?.length === 0) {
      if (duplicateAuthResponse(error, data.user?.identities)) return accepted();
      console.warn("[supplier-signup] Auth rejected signup", error?.code ?? "invalid_response");
      return unavailable();
    }
    authId = data.user.id;
    // Supabase trả session (hoặc user đã có email_confirmed_at) khi dự án đang tắt
    // Confirm email. Đó là cấu hình hợp lệ để chạy thử: tài khoản dùng được ngay.
    needsEmailConfirmation = !data.session && !data.user.email_confirmed_at;
    if (needsEmailConfirmation && !emailRedirectTo) {
      // Có gửi thư mà đường dẫn lại không an toàn → không giữ tài khoản nửa vời.
      await auth.auth.admin.deleteUser(authId);
      console.error("[supplier-signup] unsafe email confirmation redirect");
      return unavailable();
    }
  } catch (error) {
    console.error("[supplier-signup] Auth unavailable", error);
    return unavailable();
  }

  try {
    const user = await store.createUser({ email, name, role: "supplier", supplier_id: null,
      auth_provider: "supabase", password_hash: null, is_active: true });
    await store.addAuditLog({ actor_id: user.id, actor_email: email, entity: "user", entity_id: user.id,
      action: "supplier.account_registered", before: null,
      // Ghi lại email có được xác nhận hay không: đọc nhật ký là biết ngay tài khoản
      // này tạo trong lúc dự án tắt Confirm email hay qua thư xác nhận.
      after: { role: "supplier", supplier_id: null, email_confirmation_required: needsEmailConfirmation } })
      .catch((error) => console.error("[supplier-signup] audit log failed", error));
    // Staff learn about the new login right away; a failed mail never blocks the account.
    try { await notifyStaffSupplierAccount({ email, name, provider: "email" }); }
    catch (error) { console.error("[supplier-signup] staff notification failed", error); }
    return accepted();
  } catch (error) {
    console.error("[supplier-signup] app user failed", error);
    if (authId) await auth.auth.admin.deleteUser(authId).catch((e) => console.error("[supplier-signup] Auth cleanup failed", e));
    return fail("Không lưu được tài khoản. Vui lòng thử lại hoặc liên hệ Vexim.", 503);
  }
}
