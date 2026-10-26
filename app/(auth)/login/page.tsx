import { redirect } from "next/navigation";
import Link from "next/link";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { supabaseAuthReachable } from "@/lib/auth/authenticate";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Đăng nhập" };

/** Lời giải thích khi bị đưa về /login dù cookie phiên vẫn còn */
const REASON_BOX: Record<string, { title: string; body: React.ReactNode }> = {
  not_found: {
    title: "Phiên đăng nhập hợp lệ nhưng không tìm thấy tài khoản trong bảng app_users",
    body: (
      <>
        Hai khả năng thường gặp:
        <ul className="mt-1 ml-4 list-disc space-y-1">
          <li>
            Máy chủ đang kết nối Supabase bằng <strong>khoá anon</strong> trong khi bảng{" "}
            <code>app_users</code> bật <strong>Row Level Security</strong>. RLS ẩn dòng chứ không báo
            lỗi, nên app tưởng tài khoản không tồn tại. Cách sửa: thêm{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> vào biến môi trường rồi khởi động lại app. Chính
            sách RLS kiểu “người dùng đã đăng nhập chỉ xem hồ sơ của mình” <strong>không áp dụng cho
            máy chủ app</strong> — máy chủ luôn truy vấn bằng khoá của app.
          </li>
          <li>Tài khoản vừa bị xoá hoặc email trong bảng app_users khác với email đang đăng nhập.</li>
        </ul>
      </>
    ),
  },
  locked: {
    title: "Tài khoản đã bị tạm khoá",
    body: <>Nhờ quản trị viên mở khoá trong Cài đặt → Người dùng &amp; phân quyền.</>,
  },
  unreadable: {
    title: "Máy chủ không đọc được bảng app_users",
    body: (
      <>
        Thường là do bảng <code>app_users</code> bật Row Level Security nhưng khoá Supabase đang dùng
        không bỏ qua được RLS. Thêm <code>SUPABASE_SERVICE_ROLE_KEY</code> (khoá service_role,{" "}
        <strong>không phải anon</strong>) vào biến môi trường rồi khởi động lại app. Đừng tắt RLS để
        dùng khoá anon — bảng này giữ mật khẩu đã băm.
      </>
    ),
  },
};

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
    unavailable: "Chưa cấu hình Google OAuth hoặc Supabase; vui lòng đăng nhập bằng mật khẩu.",
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
      <h1 className="text-[18px] font-black text-ink-900">Đăng nhập</h1>
      <p className="mt-1 mb-5 text-[12.5px] text-ink-500">
        {supabaseOk
          ? needsSetup
            ? "Xác thực qua Supabase Auth. Hệ thống chưa có tài khoản nào — tạo quản trị viên qua /setup trước khi dùng Google."
            : "Đăng nhập chung qua Supabase Auth. Tài khoản NCC mới chỉ dùng được dashboard và form hồ sơ; Vexim phải duyệt trước khi mở các chức năng."
          : "Chưa kết nối được Supabase. Nhân viên có thể dùng mật khẩu nội bộ (dự phòng); tài khoản doanh nghiệp cần Supabase và email đã xác nhận."}
      </p>

      {reason && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
          <p className="font-semibold">{reason.title}</p>
          <div className="mt-1">{reason.body}</div>
        </div>
      )}

      {sp.oauth && oauthMessage[sp.oauth] && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{oauthMessage[sp.oauth]}</p>}
      <LoginForm
        needsSetup={needsSetup}
        turnstileSiteKey={turnstileSiteKey()}
      />
      <p className="mt-5 text-center text-xs text-ink-600">Doanh nghiệp chưa có tài khoản? <Link href="/supplier/register" className="font-semibold text-brand-700 underline">Tạo tài khoản nhà cung cấp</Link></p>
    </>
  );
}
