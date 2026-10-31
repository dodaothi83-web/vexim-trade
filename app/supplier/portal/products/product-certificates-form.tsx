"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Clock3, Lock, MoveRight } from "lucide-react";
import { FilePicker } from "@/components/file-picker";
import { certificateLabel } from "@/lib/products/product-certificates";
import {
  requestProductCertificatesAction,
  setProductCertificateOptoutAction,
  type CertificateRequestResult,
} from "../product-certificate-actions";

export interface ProductCertificateOption {
  id: string;
  name: string;
  issuer?: string | null;
  valid_until?: string | null;
  /** Loại giấy người mua thấy (HACCP, Halal…), null khi chưa phân loại. */
  schemeLabel?: string | null;
  state: "approved" | "requested" | "none";
  /** Đã có bản gia hạn mới hơn: không gia hạn lại. */
  superseded?: boolean;
  /** Giấy chất lượng đã xếp loại: gắn phạm vi được. */
  scopeable?: boolean;
  /** Phạm vi gắn thẳng sản phẩm này (nhân viên đã xác nhận). */
  directScope?: boolean;
  /** Thừa hưởng từ danh mục nào. */
  inheritedFrom?: string | null;
  /** Nhà cung cấp đang bỏ nhận giấy thừa hưởng cho sản phẩm này. */
  optedOut?: boolean;
  /** Sản phẩm đang hiển thị giấy này cho người mua. */
  applies?: boolean;
  expired?: boolean;
}

const INITIAL: CertificateRequestResult = { ok: true, message: "" };

/**
 * Chứng nhận áp dụng cho sản phẩm.
 *
 * Nhà cung cấp chỉ tải giấy lên kho chung, không chọn ngăn: nhân viên Vexim phân loại
 * (loại giấy, đơn vị đứng tên, hạn, công khai/nội bộ, phạm vi). Ở đây họ thấy giấy nào
 * đang áp cho sản phẩm này — kể cả giấy **thừa hưởng** từ danh mục — và bỏ tick được
 * giấy không đúng cho sản phẩm. Giấy ngoài phạm vi hiện mờ, kèm nút xin mở rộng.
 *
 * Tải tệp đi thẳng bằng fetch nên trang không chuyển đi đâu, dữ liệu đang nhập ở các
 * khối phía trên vẫn còn nguyên.
 */
export function ProductCertificatesForm({
  productId, certificates, supplierType = null, partnerContractApproved = false, partnerFactoryName = null,
}: {
  productId: string;
  certificates: ProductCertificateOption[];
  supplierType?: "manufacturer" | "trading" | "cooperative" | null;
  partnerContractApproved?: boolean;
  partnerFactoryName?: string | null;
}) {
  const [result, action, pending] = useActionState(
    async (_previous: CertificateRequestResult, form: FormData) => requestProductCertificatesAction(form),
    INITIAL,
  );
  const [optResult, optAction, optPending] = useActionState(
    async (_previous: CertificateRequestResult, form: FormData) => setProductCertificateOptoutAction(form),
    INITIAL,
  );
  // Giấy đứng tên ai thì dùng được: nhà máy phải là giấy của chính mình; đơn vị thương mại
  // chỉ dùng giấy nhà máy khác khi đã xác thực L2 nhà máy đối tác, và vẫn chờ Vexim đối chiếu.
  const holderRule = supplierType === "trading"
    ? (partnerContractApproved
      ? { blocked: false, text: partnerFactoryName
        ? `Giấy phải đứng tên nhà máy đối tác: ${partnerFactoryName}.`
        : "Giấy đứng tên nhà máy đối tác sẽ được đối chiếu hợp đồng trước khi đăng." }
      : { blocked: true, text: "Chưa xác thực nhà máy đối tác: giấy đứng tên nhà máy khác chưa dùng được." })
    : supplierType === "manufacturer" || supplierType === "cooperative"
      ? { blocked: false, text: "Chứng nhận phải đứng tên nhà máy của bạn." }
      : null;
  const [justUploaded, setJustUploaded] = useState<ProductCertificateOption[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Bản máy chủ thắng bản vừa tải: cùng id thì giữ trạng thái duyệt mới nhất.
  const known = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  for (const certificate of justUploaded) if (!known.has(certificate.id)) known.set(certificate.id, certificate);
  const all = [...known.values()];

  // Giấy chất lượng đã xếp loại mới gắn sản phẩm được; giấy pháp lý và giấy theo lô thì không.
  const quality = all.filter((certificate) => certificate.scopeable !== false && (certificate.scopeable || certificate.applies));
  const applied = quality.filter((certificate) => certificate.applies || certificate.directScope || certificate.optedOut);
  const outside = quality.filter((certificate) => !certificate.applies && !certificate.optedOut && !certificate.directScope);
  const pendingUploads = all.filter((certificate) => justUploaded.some((item) => item.id === certificate.id));
  const others = all.filter((certificate) => !quality.includes(certificate) && !pendingUploads.includes(certificate));

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
          {
            id: uploaded.id, name: uploaded.name, issuer: uploaded.issuer ?? null,
            valid_until: uploaded.valid_until, state: "none", scopeable: false,
          },
        ]);
        setUploadMessage({
          ok: true,
          text: payload.message ?? "Đã nhận chứng nhận. Nhân viên phân loại và chọn phạm vi trước khi hiện cho người mua.",
        });
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
      <h2 className="text-[15px] font-black text-ink-900">Chứng nhận áp dụng</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-ink-600">
        {holderRule?.blocked
          ? "Chứng nhận của nhà máy đối tác cần xác thực nhà máy trước khi gắn vào sản phẩm."
          : "Giấy đã duyệt cho danh mục này tự áp cho sản phẩm. Bỏ tick giấy không đúng với sản phẩm."}
      </p>

      {applied.length > 0 && <form action={optAction} className="mt-3 space-y-2">
        <input type="hidden" name="product_id" value={productId} />
        <ul className="space-y-1.5">
          {applied.map((certificate) => {
            const checked = (certificate.applies || certificate.directScope) && !certificate.optedOut;
            return <li key={certificate.id} className="flex items-start gap-2 text-[13px] text-ink-800">
              <input
                type="checkbox" name="certificate_ids" value={certificate.id}
                defaultChecked={checked}
                disabled={Boolean(certificate.directScope) || optPending || Boolean(certificate.expired)}
                className="mt-0.5 size-4 shrink-0 accent-brand-700"
                aria-describedby={`cert-${certificate.id}-note`}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{certificate.name}</span>
                  {certificate.schemeLabel && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 ring-1 ring-teal-200">{certificate.schemeLabel}</span>}
                  {certificate.state === "approved" && <BadgeCheck className="size-3.5 text-emerald-700" aria-hidden="true" />}
                  {certificate.state === "requested" && <Clock3 className="size-3.5 text-amber-700" aria-hidden="true" />}
                </span>
                <span id={`cert-${certificate.id}-note`} className="mt-0.5 block text-[11.5px] leading-4 text-ink-500">
                  {certificate.directScope
                    ? "Nhân viên đã xác nhận riêng cho sản phẩm này."
                    : certificate.inheritedFrom
                      ? `Áp theo danh mục ${certificate.inheritedFrom}.`
                      : "Nhân viên đã xác nhận phạm vi cho sản phẩm này."}
                  {certificate.expired ? " Giấy đã hết hạn nên tạm không áp dụng." : ""}
                </span>
              </span>
            </li>;
          })}
        </ul>
        <button type="submit" disabled={optPending} className="btn btn-ghost btn-sm">
          {optPending ? "Đang lưu…" : "Lưu lựa chọn"}
        </button>
        {optResult.message && <p role="status" className={`rounded-lg px-3 py-2 text-[12.5px] ${optResult.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
          {optResult.message}
        </p>}
      </form>}

      {applied.length === 0 && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[12.5px] text-ink-700">
        Sản phẩm chưa có chứng nhận chất lượng nào áp dụng. Tải giấy bên dưới; nhân viên phân loại và chọn phạm vi sau khi duyệt.
      </p>}

      {outside.length > 0 && <div className="mt-4 space-y-1.5">
        <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Giấy khác trên hồ sơ</p>
        {outside.slice(0, 8).map((certificate) => <div key={certificate.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-ink-200 bg-ink-50/40 px-3 py-2 text-[12.5px] text-ink-500">
          <span className="font-semibold">{certificate.name}</span>
          {certificate.schemeLabel && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200">{certificate.schemeLabel}</span>}
          <span>{certificate.expired ? "Giấy đã hết hạn nên chưa áp dụng cho danh mục này." : "Chưa áp dụng cho danh mục này."}</span>
          <form action={action} className="ml-auto">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="certificate_ids" value={certificate.id} />
            <button type="submit" disabled={pending || certificate.expired} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 underline">
              <MoveRight className="size-3.5" aria-hidden="true" />
              {certificate.state === "requested" ? "Đã xin mở rộng phạm vi" : "Yêu cầu mở rộng phạm vi"}
            </button>
          </form>
        </div>)}
      </div>}

      {result.message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
        {result.message}
      </p>}

      {pendingUploads.length > 0 && <div className="mt-4 space-y-1.5">
        {pendingUploads.map((certificate) => <p key={certificate.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="font-semibold">{certificate.name}</span>
          <span>vừa tải lên, chờ nhân viên đối chiếu và chọn phạm vi áp dụng.</span>
        </p>)}
      </div>}

      {others.length > 0 && <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] leading-4 text-ink-600">
        {others.length} giấy khác trên hồ sơ không gắn vào sản phẩm này (giấy pháp lý, giấy theo lô hoặc chờ phân loại).
        {others.slice(0, 3).map((certificate) => ` ${certificateLabel(certificate)}`).join(" ·")}
      </p>}

      {holderRule?.blocked && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-amber-900 uppercase">
          <Lock className="size-3.5" aria-hidden="true" /> Chưa tải chứng nhận được
        </p>
        <p className="mt-1 text-[12px] leading-5 text-amber-900">{holderRule.text}</p>
        <p className="mt-1 text-[11.5px] leading-4 text-amber-900">Hoàn tất xác thực nhà máy đối tác ở mục Xác thực nhà máy.</p>
        <p className="mt-1 text-[11.5px] leading-4 text-amber-900">Sản phẩm vẫn lưu, gửi duyệt và đăng bán bình thường.</p>
      </div>}

      {!holderRule?.blocked && <form onSubmit={onUpload} className="mt-4 grid gap-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3.5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <p className="text-[11px] font-bold tracking-wider text-brand-900 uppercase">Tải lên hoặc gia hạn chứng nhận</p>
          <p className="mt-0.5 text-[11.5px] leading-4 text-ink-600">
            Chỉ cần tải tệp. Nhân viên phân loại loại giấy và chọn phạm vi danh mục trước khi hiện cho người mua.
          </p>
          {holderRule && <p className="mt-1 text-[11.5px] leading-4 text-ink-600">{holderRule.text}</p>}
        </div>
        <label className="block text-[12px] sm:col-span-1">
          <span className="mb-1 block font-semibold text-ink-800">Gia hạn giấy đã có (tùy chọn)</span>
          <select name="certificate_id" className="input text-sm" defaultValue="">
            <option value="">+ Giấy mới</option>
            {all.filter((certificate) => !certificate.superseded).map((certificate) => (
              <option key={certificate.id} value={certificate.id}>
                Gia hạn: {certificate.name}{certificate.valid_until ? ` (hạn ${certificate.valid_until})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] sm:col-span-2">
          <span className="mb-1 block font-semibold text-ink-800">Tên trên giấy (không bắt buộc)</span>
          <input name="label" type="text" maxLength={140} placeholder="VD: ISO 22000:2018" className="input text-sm" />
        </label>
        <div className="block sm:col-span-2">
          <FilePicker name="file" accept=".pdf,image/jpeg,image/png,image/webp" required busy={uploadBusy}
            compact title="Tệp PDF hoặc ảnh" hint="Tối đa 15 MB. Tệp chỉ hiện với người mua sau khi được duyệt." />
        </div>
        <div className="flex items-end sm:col-span-1">
          <button type="submit" disabled={uploadBusy} className="btn btn-primary btn-sm">
            {uploadBusy ? "Đang tải lên…" : "Tải lên"}
          </button>
        </div>
        {uploadMessage && <p role="status" className={`text-[12px] font-medium sm:col-span-3 ${uploadMessage.ok ? "text-emerald-800" : "text-rose-700"}`}>
          {uploadMessage.text}
        </p>}
      </form>}
    </section>
  );
}
