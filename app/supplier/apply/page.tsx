import Link from "next/link";

import { SupplierApplicationForm } from "./supplier-application-form";

export const metadata = { title: "Đăng ký doanh nghiệp | Vexim Trade", robots: { index: false, follow: false } };

export default function SupplierApplyPage() {
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
    <Link href="/for-suppliers" className="text-sm font-semibold text-brand-700">← Dành cho nhà cung cấp</Link>
    <div className="mt-7 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Vexim Trade · Doanh nghiệp</p>
      <h1 className="mt-2 text-3xl font-black text-ink-900">Đăng ký hồ sơ nhà cung cấp</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">Tạo tài khoản trước, xác nhận email rồi đăng nhập để hoàn thiện hồ sơ doanh nghiệp trên dashboard. Tài khoản sẽ chờ Vexim xác nhận thông tin trước khi sử dụng; việc này không tự xác minh hoặc công khai nhà cung cấp.</p>
      <SupplierApplicationForm />
    </div>
  </main>;
}
