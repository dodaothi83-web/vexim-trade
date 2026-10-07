import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { supabaseKeyRole } from "@/lib/db/supabase";
import { getSession } from "@/lib/auth/session";
import { supabaseAuthReachable } from "@/lib/auth/authenticate";
import { authDiagnostics, hasProblem } from "@/lib/auth/diagnostics";
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
            <code>SUPABASE_SERVICE_ROLE_KEY</code> vào <code>.env.local</code> rồi khởi động lại app.
            Chính sách RLS kiểu “người dùng đã đăng nhập chỉ xem hồ sơ của mình”{" "}
            <strong>không áp dụng cho máy chủ app</strong> — máy chủ luôn truy vấn bằng khoá của app.
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
        <strong>không phải anon</strong>) vào <code>.env.local</code> rồi khởi động lại app. Đừng tắt
        RLS để dùng khoá anon — bảng này giữ mật khẩu đã băm.
      </>
    ),
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const sp = await searchParams;
  const reason = REASON_BOX[sp.reason ?? ""];

  const store = getStore();
  let needsSetup = false;
  try {
    needsSetup = (await store.countUsers()) === 0;
  } catch {
    needsSetup = false;
  }
  const supabaseOk = await supabaseAuthReachable();
  const keyRole = supabaseKeyRole();
  const diag = await authDiagnostics();
  const problem = hasProblem(diag);

  return (
    <>
      <h1 className="text-[18px] font-black text-ink-900">Đăng nhập</h1>
      <p className="mt-1 mb-5 text-[12.5px] text-ink-500">
        {supabaseOk
          ? needsSetup
            ? "Xác thực qua Supabase Auth. Hệ thống chưa có tài khoản nào — tài khoản Supabase đăng nhập đầu tiên sẽ trở thành quản trị viên."
            : "Xác thực qua Supabase Auth. Tài khoản phải được cấp quyền trong app."
          : "Chưa kết nối được Supabase — hệ thống dùng mật khẩu nội bộ (dự phòng) để đăng nhập."}
      </p>

      {reason && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
          <p className="font-semibold">{reason.title}</p>
          <div className="mt-1">{reason.body}</div>
        </div>
      )}

      {keyRole === "anon" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-900">
          <p className="font-semibold">
            Khoá Supabase đang cấu hình là <code>anon</code> — đăng nhập sẽ bị đẩy ra liên tục.
          </p>
          <p className="mt-1">
            Máy chủ app cần <code>SUPABASE_SERVICE_ROLE_KEY</code> (khoá service_role) để đọc/ghi bảng{" "}
            <code>app_users</code> khi bảng này bật Row Level Security. Thêm vào{" "}
            <code>.env.local</code> rồi khởi động lại app.
          </p>
        </div>
      )}

      <LoginForm needsSetup={needsSetup} />

      <details
        open={problem}
        className="mt-5 rounded-lg border border-ink-200 bg-ink-50/70 px-3 py-2.5 text-[12px] text-ink-700"
      >
        <summary className="cursor-pointer font-semibold text-ink-800">
          Chẩn đoán đăng nhập {problem ? "— đang có mục cần xử lý" : ""}
        </summary>
        <ul className="mt-2.5 space-y-2">
          {diag.map((row) => (
            <li key={row.label}>
              <div className="flex items-start gap-1.5">
                <span className={row.ok ? "text-emerald-600" : "text-red-600"}>{row.ok ? "✔" : "✖"}</span>
                <span>
                  <strong className="font-semibold">{row.label}:</strong> {row.value}
                </span>
              </div>
              {!row.ok && row.hint && (
                <p className="mt-0.5 ml-4 leading-relaxed text-ink-500">{row.hint}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[11.5px] text-ink-500">
          Nếu vẫn bị đẩy về trang này, chụp lại phần chẩn đoán này để xem tiếp.
        </p>
      </details>
    </>
  );
}
