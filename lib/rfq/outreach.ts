/**
 * Workflow gửi RFQ cho nhà cung cấp dưới dạng ẨN DANH + gửi bảng so sánh cho buyer.
 * Chính sách ẩn danh:
 *   - Supplier KHÔNG thấy tên công ty / email / điện thoại buyer cho đến khi buyer
 *     chủ động đồng ý làm việc trực tiếp với NCC đó (chuyển match sang `selected`).
 *   - Sau khi match được selected, tạo Introduction với protected_until = +12 tháng
 *     (các RFQ sau trong 12 tháng vẫn được ghép qua Vexim — supplier không được
 *     bỏ qua Vexim để giao dịch trực tiếp).
 *   - Địa chỉ Reply-To trong email cho supplier được đặt là hộp chức năng của
 *     phòng sale (VD rfq+RFQxxxx@veximtrade.com) để mọi thư trả lời đi về Vexim.
 */
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS, COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import { buyerReplyAddress, supplierReplyAddress } from "@/lib/rfq/reply-routing";
import type { Buyer, EmailMessage, Rfq, RfqMatch, Supplier } from "@/lib/types";

function rfqCode(rfq: Rfq) {
  return rfq.code;
}

function shortQty(rfq: Rfq) {
  return rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "—";
}

function shortIncoterm(rfq: Rfq) {
  return rfq.incoterm ?? "FOB (thảo luận)";
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { hour12: false });
}

/* ------------------------------------------------------------------ */
/* 1) Gửi RFQ ẩn danh cho NCC                                          */
/* ------------------------------------------------------------------ */

export function buildRfqSupplierEmail(input: {
  rfq: Rfq;
  supplier: Supplier;
  deadline: Date;
}) {
  const { rfq, supplier, deadline } = input;
  const deadlineStr = deadline.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const title = `Yêu cầu báo giá mật mã ${rfqCode(rfq)}`;
  const dest = rfq.destination_country
    ? `thị trường <strong>${escapeHtml(rfq.destination_country)}</strong>`
    : "một thị trường xuất khẩu";

  const body = `
    <p>Kính gửi Anh/Chị ${escapeHtml(supplier.contact_name ?? supplier.name)},</p>
    <p>Phòng Xuất khẩu <strong>${escapeHtml(COMPANY.name)}</strong> đang làm việc với
    một khách hàng ${dest} và muốn mời Anh/Chị tham gia chào giá cho đơn hàng sau.</p>

    <p style="color:#b91c1c;font-size:12.5px;">
      ⚠ Thông tin danh tính buyer hiện được bảo mật và sẽ chỉ được tiết lộ khi hai bên
      thống nhất điều khoản cơ bản. Vui lòng không yêu cầu thông tin buyer trong phản hồi đầu tiên.
    </p>

    <table cellpadding="8" style="border-collapse:collapse;margin-top:10px;font-size:14px;">
      <tr><td style="color:#64748b;width:170px;">Mã yêu cầu</td><td><strong>${escapeHtml(rfq.code)}</strong></td></tr>
      <tr><td style="color:#64748b;">Mặt hàng</td><td><strong>${escapeHtml(rfq.product_text)}</strong></td></tr>
      <tr><td style="color:#64748b;">Số lượng dự kiến</td><td>${escapeHtml(shortQty(rfq))}${rfq.frequency ? ` / ${escapeHtml(rfq.frequency)}` : ""}</td></tr>
      <tr><td style="color:#64748b;">Điều kiện giao</td><td>${escapeHtml(shortIncoterm(rfq))}</td></tr>
      <tr><td style="color:#64748b;">Ngày giao mong muốn</td><td>${escapeHtml(rfq.needed_by ?? "Thương lượng")}</td></tr>
      <tr><td style="color:#64748b;">Giá mục tiêu</td>
          <td>${rfq.target_price ? `${rfq.target_price} ${escapeHtml(rfq.target_price_currency ?? "")}` : "Chưa công khai — vui lòng chào giá tốt nhất"}</td></tr>
    </table>

    ${String((rfq.specs as Record<string, unknown>)?.notes ?? "") ? `
      <p style="margin-top:14px;"><strong>Ghi chú bổ sung từ buyer:</strong></p>
      <div style="background:#f8fafc;border-left:3px solid #cbd5e1;padding:10px 14px;border-radius:6px;color:#334155;font-size:13.5px;">
        ${escapeHtml(String((rfq.specs as Record<string, unknown>)?.notes))}
      </div>` : ""}

    <div style="margin-top:18px;background:#fffbeb;border-left:4px solid #d97706;border-radius:8px;padding:12px 16px;">
      <div style="font-size:11px;font-weight:800;color:#d97706;letter-spacing:.6px;">VIỆC CẦN LÀM — HẠN ${escapeHtml(deadlineStr)}</div>
      <ol style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:21px;color:#78350f;">
        <li>Chào giá theo đơn vị tính, kèm điều kiện thanh toán và thời gian hiệu lực báo giá.</li>
        <li>Xác nhận năng lực sản xuất / MOQ / thời gian giao hàng.</li>
        <li>Gửi chứng chỉ liên quan (SGS, HACCP, ISO, C/O...) nếu có.</li>
        ${rfq.wants_samples ? "<li>Nếu có thể gửi mẫu, vui lòng nêu rõ chi phí mẫu và cước vận chuyển.</li>" : ""}
        ${rfq.wants_inspection ? "<li>Buyer có yêu cầu kiểm định trước giao hàng — vui lòng xác nhận có hỗ trợ.</li>" : ""}
        ${rfq.wants_video_call ? "<li>Nếu được, sắp xếp một cuộc gọi video ngắn để buyer xem nhà xưởng.</li>" : ""}
      </ol>
    </div>

    <p style="margin-top:18px;">
      Vui lòng <strong>trả lời trực tiếp email này</strong> — toàn bộ hồi âm sẽ được chuyển
      đến người phụ trách đơn hàng. Không sao chép hay chuyển tiếp cho bên thứ ba.
    </p>

    <p>Trân trọng,<br/>Phòng Xuất khẩu · ${escapeHtml(COMPANY.name)}</p>
  `;

  const subject = `[${rfq.code}] Yêu cầu báo giá — ${escapeHtml(rfq.product_text)}`;
  return {
    subject,
    html: wrapPlainEmail({ title, body, preheader: `Mời Anh/Chị chào giá cho đơn ${escapeHtml(rfq.product_text)} — hạn ${deadlineStr}` }),
    text: stripHtml(body),
  };
}

/* ------------------------------------------------------------------ */
/* 2) Gửi bảng so sánh cho buyer sau khi NCC đã báo giá                 */
/* ------------------------------------------------------------------ */

export function buildRfqShortlistBuyerEmail(input: {
  rfq: Rfq;
  buyer: Buyer;
  matches: Array<RfqMatch & { supplier: Supplier }>;
}) {
  const { rfq, buyer, matches } = input;
  const title = `Bảng so sánh nhà cung cấp cho yêu cầu ${rfq.code}`;

  const rows = matches.map((m) => {
    const name = m.supplier.display_name ?? m.supplier.trade_name ?? m.supplier.name;
    const price = m.quote_price != null
      ? `${m.quote_price} ${m.quote_currency ?? ""}/${m.quote_unit ?? rfq.unit ?? ""}`
      : "Đang chào giá";
    const lead = m.quote_lead_time_days ? `${m.quote_lead_time_days} ngày` : "—";
    const incoterm = m.quote_incoterm ?? "—";
    const loc = m.supplier.province ?? m.supplier.country ?? "VN";
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(name)}</strong><br/><span style="color:#64748b;font-size:12px;">${escapeHtml(loc)}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(price)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(incoterm)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(lead)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12.5px;color:#475569;">${escapeHtml(m.internal_note ?? "—")}</td>
    </tr>`;
  }).join("");

  const body = `
    <p>Dear ${escapeHtml(buyer.contact_name?.split(" ")[0] ?? "there")},</p>
    <p>Cảm ơn bạn đã chờ đợi. Dưới đây là bảng so sánh các nhà cung cấp chúng tôi đã rút gọn
    cho yêu cầu <strong>${escapeHtml(rfq.code)}</strong> (${escapeHtml(rfq.product_text)},
    ${escapeHtml(shortQty(rfq))}).</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:12px;font-size:13.5px;">
      <thead>
        <tr style="background:#f8fafc;color:#475569;font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;">
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Nhà cung cấp</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Giá</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">ĐK giao</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Lead time</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Ghi chú Vexim</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin-top:18px;"><strong>Các bước tiếp theo:</strong></p>
    <ul>
      <li>Cho chúng tôi biết 1–2 nhà cung cấp bạn muốn đi sâu (mẫu, chứng chỉ, điều chỉnh điều khoản).</li>
      <li>Chúng tôi sẽ sắp xếp trao đổi, gửi mẫu và hỗ trợ kiểm định nếu cần.</li>
      <li>Danh tính bạn vẫn được giữ kín đối với nhà cung cấp cho đến khi bạn chủ động đồng ý kết nối.</li>
    </ul>

    <p>Mọi phản hồi, vui lòng trả lời trực tiếp email này hoặc dùng link theo dõi:<br/>
    <a href="${SITE_URL}/rfq/status/${rfq.access_token}">${SITE_URL}/rfq/status/${rfq.access_token}</a></p>

    <p>Best regards,<br/>Export Department · ${escapeHtml(COMPANY.name)}</p>
  `;

  const subject = `[${rfq.code}] Shortlist nhà cung cấp — ${escapeHtml(rfq.product_text)}`;
  return {
    subject,
    html: wrapPlainEmail({ title, body, preheader: `Bảng so sánh ${matches.length} nhà cung cấp cho yêu cầu ${rfq.code}` }),
    text: stripHtml(body),
  };
}

/* ------------------------------------------------------------------ */
/* 3) Helpers + orchestration                                          */
/* ------------------------------------------------------------------ */

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Gửi RFQ ẩn danh cho tập hợp match IDs; trả về số email đã lên lịch. */
export async function dispatchRfqToSuppliers(input: {
  rfqId: string;
  matchIds: string[];
  deadlineDays?: number;
}): Promise<{ sent: number; skipped: number }> {
  const store = getStore();
  const rfq = await store.getRfq(input.rfqId);
  if (!rfq) throw new Error("RFQ not found");
  const matches = await store.listRfqMatches(rfq.id);
  const supplierIds = new Set(matches.filter((m) => input.matchIds.includes(m.id)).map((m) => m.supplier_id));
  const suppliers = (await store.listSuppliers()).filter((s) => supplierIds.has(s.id));
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + (input.deadlineDays ?? 3));

  let sent = 0;
  let skipped = 0;
  for (const m of matches) {
    if (!input.matchIds.includes(m.id)) continue;
    const sup = supMap.get(m.supplier_id);
    if (!sup || !sup.email) {
      skipped += 1;
      continue;
    }
    const email = buildRfqSupplierEmail({ rfq, supplier: sup, deadline });
    const delivery = await transport({
      to: [sup.email],
      from: FROM_ADDRESS,
      replyTo: supplierReplyAddress(rfq.code, m.id),
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: {
        "X-RFQ-Code": rfq.code,
        "X-RFQ-Match": m.id,
        "X-Vexim-Anonymous": "1",
      },
    });
    if (!delivery.ok) {
      console.error(`[rfq] gửi NCC ${sup.id} thất bại: ${delivery.error}`);
      skipped += 1;
      continue;
    }
    await store.updateRfqMatch(m.id, {
      status: "sent_to_supplier",
      sent_to_supplier_at: new Date().toISOString(),
    });
    // Ghi vào timeline thư đi
    await store.addMessage({
      buyer_id: null,
      supplier_id: sup.id,
      rfq_id: rfq.id,
      rfq_match_id: m.id,
      kind: "rfq_outreach",
      stage: null,
      direction: "supplier",
      thread_id: `rfq-${rfq.id}-match-${m.id}`,
      subject: email.subject,
      to_emails: [sup.email],
      cc_emails: [],
      bcc_emails: [],
      body_html: email.html,
      body_text: email.text,
      attachments: [],
      rfc_message_id: null,
      read_at: null,
      status: delivery.status,
      provider: delivery.provider,
      error: null,
      created_by: null,
    } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
    sent += 1;
  }

  // Đẩy RFQ sang matching nếu có ít nhất 1 NCC được gửi
  if (sent > 0 && !["matching", "quoted", "sampling", "won", "lost", "spam"].includes(rfq.status)) {
    await store.updateRfq(rfq.id, { status: "matching" });
  }
  return { sent, skipped };
}

/** Gửi bảng so sánh cho buyer (chỉ các match đã quoted) + ghi first_response_at. */
export async function presentShortlistToBuyer(input: { rfqId: string }): Promise<{
  sent: boolean;
  quotedCount: number;
}> {
  const store = getStore();
  const rfq = await store.getRfq(input.rfqId);
  if (!rfq) throw new Error("RFQ not found");
  const buyer = await store.getBuyer(rfq.buyer_id);
  if (!buyer || !buyer.email) return { sent: false, quotedCount: 0 };
  const matches = await store.listRfqMatches(rfq.id);
  const quoted = matches.filter((m) => m.status === "quoted" && m.quote_price != null);
  if (quoted.length === 0) return { sent: false, quotedCount: 0 };
  const suppliers = await store.listSuppliers();
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const matchesWithSup = quoted
    .map((m) => {
      const supplier = supMap.get(m.supplier_id);
      return supplier ? { ...m, supplier } : null;
    })
    .filter((x): x is RfqMatch & { supplier: Supplier } => !!x);

  const email = buildRfqShortlistBuyerEmail({ rfq, buyer, matches: matchesWithSup });
  const delivery = await transport({
    to: [buyer.email],
    cc: buyer.cc_emails ? buyer.cc_emails.split(",").map((c) => c.trim()).filter(Boolean) : undefined,
    from: FROM_ADDRESS,
    replyTo: buyerReplyAddress(rfq.code),
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { "X-RFQ-Code": rfq.code },
  });
  if (!delivery.ok) throw new Error(`Không gửi được shortlist buyer: ${delivery.error}`);

  // Đánh dấu các match đã trình buyer
  for (const m of quoted) {
    await store.updateRfqMatch(m.id, { status: "presented_to_buyer", sent_to_buyer_at: new Date().toISOString() });
  }
  // Ghi timeline email shortlist
  const toEmails = [buyer.email, ...(buyer.cc_emails ? buyer.cc_emails.split(",").map((c) => c.trim()).filter(Boolean) : [])];
  await store.addMessage({
    buyer_id: buyer.id,
    supplier_id: null,
    rfq_id: rfq.id,
    rfq_match_id: null,
    kind: "shortlist_buyer",
    stage: null,
    direction: "buyer",
    thread_id: `rfq-${rfq.id}-buyer`,
    subject: email.subject,
    to_emails: toEmails as string[],
    cc_emails: [],
    bcc_emails: [],
    body_html: email.html,
    body_text: email.text,
    attachments: [],
    rfc_message_id: null,
    read_at: null,
    status: delivery.status,
    provider: delivery.provider,
    error: null,
    created_by: null,
  } as unknown as Omit<EmailMessage, "id" | "created_at" | "sent_at"> & { sent_at?: string | null });
  // Ghi nhận thời điểm trả lời đầu tiên (dùng cho SLA) và chuyển sang quoted
  await store.updateRfq(rfq.id, {
    status: "quoted",
    first_response_at: rfq.first_response_at ?? new Date().toISOString(),
  });
  return { sent: true, quotedCount: quoted.length };
}

/** Khi buyer chọn một NCC: đánh dấu selected, tạo Introduction protected 12 tháng. */
export async function selectSupplier(input: { rfqId: string; matchId: string }): Promise<boolean> {
  const store = getStore();
  const rfq = await store.getRfq(input.rfqId);
  if (!rfq) throw new Error("RFQ not found");
  const match = await store.getRfqMatch(input.matchId);
  if (!match || match.rfq_id !== rfq.id) return false;
  await store.updateRfqMatch(match.id, { status: "selected" });
  // Các NCC khác chuyển sang not_selected
  const others = (await store.listRfqMatches(rfq.id)).filter((m) => m.id !== match.id);
  for (const m of others) {
    if (m.status !== "selected" && m.status !== "declined") {
      await store.updateRfqMatch(m.id, { status: "not_selected" });
    }
  }
  // Tạo Introduction bảo hộ 12 tháng nếu chưa có
  const existing = await store.findIntroduction(rfq.buyer_id, match.supplier_id);
  if (!existing) {
    const now = new Date();
    const until = new Date(now);
    until.setFullYear(until.getFullYear() + 1);
    await store.createIntroduction({
      buyer_id: rfq.buyer_id,
      supplier_id: match.supplier_id,
      first_rfq_id: rfq.id,
      introduced_at: now.toISOString(),
      protected_until: until.toISOString(),
    });
  }
  await store.updateRfq(rfq.id, { status: "won" });
  return true;
}
