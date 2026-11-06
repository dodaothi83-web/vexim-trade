"use client";

import { Check, CheckCheck, Clock3 } from "lucide-react";
import { PRESENCE_ONLINE_MS } from "@/lib/chat/presence";
import { cx } from "@/components/ui";

export interface PresenceLabels {
  /** "Online" */
  online: string;
  /** "Offline" (chưa từng thấy hoặc không rõ) */
  offline: string;
  /** "Active {time}", {time} là "5 minutes ago" */
  activeAgo: string;
  sending: string;
  sent: string;
  seen: string;
}

export const PRESENCE_LABELS: Record<"en" | "vi", PresenceLabels> = {
  en: { online: "Online", offline: "Offline", activeAgo: "Active {time}", sending: "Sending", sent: "Sent", seen: "Seen" },
  vi: { online: "Đang online", offline: "Offline", activeAgo: "Hoạt động {time}", sending: "Đang gửi", sent: "Đã gửi", seen: "Đã xem" },
};

export function onlineNow(lastSeen: string | null | undefined, nowMs = Date.now()): boolean {
  return Boolean(lastSeen) && nowMs - Date.parse(lastSeen!) < PRESENCE_ONLINE_MS;
}

/** "5 phút trước", "3 giờ trước", "hôm qua"… theo ngôn ngữ người xem. */
export function agoText(iso: string, locale: string, nowMs = Date.now()): string {
  const diff = Math.round((Date.parse(iso) - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60) || -1, "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day");
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

/** Chấm nhỏ ở góc ảnh đại diện khi bên kia đang online. */
export function PresenceDot({ lastSeen, label, className }: { lastSeen: string | null | undefined; label: string; className?: string }) {
  if (!onlineNow(lastSeen)) return null;
  return <span className={cx("absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white", className)} role="img" aria-label={label} title={label} />;
}

/** Dòng trạng thái dưới tên: Đang online / Hoạt động 5 phút trước / Offline. */
export function PresenceLine({ lastSeen, labels, locale, dark = false }: { lastSeen: string | null | undefined; labels: PresenceLabels; locale: string; dark?: boolean }) {
  const online = onlineNow(lastSeen);
  const text = online ? labels.online : lastSeen ? labels.activeAgo.replace("{time}", agoText(lastSeen, locale)) : labels.offline;
  return <span className={cx("inline-flex items-center gap-1.5", dark ? "text-brand-100" : "text-ink-500")}>
    <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full", online ? "bg-emerald-500" : dark ? "bg-white/40" : "bg-ink-300")} />
    {text}
  </span>;
}

export type DeliveryStatus = "sending" | "sent" | "seen";

export function deliveryStatus(m: { pending?: boolean; createdAt: string }, counterpartReadAt: string | null | undefined): DeliveryStatus {
  if (m.pending) return "sending";
  return counterpartReadAt && counterpartReadAt >= m.createdAt ? "seen" : "sent";
}

/** Dấu dưới tin của mình: đồng hồ khi đang gửi, một tích khi đã gửi, hai tích xanh khi đã xem. */
export function DeliveryTicks({ status, labels, showText = false }: { status: DeliveryStatus; labels: PresenceLabels; showText?: boolean }) {
  const label = status === "sending" ? labels.sending : status === "seen" ? labels.seen : labels.sent;
  const Icon = status === "sending" ? Clock3 : status === "seen" ? CheckCheck : Check;
  return <span className={cx("inline-flex items-center gap-0.5", status === "seen" ? "text-sky-600" : "text-ink-400")} title={label}>
    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    <span className={showText ? "text-[10.5px] font-medium" : "sr-only"}>{label}</span>
  </span>;
}
