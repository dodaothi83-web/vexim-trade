/**
 * Nối các thư tự động của cùng một đơn thành MỘT mạch trong Gmail/Outlook.
 *
 * Vì sao cần: Gmail và Outlook gom thư theo `References` / `In-Reply-To`. Thư tự
 * động (xác nhận RFQ, bảng so sánh, báo chọn mẫu, thư theo giai đoạn) trước đây
 * gửi không kèm header nào nên mỗi thư đứng riêng; người mua phải lục lại từng
 * thư khi muốn xem lại quá trình.
 *
 * Cách làm không cần thêm cột: Message-ID tự mang tên mạch và số thứ tự, dạng
 *   <rfq.rfq-20261101-00042.3@veximtrade.com>
 * nên chỉ cần đọc lại các bản ghi email_messages của mạch đó là biết thư trước.
 */
import { MAIL_DOMAIN } from "@/lib/config";
import { getStore } from "@/lib/db";

export interface MailThread {
  /** Message-ID của thư sắp gửi */
  messageId: string;
  /** Header cần gắn: rỗng với thư đầu mạch, có In-Reply-To/References từ thư thứ hai */
  headers: Record<string, string>;
  /** Số thứ tự của thư trong mạch (1 = thư đầu) */
  seq: number;
}

/** Bỏ dấu, chỉ giữ chữ và số: "RFQ-20261101-00042" → "rfq-20261101-00042". */
function slug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Tên mạch thư. Có mã RFQ thì cả đơn dùng chung một mạch (`rfq.<mã>`); người mua
 * chưa có RFQ (đơn do CRM tạo tay) thì mạch tính theo hồ sơ người mua.
 */
export function mailTopic(input: { rfqCode?: string | null; buyerId: string }): string {
  const code = input.rfqCode?.trim();
  if (code) return `rfq.${slug(code)}`;
  return `buyer.${slug(input.buyerId)}`;
}

/** Message-ID của thư thứ `seq` trong mạch. */
export function messageIdFor(topic: string, seq: number): string {
  return `<${topic}.${seq}@${MAIL_DOMAIN}>`;
}

/**
 * Đọc các thư đã gửi trong mạch để dựng header nối tiếp.
 * Không đọc được dữ liệu thì trả về thư đầu mạch: gửi được vẫn hơn là chặn gửi.
 */
export async function openThread(topic: string): Promise<MailThread> {
  const store = getStore();
  const messages = await Promise.resolve()
    .then(() => store.listMessages(500))
    .catch(() => []);

  const prefix = `<${topic}.`;
  const seqs: { seq: number; id: string }[] = [];
  for (const message of messages ?? []) {
    const id = message?.rfc_message_id;
    if (!id || !id.startsWith(prefix)) continue;
    // Chỉ nối vào thư đã tới nơi: bản nháp và thư gửi lỗi chưa từng hiện trong hộp thư người nhận.
    if (message.status !== "sent" && message.status !== "simulated") continue;
    const seq = Number.parseInt(id.slice(prefix.length).split("@")[0], 10);
    if (Number.isFinite(seq) && seq > 0) seqs.push({ seq, id });
  }

  seqs.sort((a, b) => a.seq - b.seq);
  const seq = (seqs[seqs.length - 1]?.seq ?? 0) + 1;
  const messageId = messageIdFor(topic, seq);
  // Tự đặt Message-ID để thư sau có cái mà trỏ tới; Resend chuyển tiếp header này.
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (seqs.length) {
    headers["In-Reply-To"] = seqs[seqs.length - 1].id;
    headers["References"] = seqs.map((item) => item.id).join(" ");
  }
  return { messageId, headers, seq };
}

/**
 * Mã RFQ của người mua, dùng làm "Ref" trong tiêu đề và nhãn thư nhà cung cấp
 * thay cho mã nội bộ ngẫu nhiên (VXT-…). Không có RFQ thì trả null.
 */
export async function rfqCodeForBuyer(buyerId: string): Promise<string | null> {
  const store = getStore();
  const rfqs = await Promise.resolve()
    .then(() => store.listRfqs())
    .catch(() => []);
  const mine = (rfqs ?? []).filter((rfq) => rfq.buyer_id === buyerId);
  if (!mine.length) return null;
  mine.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return mine[0].code ?? null;
}
