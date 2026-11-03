"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";

import { FilePicker } from "@/components/file-picker";
import { fill } from "@/lib/i18n/format";
import type { PortalMessages } from "@/lib/i18n/portal";

export function SupplierCertificateUpload({
  certificates,
  blockedReason = null,
  copy,
}: {
  certificates: Array<{ id: string; name: string; valid_until: string | null }>;
  /** Có lý do thì ô tải đóng sẵn và nói vì sao — không để chọn tệp rồi mới nhận lỗi. */
  blockedReason?: string | null;
  copy: PortalMessages["documents"]["certUpload"];
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
          (res.ok ? copy.ok : copy.fail),
      });
      if (res.ok && payload.ok) {
        element.reset();
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: copy.offline });
    } finally {
      setBusy(false);
    }
  }

  if (blockedReason) {
    return (
      <section
        aria-label={copy.blockedAria}
        className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
      >
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-amber-900 uppercase">
          <Lock className="size-3.5" aria-hidden="true" /> {copy.blockedTitle}
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-900">{blockedReason}</p>
        <div className="mt-3">
          <FilePicker
            compact
            disabled
            accept=".pdf,image/jpeg,image/png,image/webp"
            title={copy.blockedPickerTitle}
            hint={copy.blockedPickerHint}
          />
        </div>
        <Link href="/supplier/portal/verification/factory" className="mt-2 inline-block text-xs font-bold text-amber-900 underline">
          {copy.openStep2}
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
          {copy.heading}
        </p>
        <p className="mt-0.5 text-xs text-ink-600">
          {copy.intro}
        </p>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-ink-800">{copy.renewLabel}</span>
        <select name="certificate_id" className="input text-sm" defaultValue="">
          <option value="">{copy.newOption}</option>
          {certificates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.valid_until
                ? fill(copy.renewOptionWithExpiry, { name: c.name, date: c.valid_until })
                : fill(copy.renewOption, { name: c.name })}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="mb-1 block font-semibold text-ink-800">{copy.nameLabel}</span>
        <input
          name="label"
          type="text"
          maxLength={140}
          placeholder={copy.namePlaceholder}
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
          title={copy.fileTitle}
          hint={copy.fileHint}
        />
      </div>
      <div className="flex items-end sm:col-span-1">
        <button disabled={busy} className="btn btn-primary w-full" type="submit">
          {busy ? copy.uploading : copy.submit}
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
