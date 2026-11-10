"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

/**
 * Optional way to email Vexim about an RFQ. Gmail opens in the browser; the normal
 * mail app is available too. Keep the actual route visible for people using neither.
 */
export function SupplierRfqReply({ address, cc, subject, labels }: {
  address: string;
  /** Vexim's per-RFQ inbound route records the reply under the correct match. */
  cc?: string | null;
  subject: string;
  labels: { gmail: string; app: string; copy: string; copied: string; address: string };
}) {
  const [copied, setCopied] = useState(false);
  const ccPart = cc ? `&cc=${encodeURIComponent(cc)}` : "";
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(address)}${ccPart}&su=${encodeURIComponent(subject)}`;
  const mailto = `mailto:${address}?subject=${encodeURIComponent(subject)}${ccPart}`;
  return (
    <div>
      <p className="mb-2 break-all text-[13px] text-ink-700">{labels.address} <span className="font-mono font-semibold select-all">{address}</span></p>
      <div className="flex flex-wrap items-center gap-2">
        <a href={gmail} target="_blank" rel="noreferrer" className="btn btn-ghost min-h-10 text-[13px]">
          <Mail className="h-4 w-4" aria-hidden="true" /> {labels.gmail}
        </a>
        <a href={mailto} className="btn btn-ghost min-h-10 text-[13px]">{labels.app}</a>
        <button type="button" className="btn btn-ghost min-h-10 text-[13px]" title={address}
          onClick={() => {
            void navigator.clipboard?.writeText(address).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }).catch(() => { /* Address remains visible for manual copying. */ });
          }}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </div>
  );
}
