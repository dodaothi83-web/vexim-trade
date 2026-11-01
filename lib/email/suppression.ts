/**
 * Danh sách ngừng gửi thư (bounce, complaint).
 *
 * Phần này thuần, không đọc cơ sở dữ liệu, để kiểm được bằng số và dùng chung cho
 * cả webhook Resend lẫn tầng gửi thư.
 */

export type SuppressionReason = "hard_bounce" | "complaint" | "provider_suppressed" | "manual";

export type SuppressionEvent = {
  emails: string[];
  reason: SuppressionReason;
  eventType: string;
  detail: Record<string, unknown>;
};

/** Một địa chỉ chỉ tồn tại ở dạng đã chuẩn hoá, khớp với khoá chính trong cơ sở dữ liệu. */
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function recipientEmails(data: Record<string, unknown>): string[] {
  const raw = data.to;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const normalized = list.map(normalizeEmail).filter((email) => email.includes("@") && email.length <= 320);
  return [...new Set(normalized)];
}

/**
 * Đọc một sự kiện webhook Resend và trả về địa chỉ cần ngừng gửi.
 *
 * Chỉ ba loại làm ngừng gửi:
 * - email.bounced với bounce Permanent hoặc Undetermined: hộp thư không tồn tại.
 * - email.complained: người nhận coi thư là rác.
 * - email.suppressed: Resend đã tự chặn địa chỉ đó.
 * Bounce Transient (hộp thư đầy, máy chủ bận) và các sự kiện khác trả về null để
 * một lần nghẽn tạm thời không cắt vĩnh viễn địa chỉ của người nhận thật.
 */
export function suppressionFromWebhookEvent(
  event: { type?: string; data?: Record<string, unknown> } | null | undefined,
): SuppressionEvent | null {
  if (!event || typeof event.type !== "string") return null;
  const data = (event.data ?? {}) as Record<string, unknown>;
  const emails = recipientEmails(data);
  if (!emails.length) return null;

  if (event.type === "email.complained") {
    return { emails, reason: "complaint", eventType: event.type, detail: { subject: String(data.subject ?? "").slice(0, 200) } };
  }
  if (event.type === "email.suppressed") {
    const info = (data.suppressed ?? {}) as Record<string, unknown>;
    return { emails, reason: "provider_suppressed", eventType: event.type,
      detail: { type: String(info.type ?? "").slice(0, 40), message: String(info.message ?? "").slice(0, 300) } };
  }
  if (event.type === "email.bounced") {
    const bounce = (data.bounce ?? {}) as Record<string, unknown>;
    const bounceType = String(bounce.type ?? "").trim().toLowerCase();
    if (bounceType === "transient") return null;
    return { emails, reason: "hard_bounce", eventType: event.type,
      detail: { type: String(bounce.type ?? "").slice(0, 40), subType: String(bounce.subType ?? "").slice(0, 60),
        message: String(bounce.message ?? "").slice(0, 300), emailId: String(data.email_id ?? "").slice(0, 80) } };
  }
  return null;
}

/**
 * Bỏ những địa chỉ đã ngừng gửi khỏi danh sách người nhận.
 * `to` rỗng nghĩa là không còn ai nhận, tầng gửi phải dừng thay vì gửi cưỡng bức.
 */
export function filterSuppressedRecipients(
  mail: { to: string[]; cc?: string[]; bcc?: string[] },
  suppressed: ReadonlySet<string>,
): { to: string[]; cc: string[]; bcc: string[]; skipped: string[] } {
  const keep = (list: string[] | undefined) => (list ?? []).filter(Boolean);
  const skipped: string[] = [];
  const split = (list: string[] | undefined) => keep(list).filter((email) => {
    const blocked = suppressed.has(normalizeEmail(email));
    if (blocked) skipped.push(normalizeEmail(email));
    return !blocked;
  });
  return { to: split(mail.to), cc: split(mail.cc), bcc: split(mail.bcc), skipped: [...new Set(skipped)] };
}

export interface DeliveryPlan<T> {
  blocked: boolean;
  /** Thư đã bỏ các địa chỉ bị chặn; chỉ dùng khi `blocked` là false. */
  mail: T;
  skipped: string[];
  reason: string | null;
}

/**
 * Quyết định một thư còn gửi được hay không. Tách khỏi tầng gửi để kiểm được
 * bằng số, và để lý do từ chối luôn nói rõ địa chỉ nào bị chặn.
 */
export function planDelivery<T extends { to: string[]; cc?: string[]; bcc?: string[] }>(
  mail: T,
  suppressed: ReadonlySet<string>,
): DeliveryPlan<T> {
  if (suppressed.size === 0) return { blocked: false, mail, skipped: [], reason: null };
  const filtered = filterSuppressedRecipients(mail, suppressed);
  if (filtered.to.length === 0) {
    return {
      blocked: true,
      mail,
      skipped: filtered.skipped,
      reason: `Địa chỉ ${filtered.skipped.join(", ")} đã bị đánh dấu không gửi được (bounce hoặc báo cáo thư rác); thư bị bỏ qua.`,
    };
  }
  const next = { ...mail, to: filtered.to, cc: filtered.cc, bcc: filtered.bcc };
  return { blocked: false, mail: next, skipped: filtered.skipped, reason: null };
}
