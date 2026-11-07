"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, FileText, Loader2, Plus, Send, X } from "lucide-react";

import { FilePicker } from "@/components/file-picker";

import type { BookingMessages } from "@/lib/i18n/portal/booking";
import type { L2ReviewMethod } from "@/lib/types";
import { saveBookingAction } from "./booking-actions";
import { deleteSubmissionItemAction } from "./submission-actions";

export interface BookingFormValue {
  submissionId: string;
  partner: boolean;
  editable: boolean;
  method: L2ReviewMethod | null;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  address: string;
  partnerName: string;
  slots: string[];
  consent: boolean;
  note: string;
  contracts: { id: string; label: string; href: string }[];
}

/** Ngày giờ tối thiểu cho ô chọn giờ: bây giờ theo giờ Việt Nam. */
function minSlot(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16);
}

export function BookingForm({ value, copy }: { value: BookingFormValue; copy: BookingMessages }) {
  const router = useRouter();
  const [method, setMethod] = useState<L2ReviewMethod>(value.partner ? "video_call" : value.method ?? "video_call");
  const [contactName, setContactName] = useState(value.contactName);
  const [contactRole, setContactRole] = useState(value.contactRole);
  const [contactPhone, setContactPhone] = useState(value.contactPhone);
  const [address, setAddress] = useState(value.address);
  const [partnerName, setPartnerName] = useState(value.partnerName);
  const [slots, setSlots] = useState<string[]>(value.slots.length ? value.slots : [""]);
  const [consent, setConsent] = useState(value.consent);
  const [note, setNote] = useState(value.note);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string; missing?: string[] } | null>(null);

  function formData(intent: "save" | "submit") {
    const fd = new FormData();
    fd.set("submission_id", value.submissionId);
    fd.set("intent", intent);
    fd.set("booking_method", method);
    fd.set("contact_name", contactName);
    fd.set("contact_role", contactRole);
    fd.set("contact_phone", contactPhone);
    fd.set("factory_address", address);
    fd.set("note", note);
    if (value.partner) fd.set("partner_factory_name", partnerName);
    for (const slot of slots) if (slot) fd.append("slot", slot);
    if (consent) fd.set("consent", "yes");
    return fd;
  }

  async function run(work: () => Promise<{ ok: boolean; message: string; missing?: string[] }>) {
    if (busy) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await work();
      setFeedback(result);
      if (result.ok) router.refresh();
    } catch {
      setFeedback({ ok: false, message: copy.failed });
    } finally { setBusy(false); }
  }

  async function uploadContract(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await run(async () => {
      // Lưu nháp trước để ô đã nhập không mất khi trang tải lại.
      await saveBookingAction(formData("save"));
      const form = new FormData();
      form.set("checklistKey", "partner_factory_contract");
      form.set("file", file, file.name);
      const response = await fetch(`/api/supplier-portal/submissions/${encodeURIComponent(value.submissionId)}/upload`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; message?: string };
      return { ok: Boolean(response.ok && data.ok), message: data.message ?? copy.failed };
    });
  }

  function removeContract(itemId: string) {
    const fd = new FormData();
    fd.set("submission_id", value.submissionId);
    fd.set("item_id", itemId);
    void run(() => deleteSubmissionItemAction(fd));
  }

  return <form className="card space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); void run(() => saveBookingAction(formData("submit"))); }}>
    <div>
      <h2 className="flex items-center gap-2 text-base font-bold text-ink-900"><CalendarClock className="h-5 w-5 text-brand-700" aria-hidden="true" />{copy.formTitle}</h2>
      <p className="mt-1 text-sm text-ink-600">{copy.formSub}</p>
    </div>

    <fieldset disabled={!value.editable || busy} className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-ink-800">{copy.method}</p>
        {value.partner ? <p className="mt-1 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">{copy.partnerVideoOnly}</p>
          : <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["video_call", "on_site"] as const).map((option) => <label key={option} className={"flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm " + (method === option ? "border-brand-500 bg-brand-50 text-brand-900" : "border-ink-200 bg-white text-ink-700")}>
              <input type="radio" name="booking_method" checked={method === option} onChange={() => setMethod(option)} />
              {option === "video_call" ? copy.methodVideo : copy.methodOnSite}
            </label>)}
          </div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.contactName}><input className="input" value={contactName} maxLength={160} onChange={(e) => setContactName(e.target.value)} autoComplete="name" /></Field>
        <Field label={copy.contactRole}><input className="input" value={contactRole} maxLength={120} onChange={(e) => setContactRole(e.target.value)} /></Field>
        <Field label={copy.contactPhone}><input className="input" value={contactPhone} maxLength={30} inputMode="tel" onChange={(e) => setContactPhone(e.target.value)} autoComplete="tel" /></Field>
        <Field label={copy.address}><input className="input" value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} /></Field>
        {value.partner && <Field label={copy.partnerName}><input className="input" value={partnerName} maxLength={200} onChange={(e) => setPartnerName(e.target.value)} /></Field>}
      </div>

      <div>
        <p className="text-sm font-semibold text-ink-800">{copy.slots}</p>
        <p className="text-xs text-ink-500">{copy.slotsHint}</p>
        <ul className="mt-2 space-y-2">{slots.map((slot, index) => <li key={index} className="flex items-center gap-2">
          <input type="datetime-local" className="input max-w-xs" value={slot} min={minSlot()} aria-label={`${copy.slots} ${index + 1}`}
            onChange={(e) => setSlots((current) => current.map((s, i) => i === index ? e.target.value : s))} />
          {slots.length > 1 && <button type="button" className="inline-flex items-center gap-1 text-xs text-ink-500 underline" onClick={() => setSlots((current) => current.filter((_, i) => i !== index))}><X className="h-3.5 w-3.5" aria-hidden="true" />{copy.removeSlot}</button>}
        </li>)}</ul>
        {slots.length < 3 && <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700" onClick={() => setSlots((current) => [...current, ""])}><Plus className="h-4 w-4" aria-hidden="true" />{copy.addSlot}</button>}
      </div>

      {value.partner && <div>
        <p className="text-sm font-semibold text-ink-800">{copy.contract}</p>
        <p className="text-xs text-ink-500">{copy.contractHint}</p>
        {value.contracts.length > 0 && <ul className="mt-2 space-y-1.5">{value.contracts.map((file) => <li key={file.id} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <a href={file.href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-brand-700 underline">{file.label}</a>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{copy.contractUploaded}</span>
          {value.editable && <button type="button" className="shrink-0 text-xs text-rose-700 underline" onClick={() => removeContract(file.id)}>{copy.removeSlot}</button>}
        </li>)}</ul>}
        {value.editable && <FilePicker className="mt-2" busy={busy} accept="image/jpeg,image/png,image/webp,application/pdf"
          title={value.contracts.length ? copy.contractAddMore : copy.contractPick} hint={copy.contractPickHint} requiredMark={!value.contracts.length}
          labels={{ choose: copy.contractChoose, uploading: copy.contractUploading, empty: copy.contractPickHint }}
          onPick={(files) => uploadContract(files)} />}
      </div>}

      <Field label={copy.note}><textarea className="input" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></Field>

      <label className="flex items-start gap-2 rounded-lg bg-ink-50 p-3 text-sm leading-relaxed text-ink-700">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{copy.consent}</span>
      </label>
    </fieldset>

    {feedback && <div role={feedback.ok ? "status" : "alert"} className={"rounded-lg px-3 py-2 text-sm " + (feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
      {feedback.message}
      {feedback.missing?.length ? <ul className="mt-1 list-disc pl-5">{feedback.missing.map((m) => <li key={m}>{m}</li>)}</ul> : null}
    </div>}

    {value.editable && <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => saveBookingAction(formData("save")))}>{copy.save}</button>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{copy.submit}</button>
    </div>}
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-ink-800">{label}<span className="mt-1 block font-normal">{children}</span></label>;
}
