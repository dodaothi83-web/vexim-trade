import Link from "next/link";
import { getStore } from "@/lib/db";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { cookies } from "next/headers";
import { GOOGLE_SIGNUP_COOKIE, verifyGoogleSignupTicket } from "@/lib/auth/google-oauth";

import { SupplierApplicationForm } from "./supplier-application-form";

export const metadata = { title: "Đăng ký doanh nghiệp | Vexim Trade", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function SupplierApplyPage() {
  const google = verifyGoogleSignupTicket((await cookies()).get(GOOGLE_SIGNUP_COOKIE)?.value);
  const categories = categoryProposalOptions(await getStore().listCategories({ publishedOnly: true }).catch(() => []));
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
    <Link href="/for-suppliers" className="text-sm font-semibold text-brand-700">← Dành cho nhà cung cấp</Link>
    <div className="mt-7 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Vexim Trade · Doanh nghiệp</p>
      <h1 className="mt-2 text-3xl font-black text-ink-900">Đăng ký hồ sơ nhà cung cấp</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">Điền thông tin tạo trang nhà cung cấp ngay trong lần đăng ký đầu tiên. Sau khi xác nhận email, bạn đăng nhập để theo dõi trạng thái chờ Vexim xét duyệt tài khoản. Hồ sơ và sản phẩm không tự công khai.</p>
      <SupplierApplicationForm googleEmail={google?.email} categories={categories} />
    </div>
  </main>;
}
