import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { supabaseAuthReachable } from "@/lib/auth/authenticate";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đăng nhập" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  const store = getStore();
  let needsSetup = false;
  try {
    needsSetup = (await store.countUsers()) === 0;
  } catch {
    needsSetup = false;
  }
  const supabaseOk = await supabaseAuthReachable();

  return (
    <>
      <h1 className="text-[18px] font-black text-ink-900">Đăng nhập</h1>
      <p className="mt-1 mb-5 text-[12.5px] text-ink-500">
        {supabaseOk
          ? "Xác thực qua Supabase Auth. Tài khoản phải được cấp quyền trong app."
          : "Chưa kết nối được Supabase — hệ thống dùng mật khẩu nội bộ (dự phòng) để đăng nhập."}
      </p>
      <LoginForm needsSetup={needsSetup} />
    </>
  );
}
