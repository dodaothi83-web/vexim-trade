"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";

import { supplierLeadRatingAction, type LeadRatingFormState } from "./[matchId]/actions";
import { LEAD_RATING_LEVELS, LEAD_RATING_NOTE_MAX, LEAD_RATING_REASONS } from "@/lib/rfq/lead-rating";
import type { RfqsMessages } from "@/lib/i18n/portal/rfqs";
import type { RfqLeadRatingLevel, RfqLeadRatingReason } from "@/lib/types";

const INITIAL: LeadRatingFormState = { error: null, saved: false, seq: 0 };

/** Optional and collapsed: quoting stays the page's main task. The rating is private to
 * Vexim staff; the buyer never sees it. Ownership and eligibility are checked on the server. */
export function LeadRatingForm({ matchId, current, copy }: {
  matchId: string;
  current: { rating: RfqLeadRatingLevel; reasons: RfqLeadRatingReason[]; note: string | null } | null;
  copy: RfqsMessages["leadRating"];
}) {
  const [state, action, pending] = useActionState(supplierLeadRatingAction, INITIAL);
  const [level, setLevel] = useState<RfqLeadRatingLevel | null>(current?.rating ?? null);
  const rated = current ?? null;
  const label = (value: RfqLeadRatingLevel) => copy[value];
  // Submitted by hand, not through the form's `action` prop: React resets a form after its
  // action runs, which would clear the chosen level, reasons and note when the server
  // rejects the input (for example a poor lead without a reason).
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
  return <details id="lead-rating" className="group scroll-mt-24 rounded-2xl border border-ink-200 bg-white shadow-sm">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-ink-900">{copy.title}</span>
        {rated && <span className="mt-0.5 block text-[12px] text-ink-600">{copy.current.replace("{level}", label(rated.rating))}</span>}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <form onSubmit={submit} className="border-t border-ink-100 px-5 pb-5 pt-4">
      <input type="hidden" name="match_id" value={matchId} />
      <p className="text-[12px] leading-5 text-ink-600">{copy.privacy}</p>
      <fieldset className="mt-3">
        <legend className="text-[13px] font-bold text-ink-800">{copy.levelLegend}</legend>
        <div className="mt-2 space-y-2">
          {LEAD_RATING_LEVELS.map((value) => <label key={value}
            className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-200 px-3 py-2.5 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/60">
            <input type="radio" name="rating" value={value} required checked={level === value}
              onChange={() => setLevel(value)} className="mt-1 h-4 w-4 shrink-0 accent-brand-700" />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink-900">{label(value)}</span>
              <span className="mt-0.5 block text-[12px] leading-5 text-ink-600">{copy[`${value}Hint`]}</span>
            </span>
          </label>)}
        </div>
      </fieldset>
      {level === "poor" && <fieldset className="mt-4">
        <legend className="text-[13px] font-bold text-ink-800">{copy.reasonsLegend}</legend>
        <div className="mt-2 space-y-1">
          {LEAD_RATING_REASONS.map((reason) => <label key={reason} className="flex min-h-9 cursor-pointer items-start gap-2.5 py-1 text-[13px] leading-5 text-ink-800">
            <input type="checkbox" name="reasons" value={reason} defaultChecked={rated?.reasons.includes(reason) ?? false}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-700" />
            <span>{copy.reasons[reason]}</span>
          </label>)}
        </div>
      </fieldset>}
      <label htmlFor={`lead-note-${matchId}`} className="mt-4 block text-[13px] font-bold text-ink-800">{copy.noteLabel}</label>
      <textarea id={`lead-note-${matchId}`} name="note" rows={2} maxLength={LEAD_RATING_NOTE_MAX} defaultValue={rated?.note ?? ""}
        placeholder={copy.notePlaceholder} className="input mt-2 w-full resize-y rounded-xl bg-white text-[13px] leading-5" />
      <button type="submit" disabled={pending} className="btn btn-primary mt-3 min-h-11 w-full">
        {pending ? copy.saving : rated ? copy.update : copy.save}
      </button>
      {state.error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">{copy.errors[state.error]}</p>}
      {state.saved && !state.error && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800">{copy.saved}</p>}
    </form>
  </details>;
}
