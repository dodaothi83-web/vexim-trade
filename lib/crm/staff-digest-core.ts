/**
 * Email tổng hợp buổi sáng cho nhân viên Vexim (chủ dự án duyệt 28/11/2026). Phần thuần: lịch gửi,
 * ghép nội dung. Phần đọc dữ liệu và gửi nằm ở staff-digest.ts.
 *
 * - Admin nhận bản đầy đủ: việc cần làm, cần để ý, số liệu hôm qua.
 * - Nhân viên kinh doanh nhận bản chỉ gồm nhà cung cấp và người mua mình phụ trách. Chưa được giao
 *   ai thì không nhận.
 * - Thứ Hai đến thứ Sáu, từ 8 giờ sáng giờ Việt Nam; mỗi người tối đa một thư mỗi ngày.
 * - Không có việc cần làm và không có gì cần để ý thì không gửi.
 * Email lẻ cho việc gấp (RFQ mới, chat bị bỏ quên) vẫn giữ nguyên; thư này chỉ là danh sách việc.
 */
export const DIGEST_HOUR_VN = 8;
const VN_OFFSET_MS = 7 * 3_600_000;

/** Ngày theo giờ Việt Nam dạng YYYY-MM-DD. */
export function vnDate(ms: number): string {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Khoảng [bắt đầu, kết thúc) của ngày hôm qua theo giờ Việt Nam, dạng ISO. */
export function vnYesterdayRange(ms: number): { from: string; to: string; day: string } {
  const startToday = Date.parse(`${vnDate(ms)}T00:00:00Z`) - VN_OFFSET_MS;
  const from = startToday - 86_400_000;
  return { from: new Date(from).toISOString(), to: new Date(startToday).toISOString(), day: vnDate(from) };
}

/** Hôm nay có phải ngày gửi và đã tới giờ gửi chưa (thứ Hai đến thứ Sáu, từ 8 giờ). */
export function digestWindowOpen(ms: number): boolean {
  const vn = new Date(ms + VN_OFFSET_MS);
  const day = vn.getUTCDay();
  return day >= 1 && day <= 5 && vn.getUTCHours() >= DIGEST_HOUR_VN;
}

/** Khoá một lần gửi trong audit_log: mỗi người một thư mỗi ngày. */
export const digestKey = (userId: string, ms: number) => `${userId}:${vnDate(ms)}`;

export interface DigestLine { label: string; count: number; href: string; detail?: string }
export interface DigestStat { label: string; value: number | null }

export interface DigestContent {
  recipientName: string | null;
  scope: "admin" | "sale";
  todo: DigestLine[];
  watch: DigestLine[];
  /** Chỉ có ở bản admin. */
  yesterday: DigestStat[];
  origin: string;
}

const nf = new Intl.NumberFormat("vi-VN");

export function digestHasContent(content: Pick<DigestContent, "todo" | "watch">): boolean {
  return content.todo.some((l) => l.count > 0) || content.watch.some((l) => l.count > 0);
}

export function buildDigestEmail(content: DigestContent): { subject: string; html: string; text: string } {
  const escapeHtml = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const todo = content.todo.filter((l) => l.count > 0);
  const watch = content.watch.filter((l) => l.count > 0);
  const lead = todo.slice(0, 2).map((l) => `${nf.format(l.count)} ${l.label.toLowerCase()}`);
  const subject = todo.length
    ? `Việc hôm nay trên Vexim: ${lead.join(", ")}${todo.length > 2 ? ` và ${todo.length - 2} việc khác` : ""}`
    : `Vexim hôm nay: ${watch.slice(0, 2).map((l) => `${nf.format(l.count)} ${l.label.toLowerCase()}`).join(", ")}`;
  const greeting = content.recipientName?.trim() ? `Chào ${content.recipientName.trim()},` : "Chào bạn,";
  const intro = content.scope === "sale"
    ? "Đây là việc của các nhà cung cấp và người mua bạn đang phụ trách."
    : "Đây là những việc đang chờ trên Vexim sáng nay.";
  const link = (path: string) => `${content.origin}${path}`;

  const section = (title: string, lines: DigestLine[]) => lines.length ? {
    html: `<p><strong>${escapeHtml(title)}</strong></p><ul>${lines.map((l) =>
      `<li><a href="${escapeHtml(link(l.href))}">${escapeHtml(`${nf.format(l.count)} ${l.label.toLowerCase()}`)}</a>${l.detail ? `<br/><span style="color:#64748b">${escapeHtml(l.detail)}</span>` : ""}</li>`).join("")}</ul>`,
    text: [title, ...lines.map((l) => `- ${nf.format(l.count)} ${l.label.toLowerCase()}${l.detail ? ` (${l.detail})` : ""}: ${link(l.href)}`), ""],
  } : null;

  const parts = [section("Việc cần làm", todo), section("Cần để ý", watch)].filter((p): p is NonNullable<typeof p> => !!p);
  const stats = content.yesterday.filter((s) => s.value !== null);
  const statsHtml = stats.length
    ? `<p><strong>Hôm qua</strong></p><ul>${stats.map((s) => `<li>${escapeHtml(s.label)}: ${nf.format(s.value!)}</li>`).join("")}</ul>` : "";
  const statsText = stats.length ? ["Hôm qua", ...stats.map((s) => `- ${s.label}: ${nf.format(s.value!)}`), ""] : [];

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    ...parts.map((p) => p.html),
    statsHtml,
    `<p><a href="${escapeHtml(link("/crm/dashboard"))}"><strong>Mở CRM</strong></a></p>`,
    `<p style="color:#64748b">Thư này gửi mỗi sáng ngày làm việc khi có việc đang chờ. Việc gấp như RFQ mới hay chat bị bỏ quên vẫn có email riêng.</p>`,
  ].join("\n");
  const text = [
    greeting, "", intro, "",
    ...parts.flatMap((p) => p.text),
    ...statsText,
    `Mở CRM: ${link("/crm/dashboard")}`, "",
    "Thư này gửi mỗi sáng ngày làm việc khi có việc đang chờ. Việc gấp như RFQ mới hay chat bị bỏ quên vẫn có email riêng.",
  ].join("\n");
  return { subject, html, text };
}
