"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FilePicker } from "@/components/file-picker";

const CERT_KEY_OPTIONS = [
  { key: "haccp_or_brc", label: "HACCP / BRC / ISO 22000" },
  { key: "food_safety", label: "Giấy chứng nhận ATTP" },
  { key: "product_certs", label: "Chứng chỉ sản phẩm (Halal, Organic, FDA...)" },
  { key: "export_license", label: "Giấy phép xuất khẩu" },
] as const;

export function SupplierCertificateUpload({
  certificates,
}: {
  certificates: Array<{ id: string; name: string; valid_until: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const element = event.currentTarget;
      const form = new FormData(element);
      const res = await fetch("/api/supplier-portal/certificates", {
        method: "POST",
        body: form,
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string };
      setMessage({
        ok: Boolean(res.ok && payload.ok),
        text: payload.message ?? (res.ok ? "Đã tải chứng nhận." : "Không lưu được tệp."),
      });
      if (res.ok && payload.ok) {
        element.reset();
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 grid gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 sm:grid-cols-3"
    >
      <div className="sm:col-span-3">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-900">
          Tải lên hoặc gia hạn chứng nhận L1
        </p>
        <p className="mt-0.5 text-xs text-ink-600">
          Hệ thống đọc tên đơn vị trên giấy (khớp tên công ty = <strong>Chính chủ</strong>; tên nhà máy khác = <strong>Đơn vị đối tác</strong>) và ngày hết hạn để hiển thị lên trang. Khi sắp hết hạn (60 / 30 / 7 / 1 ngày), hệ thống tự nhắc để bạn vào đây tải bản mới.
        </p>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-ink-800">Loại chứng nhận L1</span>
        <select name="checklist_key" className="input text-sm" defaultValue="haccp_or_brc">
          {CERT_KEY_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-ink-800">
          Cập nhật chứng nhận hiện có (tùy chọn)
        </span>
        <select name="certificate_id" className="input text-sm" defaultValue="">
          <option value="">+ Thêm mới / tự khớp theo loại hoặc số hiệu</option>
          {certificates.map((c) => (
            <option key={c.id} value={c.id}>
              Cập nhật: {c.name} {c.valid_until ? `(hạn ${c.valid_until})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-ink-800">Tên gợi ý (không bắt buộc)</span>
        <input
          name="label"
          type="text"
          maxLength={140}
          placeholder="VD: ISO 22000:2018, HACCP..."
          className="input text-sm"
        />
      </label>
      <div className="block sm:col-span-2">
        <FilePicker
          name="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          required
          busy={busy}
          title="Tệp PDF hoặc ảnh chứng nhận"
          hint="Tối đa 15 MB. Tệp được quét sơ bộ, không tự công khai."
        />
      </div>
      <div className="flex items-end">
        <button disabled={busy} className="btn btn-primary w-full" type="submit">
          {busy ? "Đang tải lên..." : "Tải lên"}
        </button>
      </div>
      {message && (
        <p
          role="status"
          className={`text-xs font-medium sm:col-span-3 ${
            message.ok ? "text-emerald-800" : "text-rose-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
