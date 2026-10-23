import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getSupabaseAuthClient, getSupabaseClient } from "@/lib/db/supabase";
import { getSession } from "@/lib/auth/session";
import { passwordProblem } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rfq/rate-limit";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Account only: no supplier page, RFQs, verification or portal rights until the logged-in business form and staff decision. */
export async function POST(request: Request) {
  if (await getSession()) return fail("Bạn đã đăng nhập. Hãy mở cổng nhà cung cấp.", 409);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`supplier-register:${ip}`, { windowMs: 60 * 60 * 1000, max: 3 }).ok) return fail("Đã gửi quá nhiều lần. Vui lòng thử lại sau.", 429);
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return fail("Biểu mẫu quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  if (String(form.get("website_hp") ?? "")) return fail("Không thể gửi yêu cầu này.");
  if (form.get("consent") !== "yes") return fail("Vui lòng đồng ý tạo tài khoản nhà cung cấp.");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (email.length > 200 || !EMAIL.test(email)) return fail("Email không hợp lệ.");
  if (name.length < 2 || name.length > 120) return fail("Vui lòng nhập tên người đăng ký (2–120 ký tự).");
  if (password.length > 128 || passwordProblem(password)) return fail("Mật khẩu cần 8–128 ký tự, gồm cả chữ và số.");
  // Đường dẫn xác nhận chỉ cần khi Supabase thật sự gửi thư. Dự án đang tắt
  // Confirm email thì không có thư nào, nên cấu hình này không được chặn đăng ký.
  const emailRedirectTo = signupEmailRedirect();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("Chưa cấu hình Supabase cho đăng ký nhà cung cấp.", 503);
  const auth = getSupabaseAuthClient();
  const db = getSupabaseClient();
  const store = getStore();
  if (!auth || !db || store.mode !== "supabase") return fail("CSDL chưa khả dụng. Vui lòng thử lại sau.", 503);
  try {
    const admins = await store.listUsers();
    if (!admins.some((u) => u.role === "admin" && u.is_active)) return fail("Vexim chưa kích hoạt hệ thống tiếp nhận tài khoản.", 503);
    if (await store.getUserByEmail(email)) return fail("Email đã có tài khoản. Vui lòng đăng nhập.", 409);
    // Fail before creating an Auth identity if this deployment lacks the nullable supplier link.
    const schema = await db.from("app_users").select("supplier_id").limit(1);
    if (schema.error) throw schema.error;
  } catch (error) {
    console.error("[supplier-signup] preflight", error);
    return fail("Chưa áp dụng migration đăng ký trên Supabase. Chưa tạo tài khoản.", 503);
  }

  let authId: string | null = null;
  let needsEmailConfirmation = false;
  try {
    // Chỉ truyền emailRedirectTo khi đường dẫn hợp lệ; để Supabase dùng Site URL
    // (thường là localhost) là cách chắc chắn nhất để thư xác nhận đi sai chỗ.
    const { data, error } = await auth.auth.signUp({ email, password,
      ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}) });
    if (error || !data.user?.id || data.user.identities?.length === 0) {
      console.warn("[supplier-signup] Auth rejected signup", error?.message ?? "duplicate account");
      return fail("Không tạo được tài khoản. Nếu email đã dùng, hãy đăng nhập hoặc liên hệ Vexim.", 409);
    }
    authId = data.user.id;
    // Supabase trả session (hoặc user đã có email_confirmed_at) khi dự án đang tắt
    // Confirm email. Đó là cấu hình hợp lệ để chạy thử: tài khoản dùng được ngay.
    needsEmailConfirmation = !data.session && !data.user.email_confirmed_at;
    if (needsEmailConfirmation && !emailRedirectTo) {
      // Có gửi thư mà đường dẫn lại không an toàn → không giữ tài khoản nửa vời.
      await auth.auth.admin.deleteUser(authId);
      return fail("URL xác nhận email không hợp lệ. Quản trị viên cần cấu hình đường dẫn HTTPS /login, không dùng localhost trên máy chủ.", 503);
    }
  } catch (error) {
    console.error("[supplier-signup] Auth unavailable", error);
    return fail("Không tạo được tài khoản. Vui lòng thử lại sau.", 503);
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
    return NextResponse.json({
      ok: true,
      emailVerification: needsEmailConfirmation ? "required" : "not_required",
      message: needsEmailConfirmation
        ? "Tài khoản đã tạo. Hãy xác nhận email, đăng nhập ở trang chung rồi khai thông tin doanh nghiệp trong cổng nhà cung cấp."
        : "Tài khoản đã tạo. Đăng nhập ngay bằng email và mật khẩu vừa đặt rồi khai thông tin doanh nghiệp trong cổng nhà cung cấp.",
    });
  } catch (error) {
    console.error("[supplier-signup] app user failed", error);
    if (authId) await auth.auth.admin.deleteUser(authId).catch((e) => console.error("[supplier-signup] Auth cleanup failed", e));
    return fail("Không lưu được tài khoản. Vui lòng thử lại hoặc liên hệ Vexim.", 503);
  }
}
