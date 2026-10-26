import Link from "next/link";
import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { supabaseAuthReachable } from "@/lib/auth/authenticate";
import { SetupForm } from "@/components/setup-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tạo tài khoản quản trị" };

export default async function SetupPage() {
  const store = getStore();
  let total = 0;
  let missingTable = false;
  try {
    total = await store.countUsers();
  } catch (err) {
    // Chưa chạy supabase/schema.sql → bảng app_users chưa có
    missingTable = String(err instanceof Error ? err.message : err)
      .toLowerCase()
      .includes("app_users");
  }
  if (total > 0) redirect("/login");

  const session = await getSession();
  if (session) redirect("/");

  const supabaseOk = await supabaseAuthReachable();

  return (
    <>
      <h1 className="text-[18px] font-black text-ink-900">Tạo tài khoản quản trị đầu tiên</h1>
      <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">
        Trang này chỉ hiện khi hệ thống chưa có tài khoản nào. Tài khoản đầu tiên luôn có vai trò{" "}
        <strong className="text-ink-700">Quản trị</strong> — sau đó bạn thêm tài khoản cho nhân viên
        trong <strong className="text-ink-700">Cài đặt → Người dùng &amp; phân quyền</strong>.
      </p>

      {missingTable && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-900">
          Cơ sở dữ liệu chưa có bảng <code>app_users</code>. Mở Supabase → <strong>SQL Editor</strong>,
          chạy lại toàn bộ <code>supabase/schema.sql</code> rồi tải lại trang này.
        </p>
      )}

      <p
        className={
          supabaseOk
            ? "mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-900"
            : "mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"
        }
      >
        {supabaseOk ? (
          <>
            Đã kết nối Supabase Auth — tài khoản này sẽ được tạo ở <strong>cả hai nơi</strong> (Supabase
            và cơ sở dữ liệu của app).
          </>
        ) : (
          <>
            Chưa kết nối được Supabase từ máy chạy app, nên tài khoản được tạo ở dạng{" "}
            <strong>nội bộ (dự phòng)</strong> và dùng được ngay. Khi có mạng, vào Cài đặt → Người
            dùng để tạo lại bên Supabase.
          </>
        )}
      </p>

      <SetupForm />

      <p className="mt-4 text-center text-[12px] text-ink-500">
        Đã có tài khoản rồi?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </>
  );
}
