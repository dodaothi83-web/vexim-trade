"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";

/**
 * Nút trả lời lời mời báo giá. Liên kết `mailto:` không làm gì trên máy chưa cài ứng dụng email
 * (đa số dùng Gmail trên web), nên luôn có thêm Gmail web và sao chép địa chỉ.
 */
export function SupplierRfqReply({ address, subject, labels }: {
  address: string;
  subject: string;
  labels: { gmail: string; app: string; copy: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(address)}&su=${encodeURIComponent(subject)}`;
  const mailto = `mailto:${address}?subject=${encodeURIComponent(subject)}`;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <a href={gmail} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
        <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {labels.gmail}
      </a>
      <a href={mailto} className="btn btn-ghost btn-sm">{labels.app}</a>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title={address}
        onClick={() => {
          void navigator.clipboard?.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied ? labels.copied : labels.copy}
      </button>
    </span>
  );
}
