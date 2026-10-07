"use client";

import { useState } from "react";
import { Copy, Download, Mail, Users } from "lucide-react";

import { cx } from "@/components/ui";
import { useToast } from "@/components/toast";

export interface PreviewTab {
  id: string;
  label: string;
  subject: string;
  recipients: string[];
  html: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function EmailPreview({ tabs }: { tabs: PreviewTab[] }) {
  const toast = useToast();
  const first = tabs.find((t) => !t.disabled) ?? tabs[0];
  const [activeId, setActiveId] = useState(first?.id);
  const active = tabs.find((t) => t.id === activeId) ?? first;

  if (!active) return null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-ink-200 bg-ink-50 px-2 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            onClick={() => setActiveId(t.id)}
            title={t.disabled ? (t.disabledReason ?? "") : t.subject}
            className={cx(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition",
              t.id === active.id
                ? "bg-white text-ink-900 shadow-card"
                : "text-ink-500 hover:text-ink-800",
              t.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {t.id === "supplier" ? (
              <Users className="h-3.5 w-3.5" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-[12px]"
            onClick={() => {
              void navigator.clipboard
                .writeText(active.subject)
                .then(() => toast.push({ kind: "success", title: "Đã copy chủ đề email" }));
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy chủ đề
          </button>
          <a
            className="btn btn-ghost px-2 py-1 text-[12px]"
            href={`data:text/html;charset=utf-8,${encodeURIComponent(active.html)}`}
            download={`${active.id}.html`}
          >
            <Download className="h-3.5 w-3.5" />
            Tải HTML
          </a>
        </div>
      </div>

      <div className="border-b border-ink-200 px-4 py-2.5 text-[12px]">
        <p className="truncate text-ink-800">
          <span className="text-ink-400">Chủ đề: </span>
          <strong>{active.subject || "—"}</strong>
        </p>
        <p className="mt-0.5 truncate text-ink-500">
          <span className="text-ink-400">Tới: </span>
          {active.recipients.length ? active.recipients.join(", ") : "chưa có người nhận"}
        </p>
      </div>

      {active.disabled ? (
        <p className="px-4 py-10 text-center text-[13px] text-ink-500">
          {active.disabledReason ?? "Chưa có nội dung"}
        </p>
      ) : (
        <iframe
          title={`Xem trước email ${active.label}`}
          srcDoc={active.html}
          sandbox=""
          className="h-[560px] w-full border-0 bg-white"
        />
      )}
    </div>
  );
}
