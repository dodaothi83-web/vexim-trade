import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Illustration explains independent parties connecting; never a transaction guarantee. */
export function ConnectionOverview({ isVi }: { isVi: boolean }) {
  const steps = isVi ? [
    ["Tìm nguồn phù hợp", "Khám phá sản phẩm và hồ sơ nhà cung cấp theo nhu cầu của bạn."],
    ["Đối chiếu thông tin", "Xem thông số và phạm vi kiểm tra được nêu trên từng hồ sơ."],
    ["Kết nối trực tiếp", "Trao đổi với nhà cung cấp; hai bên tự thỏa thuận điều kiện và hợp đồng."],
  ] : [
    ["Find a potential fit", "Explore products and supplier profiles for your sourcing needs."],
    ["Review the details", "Compare specifications and the stated scope of checks on each profile."],
    ["Connect directly", "Discuss requirements with the supplier. Both parties agree terms and contracts directly."],
  ];
  return <section aria-labelledby="home-connection-title" className="border-t border-slate-200 bg-slate-50 py-12 sm:py-16">
    <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">{isVi ? "Kết nối, không bán thay" : "A platform for connections"}</p>
        <h2 id="home-connection-title" className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{isVi ? "Đúng nhu cầu. Đúng đối tác." : "Your requirements. The right connections."}</h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-ink-600">{isVi ? "Vexim kết nối người mua với nhà cung cấp tại Việt Nam. Vexim không phải bên bán hàng và không thực hiện giao dịch thay hai bên." : "Vexim connects buyers with suppliers in Vietnam. Vexim is not the seller and does not execute transactions on either party’s behalf."}</p>
        <ol className="mt-6 space-y-5">{steps.map(([title, body], i) => <li key={title} className="flex gap-3"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-white text-xs font-bold text-brand-700">{i + 1}</span><div><h3 className="text-sm font-semibold text-ink-900">{title}</h3><p className="mt-1 max-w-xl text-sm leading-6 text-ink-600">{body}</p></div></li>)}</ol>
        <Link href={isVi ? "/how-it-works?lang=vi" : "/how-it-works"} className="mt-6 inline-flex items-center gap-2 rounded-md py-2 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700">{isVi ? "Tìm hiểu cách hoạt động" : "See how it works"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <Image src="/images/vexim-buyer-supplier-connection.webp" alt="" width={1200} height={805} sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) 576px, 50vw" className="h-auto w-full object-contain" />
      </div>
    </div>
  </section>;
}
