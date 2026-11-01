import { Check, ShieldCheck } from "lucide-react";

/**
 * Khối "Bạn nhận được gì" dùng chung cho cả ba bước xác minh.
 *
 * Đặt trong cột hẹp bên cạnh nội dung, cùng chỗ với các thẻ tóm tắt, để nhà cung
 * cấp đọc được giá trị mà không phải cuộn qua biểu mẫu. Chỉ nói những gì người mua
 * nhìn thấy và những gì đang chạy trong code: huy hiệu theo từng mức, cách đọc
 * từng mức, tầng xếp hạng theo số cấp đã duyệt, bộ lọc của người mua, nhận xét đã
 * duyệt. Không hứa đơn hàng, không nói nhân viên sẽ giới thiệu nhà cung cấp.
 */
export function VerificationBenefits({ items }: { items: readonly string[] }) {
  return <section aria-labelledby="benefits-title" className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
    <h2 id="benefits-title" className="flex items-center gap-1.5 text-[13px] font-bold text-brand-900">
      <ShieldCheck className="h-4 w-4" aria-hidden="true" />Bạn nhận được gì
    </h2>
    <ul className="mt-2 space-y-1 text-[11.5px] leading-5 text-ink-700">
      {items.map((item) => <li key={item} className="flex items-start gap-1.5">
        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
        <span className="min-w-0">{item}</span>
      </li>)}
    </ul>
  </section>;
}
