import { redirect } from "next/navigation";
import Link from "next/link";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { supabaseAuthReachable } from "@/lib/auth/authenticate";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đăng nhập" };

/** Lời giải thích khi bị đưa về /login dù cookie phiên vẫn còn */
const REASON_BOX: Record<string, { title: string; body: React.ReactNode }> = {
  not_found: {
    title: "Không tìm thấy tài khoản của bạn",
    body: (
      <>
        Phiên đăng nhập còn hiệu lực nhưng tài khoản không còn trong hệ thống (bị xóa hoặc đổi email).
        Hãy đăng nhập lại; nếu vẫn không được, liên hệ quản trị viên Vexim.
        <AdminHint text="Nếu vừa đổi cấu hình: RLS trên bảng app_users chặn khoá anon cũng gây đúng lỗi này — thêm SUPABASE_SERVICE_ROLE_KEY." />
      </>
    ),
  },
  locked: {
    title: "Tài khoản đã bị tạm khóa",
    body: <>Vui lòng liên hệ quản trị viên Vexim để được mở khóa.</>,
  },
  unreadable: {
    title: "Máy chủ tạm thời không đọc được dữ liệu tài khoản",
    body: (
      <>
        Vui lòng thử lại sau ít phút. Nếu vẫn lỗi, liên hệ quản trị viên Vexim.
        <AdminHint text="Kiểm tra SUPABASE_SERVICE_ROLE_KEY (khoá service_role, không phải anon). Đừng tắt RLS để dùng khoá anon — bảng này giữ mật khẩu đã băm." />
      </>
    ),
  },
};

/** Gợi ý kỹ thuật dành cho quản trị viên — chữ nhỏ, màu nhạt, chỉ hiện trong hộp lỗi. */
function AdminHint({ text }: { text: string }) {
  return <p className="mt-1.5 text-[11.5px] leading-relaxed text-red-700/70">Quản trị viên: {text}</p>;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; oauth?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "supplier" ? "/supplier/portal" : "/");

  const sp = await searchParams;
  const reason = REASON_BOX[sp.reason ?? ""];
  const oauthMessage: Record<string, string> = {
    unavailable: "Đăng nhập bằng Google chưa sẵn sàng — vui lòng dùng email và mật khẩu.",
    origin: "Tên miền này chưa được cấu hình cho Google OAuth. Liên hệ quản trị Vexim.",
    cancelled: "Đăng nhập Google bị hủy hoặc phiên đã hết hạn; vui lòng thử lại.",
    unverified: "Google chưa xác thực email hoặc không trả về danh tính hợp lệ.",
    existing: "Email này đã có tài khoản trong hệ thống. Hãy chọn Đăng nhập với Google ở đây.",
    not_allowed: "Email Google đã được xác thực nhưng chưa được cấp quyền trong hệ thống Vexim, hoặc tài khoản đang bị khóa.",
    failed: "Không hoàn tất được xác thực Google. Vui lòng thử lại.",
    invalid: "Yêu cầu đăng nhập Google không hợp lệ.",
    rate_limited: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
  };

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
      <h1 className={`text-[18px] font-black text-ink-900${supabaseOk ? " mb-5" : ""}`}>Đăng nhập</h1>
      {!supabaseOk && (
        <p className="mt-1 mb-5 text-[12.5px] text-ink-500">
          Đăng nhập bằng Google tạm thời không khả dụng — vui lòng dùng email và mật khẩu.
        </p>
      )}

      {reason && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
          <p className="font-semibold">{reason.title}</p>
          <div className="mt-1">{reason.body}</div>
        </div>
      )}

      {sp.oauth && oauthMessage[sp.oauth] && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{oauthMessage[sp.oauth]}</p>}
      <LoginForm
        needsSetup={needsSetup}
      />
      <p className="mt-5 text-center text-xs text-ink-600">Doanh nghiệp chưa có tài khoản? <Link href="/supplier/register" className="font-semibold text-brand-700 underline">Tạo tài khoản nhà cung cấp</Link></p>
    </>
  );
}
