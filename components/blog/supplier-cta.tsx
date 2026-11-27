import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Lời kêu gọi cho bài tiếng Việt: doanh nghiệp Việt đăng ký bán hàng cho người mua quốc tế. */
export function SupplierCta({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg bg-ink-900 p-5 text-white ${className}`}>
      <p className="text-[12px] font-bold uppercase tracking-wide text-slate-300">Dành cho doanh nghiệp Việt</p>
      <p className="mt-2 text-[17px] leading-snug font-bold">Bán nông sản, thực phẩm cho người mua quốc tế</p>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-300">
        Đăng ký miễn phí, Vexim xác minh hồ sơ trong 1 ngày làm việc. Sau đó bạn đăng sản phẩm và nhận yêu cầu báo giá.
      </p>
      <Link
        href="/supplier/register?type=supplier"
        className="mt-4 flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-brand-700"
      >
        Đăng ký bán hàng
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
