/** RFQ outreach: buyer-provided contact details accompany each *actually sent* invitation.
 * Legacy requests without explicit per-RFQ consent are not dispatched under the old
 * anonymous flow. Reply-To continues to route responses to the correct Vexim match.
 */
import brandColors from "@/lib/brand/colors.json";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { transport } from "@/lib/email/send";
import { FROM_ADDRESS, COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { getStore } from "@/lib/db";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { requireRfqStaffSender } from "@/lib/rfq/staff-sender";
import { canInviteSupplier, portalApproved } from "@/lib/supplier-portal/onboarding";
import { buyerReplyAddress, supplierReplyAddress } from "@/lib/rfq/reply-routing";
import { mailTopic, openThread } from "@/lib/email/threading";
import type { Buyer, EmailMessage, Rfq, RfqMatch, Supplier } from "@/lib/types";
import { rfqBuyerContact, type RfqBuyerContact } from "./buyer-contact";
import { attachBuyerAfterDirectRfqDelivery } from "./attach-buyer";

function rfqCode(rfq: Rfq) {
  return rfq.code;
}

function shortQty(rfq: Rfq) {
  return rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "Chưa nêu";
}

function shortIncoterm(rfq: Rfq) {
  return rfq.incoterm ?? "FOB (thảo luận)";
}

function buyerContactEmailBlock(contact: RfqBuyerContact): string {
  const rows: Array<[string, string | null]> = [
    ["Doanh nghiệp", contact.company], ["Người liên hệ", contact.contact_name],
    ["Email", contact.email], ["Điện thoại", contact.phone],
    ["Quốc gia", contact.country], ["Website", contact.website],
    ["Loại hình", contact.business_type],
  ];
  return `<p><strong>Thông tin người mua đã đồng ý chia sẻ cho yêu cầu này:</strong></p>
    <table cellpadding="8" style="border-collapse:collapse;font-size:14px;">
      ${rows.map(([label, value]) => `<tr><td style="color:#64748b;width:170px;">${label}</td><td>${escapeHtml(value || "Chưa cung cấp")}</td></tr>`).join("")}
    </table>`;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "Chưa nêu";
  return new Date(iso).toLocaleString("vi-VN", { hour12: false });
}

/** Tháng giao dạng YYYY-MM → "MM/YYYY"; ngày chính xác vẫn dùng được cho RFQ cũ. */
function deliveryWindow(rfq: Rfq) {
  const month = typeof rfq.specs?.shipment_month === "string" ? rfq.specs.shipment_month : null;
  if (month && /^\d{4}-\d{2}$/.test(month)) return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
  return rfq.needed_by ?? "Thương lượng";
}

/** Điểm đến gồm quốc gia và cảng nếu người mua đã nêu. */
function destinationLabel(rfq: Rfq) {
  const port = typeof rfq.specs?.destination_port === "string" ? rfq.specs.destination_port.trim() : "";
  const country = rfq.destination_country?.trim() ?? "";
  if (country && port) return `${country} · ${port}`;
  return country || port || null;
}

/**
 * Giá mục tiêu của người mua KHÔNG được mặc định lộ cho nhà cung cấp.
 * Chỉ in ra khi người mua đã tick "chia sẻ giá mục tiêu"; ngược lại ghi rõ là không công khai
 * để NCC chào giá tốt nhất thay vì chào đúng mức trần của người mua.
 */
function targetPriceLabel(rfq: Rfq): { text: string; shared: boolean } {
  if (!rfq.target_price) return { text: "Chưa công khai. Vui lòng chào giá tốt nhất.", shared: false };
  if (rfq.specs?.share_target_price !== true) {
    return { text: "Người mua chưa đồng ý chia sẻ giá mục tiêu. Vui lòng chào giá tốt nhất.", shared: false };
  }
  const unit = typeof rfq.specs?.target_price_unit === "string" && rfq.specs.target_price_unit.trim()
    ? `/${rfq.specs.target_price_unit.trim()}`
    : "";
  return { text: `${rfq.target_price} ${rfq.target_price_currency ?? ""}${unit}`.trim(), shared: true };
}

/* ------------------------------------------------------------------ */
/* 1) Gửi RFQ kèm thông tin liên hệ đã được người mua đồng ý            */
/* ------------------------------------------------------------------ */

export function buildRfqSupplierEmail(input: {
  rfq: Rfq;
  supplier: Supplier;
  deadline: Date;
  /**
   * Nhà cung cấp đã có cổng được duyệt thì báo giá và trao đổi trên cổng, không qua email.
   * Chỉ hồ sơ do Vexim tự tạo (chưa có tài khoản) mới trả lời bằng email cho người phụ trách.
   */
  portalUrl?: string | null;
}) {
  const { rfq, supplier, deadline, portalUrl = null } = input;
  // The consented contact block is the only place for buyer identity. Product text
  // remains scrubbed; it may contain third-party details the buyer did not authorize.
  const contact = rfqBuyerContact(rfq, supplier.id);
  if (!contact) throw new Error("RFQ thiếu đồng ý chia sẻ liên hệ cho nhà cung cấp này.");
  // RFQ text is buyer-entered; suppress direct contacts outside the approved block.
  const productLabel = withoutDirectContacts(rfq.product_text).slice(0, 150);
  const deadlineStr = deadline.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const title = `Yêu cầu báo giá ${rfqCode(rfq)}`;
  const destination = destinationLabel(rfq);
  const dest = destination
    ? `thị trường <strong>${escapeHtml(destination)}</strong>`
    : "một thị trường xuất khẩu";
  const targetPrice = targetPriceLabel(rfq);

  const body = `
    <p>Chào ${escapeHtml(supplier.contact_name ?? supplier.name)},</p>
    <p>Người mua gửi yêu cầu báo giá sang ${dest} và Vexim Trade mời bạn chào giá.</p>
    ${buyerContactEmailBlock(contact)}
    <p>Chỉ doanh nghiệp nhận RFQ được dùng liên hệ này. Không đăng công khai hoặc chuyển cho bên khác.</p>

    <table cellpadding="8" style="border-collapse:collapse;margin-top:10px;font-size:14px;">
      <tr><td style="color:#64748b;width:170px;">Mã yêu cầu</td><td><strong>${escapeHtml(rfq.code)}</strong></td></tr>
      <tr><td style="color:#64748b;">Mặt hàng</td><td><strong>${escapeHtml(productLabel)}</strong></td></tr>
      <tr><td style="color:#64748b;">Số lượng dự kiến</td><td>${escapeHtml(shortQty(rfq))}${rfq.frequency ? ` / ${escapeHtml(rfq.frequency)}` : ""}</td></tr>
      <tr><td style="color:#64748b;">Điều kiện giao</td><td>${escapeHtml(shortIncoterm(rfq))}</td></tr>
      <tr><td style="color:#64748b;">Thời gian giao mong muốn</td><td>${escapeHtml(deliveryWindow(rfq))}</td></tr>
      <tr><td style="color:#64748b;">Giá mục tiêu</td>
          <td>${escapeHtml(targetPrice.text)}</td></tr>
    </table>

    <div style="margin-top:18px;background:#fffbeb;border-left:4px solid #d97706;border-radius:8px;padding:12px 16px;">
      <div style="font-size:13px;font-weight:700;color:#b45309;">Cần gửi trước ${escapeHtml(deadlineStr)}</div>
      <ol style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:21px;color:#78350f;">
        <li>Chào giá theo đơn vị tính, kèm điều kiện thanh toán và thời gian hiệu lực báo giá.</li>
        <li>Xác nhận năng lực sản xuất, MOQ và thời gian giao hàng.</li>
        <li>Gửi chứng chỉ liên quan (SGS, HACCP, ISO, C/O...) nếu có.</li>
        ${rfq.wants_samples ? "<li>Nếu có thể gửi mẫu, vui lòng nêu rõ chi phí mẫu và cước vận chuyển.</li>" : ""}
        ${rfq.wants_inspection ? "<li>Người mua có yêu cầu kiểm định trước giao hàng, vui lòng xác nhận có hỗ trợ.</li>" : ""}
        ${rfq.wants_video_call ? "<li>Nếu được, sắp xếp một cuộc gọi video ngắn để người mua xem nhà xưởng.</li>" : ""}
      </ol>
    </div>

    ${portalUrl ? `
    <p style="margin:20px 0;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:${brandColors.primary};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Báo giá trên cổng nhà cung cấp</a></p>
    <p style="margin-top:6px;">
      Vui lòng <strong>báo giá và trao đổi trên cổng nhà cung cấp</strong>, không cần trả lời email này.
      Báo giá trên cổng được ghi nhận đúng hạn và chuyển cho người mua nhanh hơn.
      Không sao chép hay chuyển tiếp cho bên thứ ba.
    </p>` : `
    <p style="margin-top:18px;">
      Vui lòng <strong>trả lời trực tiếp email này</strong>. Mọi hồi âm chuyển đến người phụ trách đơn hàng.
      Không sao chép hay chuyển tiếp cho bên thứ ba.
    </p>`}

    <p>Vexim Trade<br/>Bộ phận xuất khẩu</p>
  `;

  const subject = `[${rfq.code}] Yêu cầu báo giá: ${escapeHtml(productLabel)}`;
  return {
    subject,
    html: wrapPlainEmail({ title, body, preheader: `Mời bạn chào giá cho đơn ${escapeHtml(productLabel)}, hạn ${deadlineStr}` }),
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
  const title = `Supplier comparison for request ${rfq.code}`;

  const rows = matches.map((m) => {
    const name = m.supplier.display_name ?? m.supplier.trade_name ?? m.supplier.name;
    const price = m.quote_price != null
      ? `${m.quote_price} ${m.quote_currency ?? ""}/${m.quote_unit ?? rfq.unit ?? ""}`
      : "Quote pending";
    const lead = m.quote_lead_time_days ? `${m.quote_lead_time_days} days` : "Not quoted";
    const incoterm = m.quote_incoterm ?? "Not quoted";
    const loc = m.supplier.province ?? m.supplier.country ?? "VN";
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(name)}</strong><br/><span style="color:#64748b;font-size:12px;">${escapeHtml(loc)}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(price)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(incoterm)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(lead)}</td>
    </tr>`;
  }).join("");

  const body = `
    <p>Dear ${escapeHtml(buyer.contact_name?.split(" ")[0] ?? "there")},</p>
    <p>Thank you for your patience. Below is the supplier comparison for request
    <strong>${escapeHtml(rfq.code)}</strong> (${escapeHtml(rfq.product_text)},
    ${escapeHtml(shortQty(rfq))}).</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:12px;font-size:13.5px;">
      <thead>
        <tr style="background:#f8fafc;color:#475569;font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;">
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Supplier</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Price</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Incoterm</th>
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">Lead time</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin-top:18px;"><strong>What happens next</strong></p>
    <ul>
      <li>Tell us which one or two suppliers you want to explore further (samples, certificates, adjusted terms).</li>
      <li>We arrange the introduction, the sample shipment and inspection support if you need it.</li>
      <li>${matches.some((m) => rfqBuyerContact(rfq, m.supplier_id))
        ? "Only suppliers sent this RFQ receive the buyer contact details you provided."
        : "Your earlier request requires separate permission before we can share your contact details."}</li>
    </ul>

    <p>Reply to this email with any question, or view the request in your buyer account:<br/>
    <a href="${SITE_URL}/buyer/account/requests/${encodeURIComponent(rfq.id)}">View enquiry</a></p>

    <p>${escapeHtml(COMPANY.name)}<br/>Export Department</p>
  `;

  const subject = `Supplier comparison for ${rfq.product_text} (Ref ${rfq.code})`;
  return {
    subject,
    html: wrapPlainEmail({ title, body, preheader: `Comparison of ${matches.length} suppliers for request ${rfq.code}` }),
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

/** Gửi RFQ kèm liên hệ được đồng ý tới đúng các match được chọn và chấp nhận bởi email provider. */
export async function dispatchRfqToSuppliers(input: {
  rfqId: string;
  matchIds: string[];
  deadlineDays?: number;
  actorId: string;
}): Promise<{ sent: number; skipped: number }> {
  const store = getStore();
  const rfq = await store.getRfq(input.rfqId);
  if (!rfq) throw new Error("RFQ not found");
  if (rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question") {
    throw new Error("Đây là câu hỏi trực tiếp cho nhà cung cấp, không dùng quy trình gửi yêu cầu báo giá.");
  }
  const matches = await store.listRfqMatches(rfq.id);
  const pending = matches.filter((m) => input.matchIds.includes(m.id) && m.status === "proposed" && !m.sent_to_supplier_at);
  if (pending.some((m) => !rfqBuyerContact(rfq, m.supplier_id))) {
    throw new Error("RFQ chưa có đồng ý chia sẻ liên hệ với nhà cung cấp được chọn. Hãy hỏi người mua trước khi gửi.");
  }
  const supplierIds = new Set(pending.map((m) => m.supplier_id));
  // Verify the dashboard migration before sending any email, so an invitation is never sent
  // without a durable response deadline / supplier-facing record.
  if (supplierIds.size) await Promise.all([
    store.listSupplierRfqInvitations([...supplierIds][0]), store.listSupplierNoticeReads([...supplierIds][0]),
  ]);
  const sender = supplierIds.size ? await requireRfqStaffSender(input.actorId) : null;
  const suppliers = (await store.listSuppliers()).filter((s) => supplierIds.has(s.id));
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + (input.deadlineDays ?? 3));

  let sent = 0;
  let skipped = 0;
  for (const m of matches) {
    if (!input.matchIds.includes(m.id)) continue;
    // Initial invitations are one-shot; follow-ups have a separate staff action.
    if (m.sent_to_supplier_at || m.status !== "proposed") { skipped++; continue; }
    const sup = supMap.get(m.supplier_id);
    if (!sup || !sup.email || !(await canInviteSupplier(sup, store))) {
      skipped += 1;
      continue;
    }
    const portalUrl = portalApproved(sup) ? `${SITE_URL}/supplier/portal/rfqs` : null;
    const email = buildRfqSupplierEmail({ rfq, supplier: sup, deadline, portalUrl });
    const delivery = await transport({
      to: [sup.email],
      from: sender!.header,
      replyTo: supplierReplyAddress(rfq.code, m.id),
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: {
        "X-RFQ-Code": rfq.code,
        "X-RFQ-Match": m.id,
      },
    });
    if (!delivery.ok || delivery.status !== "sent") {
      console.error(`[rfq] gửi nhà cung cấp ${sup.id} thất bại: ${delivery.error || (delivery.status === "simulated" ? "email chỉ được mô phỏng" : "chưa được Resend nhận")}`);
      skipped += 1;
      continue;
    }
    await store.updateRfqMatch(m.id, {
      status: "sent_to_supplier",
      sent_to_supplier_at: new Date().toISOString(),
      response_due_at: deadline.toISOString(),
    });
    // The invitation is now durably sent. CRM attachment is a separate, idempotent
    // best-effort side effect: failure must never trigger a duplicate supplier email.
    await attachBuyerAfterDirectRfqDelivery(store, rfq, m.id)
      .catch((error) => console.error("[rfq] delivered but CRM attachment failed", error));
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
      created_by: input.actorId,
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
  const mailThread = await openThread(mailTopic({ rfqCode: rfq.code, buyerId: buyer.id }));
  const delivery = await transport({
    to: [buyer.email],
    cc: buyer.cc_emails ? buyer.cc_emails.split(",").map((c) => c.trim()).filter(Boolean) : undefined,
    from: FROM_ADDRESS,
    replyTo: buyerReplyAddress(rfq.code),
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: { "X-RFQ-Code": rfq.code, ...mailThread.headers },
  });
  // A simulated message is not a delivered shortlist; never advance match/RFQ status on it.
  if (!delivery.ok || delivery.status !== "sent") throw new Error(`Không gửi được shortlist người mua: ${delivery.error ?? "Resend chưa gửi thật"}`);

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
    rfc_message_id: mailThread.messageId,
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

/**
 * Chốt một NCC cho RFQ: match `selected`, các match khác `not_selected`,
 * và ghi `introductions` (mốc chọn nhà cung cấp + thời gian bảo hộ 12 tháng) nếu chưa có.
 *
 * Đồng ý chia sẻ thông tin liên hệ được ghi trên TỪNG RFQ lúc gửi form, không suy ra
 * từ introductions (bản ghi chọn NCC xuất hiện muộn hơn việc gửi lời mời).
 *
 * Dùng chung cho cả nút "Chọn nhà cung cấp" và luồng "Chuyển sang sampling", vì trước đây
 * luồng sampling bỏ qua bước này nên hai đường chốt NCC cho ra hai kết quả dữ liệu khác nhau.
 */
export async function recordSupplierSelection(rfq: Rfq, match: RfqMatch): Promise<void> {
  const store = getStore();
  await store.updateRfqMatch(match.id, { status: "selected" });
  const others = (await store.listRfqMatches(rfq.id)).filter((m) => m.id !== match.id);
  for (const m of others) {
    if (m.status !== "selected" && m.status !== "declined") {
      await store.updateRfqMatch(m.id, { status: "not_selected" });
    }
  }
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
}

/** Khi buyer chọn một NCC: đánh dấu selected và ghi bản ghi Giới thiệu (bảo hộ 12 tháng). */
export async function selectSupplier(input: { rfqId: string; matchId: string; actorId: string }): Promise<{ selected: boolean; email: "sent" | "failed" | "skipped" }> {
  const store = getStore();
  const rfq = await store.getRfq(input.rfqId);
  if (!rfq) throw new Error("RFQ not found");
  const match = await store.getRfqMatch(input.matchId);
  if (!match || match.rfq_id !== rfq.id) return { selected: false, email: "skipped" };
  if (rfq.status === "lost" || rfq.status === "spam") throw new Error("RFQ đã đóng; không thể chốt nhà cung cấp.");
  // Khớp SELECTABLE_MATCH_STATUSES trong lib/rfq/workflow.ts.
  if (!["quoted", "presented_to_buyer", "selected"].includes(match.status)) throw new Error("Chỉ chốt nhà cung cấp đã có báo giá.");
  const newlySelected = match.status !== "selected";
  await recordSupplierSelection(rfq, match);
  await store.updateRfq(rfq.id, { status: "won" });
  const email = newlySelected ? await notifySelectedSupplier(rfq, match, input.actorId) : "skipped";
  return { selected: true, email };
}

/** Only an invited NCC is contacted; caller must ensure a real staff transition, never a draft save. */
export async function notifySelectedSupplier(rfq: Rfq, match: RfqMatch, actorId: string): Promise<"sent" | "failed" | "skipped"> {
  const store = getStore();
  // Only an actually invited, consented supplier may receive the milestone mail.
  // Old RFQs without recorded consent stay off this email path; never fall back to anonymity.
  if (!match.sent_to_supplier_at || match.status === "proposed") return "skipped";
  const contact = rfqBuyerContact(rfq, match.supplier_id);
  if (!contact) return "skipped";
  let email: "sent" | "failed" = "failed";
  try {
    const supplier = await store.getSupplier(match.supplier_id);
    if (supplier?.email && await canInviteSupplier(supplier, store)) {
      const sender = await requireRfqStaffSender(actorId);
      const subject = `[${rfq.code}] Vexim đã chọn hồ sơ của bạn`;
      const body = `<p>Vexim đã chọn hồ sơ chào giá của bạn cho yêu cầu <strong>${escapeHtml(rfq.code)}</strong>. Vexim sẽ liên hệ để thống nhất bước tiếp theo.</p>
        ${buyerContactEmailBlock(contact)}
        <p><a href="${SITE_URL}/supplier/portal/rfqs">Xem yêu cầu trong cổng nhà cung cấp</a></p>`;
      const delivery = await transport({ to: [supplier.email], from: sender.header,
        replyTo: supplierReplyAddress(rfq.code, match.id), subject,
        html: wrapPlainEmail({ title: escapeHtml(subject), body }),
        text: stripHtml(body),
        headers: { "X-RFQ-Code": rfq.code, "X-RFQ-Match": match.id } });
      if (delivery.ok && delivery.status === "sent") email = "sent";
      else console.warn("[rfq] supplier selection email not sent; portal status saved", delivery.error ?? delivery.status);
    }
  } catch (error) { console.error("[rfq] supplier selection email failed; portal status saved", error); }
  return email;
}
