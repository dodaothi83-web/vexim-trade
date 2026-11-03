import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthSplitShell } from "@/components/auth-split-shell";
import { SupplierAccountForm } from "./supplier-account-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tạo tài khoản nhà cung cấp", robots: { index: false, follow: false } };

export default async function SupplierRegisterPage({ searchParams }: { searchParams: Promise<{ oauth?: string; type?: string }> }) {
  const session = await getSession();
  if (session) redirect(session.role === "supplier" ? "/supplier/portal" : "/crm/dashboard");
  const { oauth, type } = await searchParams;
  // Bước 1 luôn là chọn loại tài khoản. Vào thẳng URL này (bookmark, link cũ) thì quay về
  // màn chọn để người mua không rơi nhầm vào biểu mẫu đăng ký bán hàng.
  if (type !== "supplier") redirect("/register");
  const oauthMessages: Record<string, string> = {
    unavailable: "Google OAuth chưa được cấu hình trên tên miền này. Bạn có thể tạo tài khoản bằng email.",
    origin: "Tên miền này chưa được phép dùng Google OAuth. Vui lòng dùng email để đăng ký.",
    cancelled: "Đăng ký Google đã bị hủy hoặc hết hạn. Vui lòng thử lại.",
    unverified: "Google chưa xác thực email. Vui lòng xác thực rồi thử lại.",
    failed: "Không hoàn tất được đăng ký Google. Vui lòng thử lại hoặc dùng email.",
    rate_limited: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
  };
  return <AuthSplitShell
    caption="Tạo tài khoản nhà cung cấp, sau đó hoàn thiện hồ sơ doanh nghiệp để Vexim duyệt."
    points={[
      "Bước 1 tạo tài khoản, bước 2 khai hồ sơ doanh nghiệp.",
      "Hồ sơ cần Vexim duyệt trước khi mở quản lý sản phẩm và nhận yêu cầu báo giá.",
      "Miễn phí trong chương trình nhà cung cấp tiên phong.",
    ]}
    note="Hồ sơ cần Vexim duyệt trước khi mở quản lý sản phẩm và nhận yêu cầu báo giá."
  >
    <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Nhà cung cấp · Bước 1/2</p>
    <h1 className="mt-2 text-xl font-black text-ink-900">Tạo tài khoản</h1>
    {/* Giải thích quy trình nằm ở màn chọn loại tài khoản; ở đây chỉ để form thuần. */}
    {oauth && oauthMessages[oauth] && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{oauthMessages[oauth]}</p>}
    <SupplierAccountForm />
    <p className="mt-5 text-center text-xs text-ink-600">Đã có tài khoản? <Link href="/login" className="font-semibold text-brand-700 underline">Đăng nhập</Link></p>
    <p className="mt-2 text-center text-xs text-ink-500">Bạn là người mua? <Link href="/rfq" className="font-semibold text-brand-700 underline">Gửi yêu cầu báo giá</Link> không cần tài khoản, hoặc <Link href="/register" className="font-semibold text-brand-700 underline">đổi loại tài khoản</Link>.</p>
  </AuthSplitShell>;
}
