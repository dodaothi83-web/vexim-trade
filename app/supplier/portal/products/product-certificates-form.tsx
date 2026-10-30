"use client";

import { useActionState } from "react";
import { BadgeCheck, Clock3 } from "lucide-react";
import { certificateLabel, type ProductCertificateState } from "@/lib/products/product-certificates";
import { requestProductCertificatesAction, type CertificateRequestResult } from "../product-certificate-actions";

export interface ProductCertificateOption {
  id: string;
  name: string;
  issuer?: string | null;
  valid_until?: string | null;
  state: ProductCertificateState;
}

const INITIAL: CertificateRequestResult = { ok: true, message: "" };

/**
 * Nhà cung cấp xin gắn chứng nhận đã nộp vào sản phẩm. Danh sách lấy từ hồ sơ
 * Giấy tờ L1, không cho tự khai chứng nhận mới.
 */
export function ProductCertificatesForm({ productId, certificates }: { productId: string; certificates: ProductCertificateOption[] }) {
  const [result, action, pending] = useActionState(
    async (_previous: CertificateRequestResult, form: FormData) => requestProductCertificatesAction(form),
    INITIAL,
  );
  const approved = certificates.filter((certificate) => certificate.state === "approved");
  const pendingLinks = certificates.filter((certificate) => certificate.state === "requested");
  const available = certificates.filter((certificate) => certificate.state === "none");

  return (
    <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Chứng nhận cho sản phẩm này">
      <h2 className="text-[15px] font-black text-ink-900">Chứng nhận cho sản phẩm này</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-600">
        Chọn từ chứng nhận bạn đã nộp ở mục Giấy tờ. Vexim duyệt liên kết trước khi hiện trên trang sản phẩm.
      </p>

      {approved.length > 0 && <ul className="mt-3 space-y-1.5">
        {approved.map((certificate) => <li key={certificate.id} className="flex items-start gap-2 text-[13px] text-ink-800">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>{certificateLabel(certificate)}</span>
          <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Đã duyệt</span>
        </li>)}
      </ul>}

      {pendingLinks.length > 0 && <ul className="mt-3 space-y-1.5">
        {pendingLinks.map((certificate) => <li key={certificate.id} className="flex items-start gap-2 text-[13px] text-ink-700">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span>{certificateLabel(certificate)}</span>
          <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Chờ duyệt</span>
        </li>)}
      </ul>}

      {available.length === 0 && approved.length === 0 && pendingLinks.length === 0 && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[12.5px] text-ink-700">
        Bạn chưa có chứng nhận còn hạn. Tải giấy tờ ở mục Giấy tờ rồi quay lại đây.
      </p>}

      {available.length > 0 && <form action={action} className="mt-4 space-y-2.5">
        <input type="hidden" name="product_id" value={productId} />
        <fieldset className="space-y-1.5">
          <legend className="text-[12px] font-semibold text-ink-700">Chứng nhận có thể gắn</legend>
          {available.map((certificate) => <label key={certificate.id} className="flex items-start gap-2 text-[13px] text-ink-800">
            <input type="checkbox" name="certificate_ids" value={certificate.id} defaultChecked={false}
              className="mt-0.5 size-4 shrink-0 accent-brand-700" />
            <span>{certificateLabel(certificate)}</span>
          </label>)}
        </fieldset>
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Đang gửi…" : "Gửi Vexim duyệt gắn"}
        </button>
      </form>}

      {result.message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
        {result.message}
      </p>}
    </section>
  );
}
