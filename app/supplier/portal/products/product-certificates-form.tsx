"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Clock3 } from "lucide-react";
import { FilePicker } from "@/components/file-picker";
import { certificateLabel, certificateLinkable, type ProductCertificateState } from "@/lib/products/product-certificates";
import { requestProductCertificatesAction, type CertificateRequestResult } from "../product-certificate-actions";

export interface ProductCertificateOption {
  id: string;
  name: string;
  issuer?: string | null;
  valid_until?: string | null;
  state: ProductCertificateState;
}

const INITIAL: CertificateRequestResult = { ok: true, message: "" };

/** Bốn loại hồ sơ L1 nhà cung cấp hay nộp nhất, dùng đúng mã của mục Giấy tờ. */
const QUICK_CERT_TYPES = [
  { key: "haccp_or_brc", label: "HACCP / BRC / ISO 22000" },
  { key: "food_safety", label: "Giấy chứng nhận ATTP" },
  { key: "product_certs", label: "Chứng chỉ sản phẩm (Halal, Organic, FDA…)" },
  { key: "export_license", label: "Giấy phép xuất khẩu" },
] as const;

/**
 * Nhà cung cấp xin gắn chứng nhận đã nộp vào sản phẩm. Danh sách lấy từ hồ sơ
 * Giấy tờ L1, không cho tự khai chứng nhận mới.
 *
 * Thiếu chứng nhận thì tải ngay trong khối này: tệp đi thẳng lên máy chủ bằng
 * fetch nên trang không chuyển đi đâu, dữ liệu đang nhập ở các khối phía trên
 * vẫn còn nguyên.
 */
export function ProductCertificatesForm({ productId, certificates }: { productId: string; certificates: ProductCertificateOption[] }) {
  const [result, action, pending] = useActionState(
    async (_previous: CertificateRequestResult, form: FormData) => requestProductCertificatesAction(form),
    INITIAL,
  );
  const [justUploaded, setJustUploaded] = useState<ProductCertificateOption[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Bản máy chủ thắng bản vừa tải: cùng id thì giữ trạng thái duyệt mới nhất.
  const known = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  for (const certificate of justUploaded) if (!known.has(certificate.id)) known.set(certificate.id, certificate);
  const all = [...known.values()];

  const approved = all.filter((certificate) => certificate.state === "approved");
  const pendingLinks = all.filter((certificate) => certificate.state === "requested");
  const available = all.filter((certificate) => certificate.state === "none");
  const linkable = available.filter((certificate) => certificateLinkable(certificate));

  async function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    setUploadBusy(true);
    setUploadMessage(null);
    try {
      const response = await fetch("/api/supplier-portal/certificates", {
        method: "POST",
        body: new FormData(element),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        certificate?: { id: string; name: string; issuer?: string | null; valid_until: string | null };
      };
      if (response.ok && payload.ok && payload.certificate) {
        const uploaded = payload.certificate;
        setJustUploaded((previous) => [
          ...previous.filter((certificate) => certificate.id !== uploaded.id),
          { id: uploaded.id, name: uploaded.name, issuer: uploaded.issuer ?? null, valid_until: uploaded.valid_until, state: "none" },
        ]);
        setUploadMessage({ ok: true, text: payload.message ?? "Đã tải chứng nhận." });
        element.reset();
      } else {
        setUploadMessage({ ok: false, text: payload.message ?? "Không lưu được tệp." });
      }
    } catch {
      setUploadMessage({ ok: false, text: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Chứng nhận cho sản phẩm này">
      <h2 className="text-[15px] font-black text-ink-900">Chứng nhận cho sản phẩm này</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-600">
        Chọn chứng nhận đã nộp, hoặc tải thêm ngay tại đây. Vexim duyệt liên kết trước khi hiện trên trang sản phẩm.
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

      {linkable.length > 0 && <form action={action} className="mt-4 space-y-2.5">
        <input type="hidden" name="product_id" value={productId} />
        <fieldset className="space-y-1.5">
          <legend className="text-[12px] font-semibold text-ink-700">Chứng nhận có thể gắn</legend>
          {linkable.map((certificate) => <label key={certificate.id} className="flex items-start gap-2 text-[13px] text-ink-800">
            <input type="checkbox" name="certificate_ids" value={certificate.id} defaultChecked={false}
              className="mt-0.5 size-4 shrink-0 accent-brand-700" />
            <span>{certificateLabel(certificate)}</span>
          </label>)}
        </fieldset>
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Đang gửi…" : "Gửi Vexim duyệt gắn"}
        </button>
      </form>}

      {linkable.length === 0 && approved.length === 0 && pendingLinks.length === 0 && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[12.5px] text-ink-700">
        Bạn chưa có chứng nhận còn hạn. Tải giấy tờ ngay bên dưới, không cần rời trang.
      </p>}

      {result.message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
        {result.message}
      </p>}

      <form onSubmit={onUpload} className="mt-4 grid gap-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3.5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <p className="text-[11px] font-bold tracking-wider text-brand-900 uppercase">Tải chứng nhận mới</p>
          <p className="mt-0.5 text-[11.5px] leading-4 text-ink-600">Hệ thống tự đọc tên đơn vị và ngày hết hạn. Tệp không tự hiện công khai.</p>
        </div>
        <label className="block text-[12px]">
          <span className="mb-1 block font-semibold text-ink-800">Loại chứng nhận</span>
          <select name="checklist_key" className="input text-sm" defaultValue="haccp_or_brc">
            {QUICK_CERT_TYPES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-[12px]">
          <span className="mb-1 block font-semibold text-ink-800">Tên trên giấy (không bắt buộc)</span>
          <input name="label" type="text" maxLength={140} placeholder="VD: ISO 22000:2018" className="input text-sm" />
        </label>
        <div className="block sm:col-span-1">
          <FilePicker name="file" accept=".pdf,image/jpeg,image/png,image/webp" required busy={uploadBusy}
            compact title="Tệp PDF hoặc ảnh" hint="Tối đa 15 MB." />
        </div>
        <div className="flex items-end sm:col-span-3">
          <button type="submit" disabled={uploadBusy} className="btn btn-primary btn-sm">
            {uploadBusy ? "Đang tải lên…" : "Tải lên"}
          </button>
        </div>
        {uploadMessage && <p role="status" className={`text-[12px] font-medium sm:col-span-3 ${uploadMessage.ok ? "text-emerald-800" : "text-rose-700"}`}>
          {uploadMessage.text}
        </p>}
      </form>
    </section>
  );
}
