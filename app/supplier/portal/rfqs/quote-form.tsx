"use client";

import { useActionState } from "react";
import { ChevronDown, Send } from "lucide-react";

import { submitSupplierQuoteAction, type SupplierQuoteState } from "./quote-actions";
import type { RfqsMessages } from "@/lib/i18n/portal/rfqs";

const INITIAL: SupplierQuoteState = { error: null };

/** One clear action: open the form, then send the quote. Validation and ownership stay on the server. */
export function SupplierQuoteForm({ matchId, code, defaults, currencies, incoterms, editing, direct = false, copy }: {
  matchId: string;
  code: string;
  defaults: { price: string; currency: string; unit: string; incoterm: string; leadTimeDays: string; validUntil: string };
  currencies: readonly string[];
  incoterms: readonly string[];
  editing: boolean;
  /** A direct RFQ is forwarded to the buyer by the existing server action. */
  direct?: boolean;
  copy: RfqsMessages["quote"];
}) {
  const [state, action, pending] = useActionState(submitSupplierQuoteAction, INITIAL);
  const v = state.values;
  const d = v ? { price: v.price, currency: v.currency, unit: v.unit, incoterm: v.incoterm, leadTimeDays: v.lead_time_days, validUntil: v.valid_until } : defaults;
  const field = "input mt-1.5";
  const label = "flex min-w-0 flex-col text-sm font-semibold text-ink-700";
  return (
    <details className="group w-full" open={!!state.error}>
      <summary className={`btn min-h-11 list-none ${editing ? "btn-ghost" : "btn-primary"}`}>
        <Send className="h-4 w-4" aria-hidden="true" /> {editing ? copy.revise : copy.open}
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <form key={JSON.stringify(state)} action={action} className="mt-3 rounded-xl border border-ink-200 bg-ink-50/70 p-4 sm:p-5">
        <input type="hidden" name="match_id" value={matchId} />
        <p className="mb-4 text-sm leading-6 text-ink-700">{copy.intro}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={label}>{copy.price}
            <input name="price" required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,4})?" placeholder={copy.pricePlaceholder} defaultValue={d.price} className={field} />
          </label>
          <label className={label}>{copy.currency}
            <select name="currency" defaultValue={d.currency} className={field}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={label}>{copy.unit}
            <input name="unit" required maxLength={20} defaultValue={d.unit} className={field} />
          </label>
          <label className={label}>{copy.incoterm}
            <select name="incoterm" defaultValue={incoterms.includes(d.incoterm) ? d.incoterm : "FOB"} className={field}>
              {incoterms.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={label}>{copy.leadTime}
            <input name="lead_time_days" required type="number" min={1} max={365} defaultValue={d.leadTimeDays} className={field} />
          </label>
          <label className={label}>{copy.validUntil}
            <input name="valid_until" type="date" defaultValue={d.validUntil} className={field} />
          </label>
        </div>
        <label className={`${label} mt-4`}>{copy.note}
          <textarea name="note" rows={3} maxLength={1000} defaultValue={v?.note ?? ""} placeholder={copy.notePlaceholder} className={`${field} font-normal`} />
        </label>
        {state.error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{state.error}</p>}
        <div className="mt-5 flex flex-col gap-3 border-t border-ink-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-5 text-ink-600">{direct ? copy.privacyDirect : copy.privacy}</p>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {!editing && (
              <button type="submit" name="intent" value="decline" formNoValidate disabled={pending} className="btn btn-ghost min-h-11"
                onClick={(event) => { if (!window.confirm(copy.declineConfirm.replace("{code}", code))) event.preventDefault(); }}>
                {copy.decline}
              </button>
            )}
            <button type="submit" name="intent" value="quote" disabled={pending} className="btn btn-primary min-h-11">
              {pending ? copy.pending : copy.submit}
            </button>
          </div>
        </div>
      </form>
    </details>
  );
}
