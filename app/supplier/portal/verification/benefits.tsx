import { Check, ShieldCheck } from "lucide-react";

/**
 * Khối "Bạn nhận được gì" dùng chung cho hai trang tự gửi L2 và L3.
 *
 * Chỉ ba gạch đầu dòng, mỗi dòng một giá trị người mua nhìn thấy được. Không hứa
 * đơn hàng, không nói "lên top": mọi ý ở đây đều là thứ đang chạy trong code
 * (tầng xếp hạng theo số cấp đã duyệt, huy hiệu trên hồ sơ, bộ lọc của người mua).
 */
export function VerificationBenefits({ items }: { items: readonly string[] }) {
  return <section aria-labelledby="benefits-title" className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
    <h2 id="benefits-title" className="flex items-center gap-1.5 text-[13px] font-bold text-brand-900">
      <ShieldCheck className="h-4 w-4" aria-hidden="true" />Bạn nhận được gì
    </h2>
    <ul className="mt-2 grid gap-1.5 text-[11.5px] leading-5 text-ink-700 sm:grid-cols-3">
      {items.map((item) => <li key={item} className="flex items-start gap-1.5">
        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
        <span className="min-w-0">{item}</span>
      </li>)}
    </ul>
  </section>;
}
