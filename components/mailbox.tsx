"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  FileText,
  Inbox,
  Mail,
  Pencil,
  Search,
  Trash2,
  Users,
  Zap,
} from "lucide-react";

import { deleteMessageAction } from "@/app/actions";
import type { EmailMessage } from "@/lib/types";
import { Badge, Button, EmptyState, cx, formatDateTime } from "@/components/ui";
import { useToast } from "@/components/toast";

export interface MailRow extends EmailMessage {
  label: string;
  stageLabel?: string;
}

type Folder = "sent" | "draft";
type Filter = "all" | "buyer" | "supplier" | "auto" | "manual";

export function Mailbox({ rows }: { rows: MailRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [folder, setFolder] = useState<Folder>("sent");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const drafts = rows.filter((r) => r.status === "draft");
  const sent = rows.filter((r) => r.status !== "draft");

  const list = useMemo(() => {
    const base = folder === "draft" ? drafts : sent;
    const needle = q.trim().toLowerCase();
    return base.filter((r) => {
      if (filter === "buyer" && r.direction !== "buyer") return false;
      if (filter === "supplier" && r.direction !== "supplier") return false;
      if (filter === "auto" && r.kind !== "auto") return false;
      if (filter === "manual" && r.kind !== "manual") return false;
      if (!needle) return true;
      return [r.subject, r.label, ...r.to_emails, ...r.cc_emails]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [folder, filter, q, drafts, sent]);

  async function remove(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Xoá email này khỏi hộp thư?")) return;
    const res = await deleteMessageAction(id);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-3">
        <div className="flex overflow-hidden rounded-lg border border-ink-300">
          {(
            [
              ["sent", "Hộp thư đi", sent.length],
              ["draft", "Bản nháp", drafts.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFolder(key)}
              className={cx(
                "flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold transition",
                folder === key
                  ? "bg-brand-700 text-white"
                  : "bg-white text-ink-600 hover:bg-ink-50",
              )}
            >
              {key === "sent" ? <Inbox className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {label}
              <span
                className={cx(
                  "rounded-full px-1.5 text-[10.5px]",
                  folder === key ? "bg-white/25" : "bg-ink-100 text-ink-500",
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Tìm tiêu đề, người nhận…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <select
          className="input w-auto"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="all">Tất cả</option>
          <option value="buyer">Gửi buyer</option>
          <option value="supplier">Gửi NCC</option>
          <option value="auto">Email tự động theo giai đoạn</option>
          <option value="manual">Email đội ngũ tự soạn</option>
        </select>

        <Link href="/mail/compose" className="btn btn-primary">
          <Pencil className="h-4 w-4" />
          Soạn thư
        </Link>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title={
            folder === "draft"
              ? "Chưa có bản nháp nào"
              : q || filter !== "all"
                ? "Không tìm thấy email phù hợp"
                : "Chưa gửi email nào"
          }
          sub={
            folder === "draft"
              ? "Khi soạn thư, bấm “Lưu nháp” để quay lại viết tiếp sau."
              : "Mỗi lần đổi giai đoạn trong pipeline, hệ thống tự gửi email và lưu vào đây."
          }
          action={
            <Link href="/mail/compose" className="btn btn-primary">
              Soạn thư mới
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-ink-100">
          {list.map((m) => (
            <li key={m.id}>
              <Link
                href={m.status === "draft" ? `/mail/compose?draft=${m.id}` : `/mail/${m.id}`}
                className="group flex items-start gap-3 px-3 py-2.5 transition hover:bg-brand-50/40"
              >
                <span
                  className={cx(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    m.direction === "buyer"
                      ? "bg-brand-50 text-brand-700"
                      : "bg-amber-50 text-amber-700",
                  )}
                  title={m.direction === "buyer" ? "Gửi buyer" : "Gửi nhà cung cấp"}
                >
                  {m.direction === "buyer" ? (
                    <Mail className="h-4 w-4" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="max-w-[260px] truncate text-[13px] font-semibold text-ink-900">
                      {m.label}
                    </span>
                    <span className="truncate text-[13px] text-ink-700">— {m.subject}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
                    Tới {m.to_emails.join(", ")}
                    {m.cc_emails.length ? ` · cc ${m.cc_emails.join(", ")}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {m.kind === "auto" ? (
                      <Badge className="bg-brand-50 text-brand-700">
                        <Zap className="h-3 w-3" />
                        tự động{m.stageLabel ? ` · ${m.stageLabel}` : ""}
                      </Badge>
                    ) : (
                      <Badge className="bg-ink-100 text-ink-600">
                        <Pencil className="h-3 w-3" />
                        tự soạn
                      </Badge>
                    )}
                    {m.attachments.length > 0 && (
                      <Badge className="bg-ink-100 text-ink-600">
                        <FileText className="h-3 w-3" />
                        {m.attachments.length} file
                      </Badge>
                    )}
                    {m.status === "draft" && <Badge className="bg-amber-50 text-amber-700">nháp</Badge>}
                    {m.status === "failed" && <Badge className="bg-red-50 text-red-700">gửi lỗi</Badge>}
                    {m.status === "simulated" && (
                      <Badge className="bg-amber-50 text-amber-700">demo</Badge>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11.5px] whitespace-nowrap text-ink-400">
                    {formatDateTime(m.created_at)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => void remove(m.id, e)}
                    className="rounded p-1 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                    title="Xoá"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MailboxHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
      {children}
    </div>
  );
}

export function BackToList() {
  return (
    <Button variant="ghost" size="sm">
      <Link href="/mail">← Hộp thư</Link>
    </Button>
  );
}
