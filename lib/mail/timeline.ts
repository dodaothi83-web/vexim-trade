import type { EmailMessage } from "@/lib/types";

/**
 * Một dòng trên timeline thư của một hồ sơ (RFQ, yêu cầu tìm nguồn). Hàm thuần: chỉ
 * phân loại để giao diện gắn nhãn, không đọc dữ liệu và không đổi trạng thái thư.
 */
export type TimelineParty = "buyer" | "supplier";
export type TimelineKind = "auto" | "staff" | "reply";

export interface TimelineItem {
  id: string;
  inbound: boolean;
  party: TimelineParty;
  /** Tên nhà cung cấp khi thư gắn với một lời mời cụ thể. */
  partyName: string | null;
  partyHref: string | null;
  kind: TimelineKind;
  subject: string;
  at: string;
  unread: boolean;
  failed: boolean;
  body: string;
}

const AUTO_KINDS = new Set(["auto", "supplier_reminder"]);

/** Thư đến là trả lời; thư hệ thống tự gửi (không có người gửi) là tự động; còn lại do nhân viên gửi. */
export function timelineKind(msg: Pick<EmailMessage, "kind" | "created_by">): TimelineKind {
  if (msg.kind === "inbound") return "reply";
  if (AUTO_KINDS.has(msg.kind) || !msg.created_by) return "auto";
  return "staff";
}

export function toTimelineItem(
  msg: EmailMessage,
  supplier?: { name: string; href: string } | null,
): TimelineItem {
  const party: TimelineParty = msg.rfq_match_id || msg.direction === "supplier" ? "supplier" : "buyer";
  return {
    id: msg.id,
    inbound: msg.kind === "inbound",
    party,
    partyName: party === "supplier" ? supplier?.name ?? null : null,
    partyHref: party === "supplier" ? supplier?.href ?? null : null,
    kind: timelineKind(msg),
    subject: msg.subject || "(Không có tiêu đề)",
    at: msg.sent_at || msg.created_at,
    unread: msg.kind === "inbound" && !msg.read_at,
    failed: msg.status === "failed",
    body: (msg.body_text || "").trim(),
  };
}
