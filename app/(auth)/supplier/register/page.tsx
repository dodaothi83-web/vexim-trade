import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SupplierAccountForm } from "./supplier-account-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tạo tài khoản nhà cung cấp", robots: { index: false, follow: false } };

export default async function SupplierRegisterPage({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  const session = await getSession();
  if (session) redirect(session.role === "supplier" ? "/supplier/portal" : "/crm/dashboard");
  const { oauth } = await searchParams;
  const oauthMessages: Record<string, string> = {
    unavailable: "Google OAuth chưa được cấu hình trên tên miền này. Bạn có thể tạo tài khoản bằng email.",
    origin: "Tên miền này chưa được phép dùng Google OAuth. Vui lòng dùng email hoặc liên hệ Vexim.",
    cancelled: "Đăng ký Google đã bị hủy hoặc hết hạn. Vui lòng thử lại.",
    unverified: "Google chưa xác thực email. Vui lòng xác thực rồi thử lại.",
    failed: "Không hoàn tất được đăng ký Google. Vui lòng thử lại hoặc dùng email.",
  };
  return <>
    <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Nhà cung cấp · Bước 1/2</p>
    <h1 className="mt-2 text-xl font-black text-ink-900">Tạo tài khoản</h1>
    <p className="mt-2 text-sm leading-6 text-ink-600">Đăng ký bằng email hoặc Google. Sau khi đăng nhập, bạn cần khai hồ sơ doanh nghiệp trong cổng nhà cung cấp để Vexim xét duyệt. Chưa có quyền quản lý sản phẩm hoặc xem RFQ.</p>
    {oauth && oauthMessages[oauth] && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{oauthMessages[oauth]}</p>}
    <SupplierAccountForm />
    <p className="mt-5 text-center text-xs text-ink-600">Đã có tài khoản? <Link href="/login" className="font-semibold text-brand-700 underline">Đăng nhập ở form chung</Link></p>
  </>;
}
