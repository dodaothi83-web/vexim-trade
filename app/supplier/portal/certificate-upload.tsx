"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";

import { FilePicker } from "@/components/file-picker";

export function SupplierCertificateUpload({
  certificates,
  blockedReason = null,
}: {
  certificates: Array<{ id: string; name: string; valid_until: string | null }>;
  /** Có lý do thì ô tải đóng sẵn và nói vì sao — không để chọn tệp rồi mới nhận lỗi. */
  blockedReason?: string | null;
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
        text: payload.message ??
          (res.ok ? "Đã nhận chứng nhận. Nhân viên phân loại và chọn phạm vi trước khi hiện cho người mua." : "Không lưu được tệp."),
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

  if (blockedReason) {
    return (
      <section
        aria-label="Chưa mở được ô tải chứng nhận"
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
      >
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-amber-900 uppercase">
          <Lock className="size-3.5" aria-hidden="true" /> Chưa mở được ô tải chứng nhận
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-900">{blockedReason}</p>
        <div className="mt-3">
          <FilePicker
            compact
            disabled
            accept=".pdf,image/jpeg,image/png,image/webp"
            title="Tải chứng nhận"
            hint="Hoàn tất xác thực nhà máy đối tác để mở ô này."
          />
        </div>
        <Link href="/supplier/portal/verification/factory" className="mt-2 inline-block text-xs font-bold text-amber-900 underline">
          Mở bước 2 · Nhà máy đối tác
        </Link>
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 grid gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 sm:grid-cols-3"
    >
      <div className="sm:col-span-3">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-900">
          Tải lên hoặc gia hạn chứng nhận
        </p>
        <p className="mt-0.5 text-xs text-ink-600">
          Chỉ cần tải tệp. Nhân viên phân loại loại giấy và chọn phạm vi danh mục trước khi hiện cho người mua.
          Khi sắp hết hạn (60 / 30 / 7 / 1 ngày), hệ thống nhắc bạn vào đây tải bản mới.
        </p>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-ink-800">Gia hạn giấy đã có (tùy chọn)</span>
        <select name="certificate_id" className="input text-sm" defaultValue="">
          <option value="">+ Giấy mới</option>
          {certificates.map((c) => (
            <option key={c.id} value={c.id}>
              Gia hạn: {c.name} {c.valid_until ? `(hạn ${c.valid_until})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink-800">Tên trên giấy (không bắt buộc)</span>
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
          compact
          name="file"
          accept=".pdf,image/jpeg,image/png,image/webp"
          required
          busy={busy}
          title="Tệp PDF hoặc ảnh chứng nhận"
          hint="Tối đa 15 MB. Tệp chỉ hiện với người mua sau khi được duyệt."
        />
      </div>
      <div className="flex items-end sm:col-span-1">
        <button disabled={busy} className="btn btn-primary w-full" type="submit">
          {busy ? "Đang tải lên…" : "Tải lên"}
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
