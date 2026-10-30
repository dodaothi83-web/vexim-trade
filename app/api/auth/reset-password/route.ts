import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { protectPasswordAuth } from "@/lib/auth/abuse-protection";
import { resetSupabaseAccountPassword } from "@/lib/auth/authenticate";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { decodePasswordResetToken, verifyPasswordResetTokenForUser } from "@/lib/auth/password-reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 4096) {
    return fail("Biểu mẫu quá lớn.", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Không đọc được biểu mẫu.");
  }

  const token = String(form.get("token") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");
  const challengeToken = String(form.get("challenge_token") ?? "").trim();

  const decoded = decodePasswordResetToken(token);
  if (!decoded.ok) {
    return fail(
      decoded.reason === "expired"
        ? "Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng gửi lại yêu cầu mới."
        : "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.",
      400,
    );
  }

  const problem = passwordProblem(password);
  if (password.length > 128 || problem) {
    return fail(problem ?? "Mật khẩu cần 8–128 ký tự, gồm cả chữ và số.");
  }
  if (password !== password2) {
    return fail("Hai lần nhập mật khẩu mới không khớp.");
  }

  const protection = await protectPasswordAuth({
    flow: "password-reset",
    headers: request.headers,
    email: decoded.payload.email,
    token: challengeToken,
  });
  if (!protection.ok) return fail(protection.message, protection.status);

  try {
    const store = getStore();
    const user = await store.getUserByEmail(decoded.payload.email);
    if (!user) {
      return fail("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.", 400);
    }

    const verified = verifyPasswordResetTokenForUser(token, user);
    if (!verified.ok) {
      return fail("Liên kết đặt lại mật khẩu đã được sử dụng hoặc không còn hiệu lực.", 400);
    }

    const updatedSupabase = await resetSupabaseAccountPassword(user.email, password);
    if (user.role === "supplier" && store.mode === "supabase" && !updatedSupabase) {
      return fail("Chưa đặt lại được mật khẩu lúc này. Vui lòng thử lại sau.", 503);
    }

    await store.updateUser(user.id, { password_hash: await hashPassword(password) });
    await store
      .addAuditLog({
        actor_id: user.id,
        actor_email: user.email,
        entity: "user",
        entity_id: user.id,
        action: "user.password_reset",
        before: null,
        after: { via: "email_reset_link", supabase_updated: updatedSupabase },
      })
      .catch((err) => console.error("[reset-password] audit log failed", err));

    return NextResponse.json(
      { ok: true, message: "Đã đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới." },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[reset-password] unexpected error", err);
    return fail("Chưa đặt lại được mật khẩu lúc này. Vui lòng thử lại sau.", 503);
  }
}
