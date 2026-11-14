"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";

import { FilePicker } from "@/components/file-picker";
import { fill } from "@/lib/i18n/format";
import type { PortalMessages } from "@/lib/i18n/portal";

type CertificateOption = { id: string; name: string; valid_until: string | null };

export function SupplierCertificateUpload({
  certificates,
  blockedReason = null,
  trading = false,
  initialCertificateId = null,
  copy,
}: {
  /** Giấy cần thay, chọn sẵn khi mở từ email "Tải lại chứng nhận". */
  initialCertificateId?: string | null;
  /** Trading suppliers may need to provide a factory contract for a certificate issued to a partner. */
  trading?: boolean;
  certificates: CertificateOption[];
  blockedReason?: string | null;
  copy: PortalMessages["documents"]["certUpload"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Từ email "Tải lại chứng nhận" (?replace=<id>): chọn sẵn đúng giấy cần thay.
  const preselected = certificates.find((certificate) => certificate.id === initialCertificateId)?.id;
  const [mode, setMode] = useState<"renew" | "new">(preselected || certificates.length ? "renew" : "new");
  const [certificateId, setCertificateId] = useState(preselected ?? certificates[0]?.id ?? "");
  const selected = certificates.find((certificate) => certificate.id === certificateId) ?? null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const element = event.currentTarget;
      const form = new FormData(element);
      form.set("certificate_id", mode === "renew" ? certificateId : "");
      const res = await fetch("/api/supplier-portal/certificates", {
        method: "POST",
        body: form,
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string };
      setMessage({
        ok: Boolean(res.ok && payload.ok),
        text: payload.message ?? (res.ok ? copy.ok : copy.fail),
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
      <section aria-label={copy.blockedAria} className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
          <Lock className="size-3.5" aria-hidden="true" /> {copy.blockedTitle}
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-900">{blockedReason}</p>
        <div className="mt-3">
          <FilePicker compact disabled accept=".pdf,image/jpeg,image/png,image/webp"
            title={copy.blockedPickerTitle} hint={copy.blockedPickerHint} />
        </div>
        <Link href="/supplier/portal/verification/factory" className="mt-2 inline-block text-xs font-bold text-amber-900 underline">
          {copy.openStep2}
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-xl border border-ink-200 bg-white p-4">
      <div>
        <p className="text-xs font-bold text-ink-900">{copy.heading}</p>
        <p className="mt-1 text-xs leading-5 text-ink-600">{copy.intro}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={copy.heading}>
        <button type="button" aria-pressed={mode === "renew"} disabled={!certificates.length || busy}
          onClick={() => { setMode("renew"); setMessage(null); }}
          className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${mode === "renew" ? "border-brand-500 bg-brand-50 text-brand-900 ring-1 ring-brand-200" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
          {copy.updateExisting}
        </button>
        <button type="button" aria-pressed={mode === "new"} disabled={busy}
          onClick={() => { setMode("new"); setMessage(null); }}
          className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition ${mode === "new" ? "border-brand-500 bg-brand-50 text-brand-900 ring-1 ring-brand-200" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
          {copy.addNew}
        </button>
      </div>

      {mode === "renew" && certificates.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-semibold text-ink-800">{copy.chooseExisting}</span>
          <select name="certificate_id" value={certificateId} disabled={busy} onChange={(event) => setCertificateId(event.target.value)} className="input text-sm">
            {certificates.map((certificate) => <option key={certificate.id} value={certificate.id}>
              {fill(copy.renewOption, { name: certificate.name })}
            </option>)}
          </select>
        </label>
        <p className="self-end rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">
          {selected?.valid_until
            ? fill(copy.expiry, { date: selected.valid_until })
            : copy.noExpiry}
        </p>
      </div>}

      <label className="mt-3 block text-xs">
        <span className="mb-1 block font-semibold text-ink-800">{copy.nameLabel}</span>
        <input name="label" type="text" maxLength={140} placeholder={copy.namePlaceholder} className="input text-sm" />
      </label>

      <div className="mt-3">
        <FilePicker compact name="file" accept=".pdf,image/jpeg,image/png,image/webp" required busy={busy}
          title={copy.fileTitle} hint={copy.fileHint} />
      </div>
      {trading && <div className="mt-3">
        <FilePicker compact name="relationship_file" accept=".pdf,image/jpeg,image/png,image/webp" busy={busy}
          title={copy.contractTitle} hint={copy.contractHint} />
        <p className="mt-1 text-[11px] text-ink-500">{copy.contractNote}</p>
      </div>}
      <button disabled={busy || (mode === "renew" && !certificateId)} className="btn btn-primary mt-3 w-full sm:w-auto" type="submit">
        {busy ? copy.uploading : copy.submit}
      </button>
      {message && <p role="status" className={`mt-3 text-xs font-medium ${message.ok ? "text-emerald-800" : "text-rose-700"}`}>
        {message.text}
      </p>}
    </form>
  );
}
