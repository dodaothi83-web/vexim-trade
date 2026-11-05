"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import { submitSupplierQuoteAction, type SupplierQuoteState } from "./quote-actions";
import type { RfqsMessages } from "@/lib/i18n/portal/rfqs";

const INITIAL: SupplierQuoteState = { error: null };

/** Form báo giá gọn, mở ngay dưới lời mời. Quyền và kiểm tra dữ liệu nằm ở server action. */
export function SupplierQuoteForm({ matchId, code, defaults, currencies, incoterms, editing, copy }: {
  matchId: string;
  code: string;
  defaults: { price: string; currency: string; unit: string; incoterm: string; leadTimeDays: string; validUntil: string };
  currencies: readonly string[];
  incoterms: readonly string[];
  editing: boolean;
  copy: RfqsMessages["quote"];
}) {
  const [state, action, pending] = useActionState(submitSupplierQuoteAction, INITIAL);
  const v = state.values;
  const d = v ? { price: v.price, currency: v.currency, unit: v.unit, incoterm: v.incoterm, leadTimeDays: v.lead_time_days, validUntil: v.valid_until } : defaults;
  const field = "input mt-1 py-1.5 text-[13px]";
  const label = "flex min-w-0 flex-col text-[11.5px] font-semibold text-ink-600";
  return (
    <details className="group mt-2.5 w-full" open={!!state.error}>
      <summary className={`btn btn-sm cursor-pointer list-none ${editing ? "btn-ghost" : "btn-primary"}`}>
        <Send className="h-3.5 w-3.5" aria-hidden="true" /> {editing ? copy.revise : copy.open}
      </summary>
      <form key={JSON.stringify(state)} action={action} className="mt-2.5 rounded-lg border border-ink-200 bg-ink-50/60 p-3.5">
        <input type="hidden" name="match_id" value={matchId} />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <label className={label}>{copy.price}
            <input name="price" required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,4})?" defaultValue={d.price} className={field} />
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
        <label className={`${label} mt-2.5`}>{copy.note}
          <textarea name="note" rows={2} maxLength={1000} defaultValue={v?.note ?? ""} placeholder={copy.notePlaceholder} className={`${field} font-normal`} />
        </label>
        {state.error && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-rose-700">{state.error}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11.5px] text-ink-500">{copy.privacy}</p>
          <div className="flex flex-wrap gap-2">
            {!editing && (
              <button type="submit" name="intent" value="decline" formNoValidate disabled={pending} className="btn btn-ghost btn-sm"
                onClick={(event) => { if (!window.confirm(copy.declineConfirm.replace("{code}", code))) event.preventDefault(); }}>
                {copy.decline}
              </button>
            )}
            <button type="submit" name="intent" value="quote" disabled={pending} className="btn btn-primary btn-sm">
              {pending ? copy.pending : copy.submit}
            </button>
          </div>
        </div>
      </form>
    </details>
  );
}
