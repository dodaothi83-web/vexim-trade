import { COMPANY } from "@/lib/config";
import { STAGE_CONTENT } from "@/lib/email/stage-content";
import { FUNNEL_STAGES, getStage, stageIndex, type StageKey } from "@/lib/pipeline";
import type { Buyer, Supplier } from "@/lib/types";

export interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Mã đơn nội bộ ổn định, dùng trong tiêu đề email thay cho UUID */
export function shortCode(id: string): string {
  const clean = id.replace(/-/g, "");
  let h = 0;
  for (let i = 0; i < clean.length; i++) {
    h = (h * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return `VXT-${h.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `USD ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string | null | undefined, locale: string): string {
  if (!d) return "";
  const date = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

function paymentStr(buyer: Buyer, fallback: string): string {
  const s = [buyer.payment_method, buyer.payment_terms].filter(Boolean).join(" – ");
  return s || fallback;
}

/** Thay placeholder {product}, {quantity}... bằng dữ liệu thật của đơn */
export function fill(
  tpl: string,
  buyer: Buyer,
  supplier?: Supplier | null,
): string {
  const map: Record<string, string> = {
    product: buyer.product || "your order",
    quantity: buyer.quantity || "as discussed",
    spec: buyer.spec || "as agreed",
    country: buyer.country || "overseas",
    port: buyer.port || "your destination port",
    incoterm: buyer.incoterm || "FOB",
    shipdate: fmtDate(buyer.expected_ship_date, "en-GB") || "to be confirmed",
    payment: paymentStr(buyer, "as agreed"),
    payment_vi: paymentStr(buyer, "theo thỏa thuận"),
    ref: shortCode(buyer.id),
    company: buyer.company,
    supplier: supplier?.name ?? "our production partner",
  };
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? `{${k}}`);
}

const BRAND = "#0f766e";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const SOFT = "#f8fafc";

/** Khung email dùng chung (cả email tự động lẫn email đội ngũ tự soạn) */
export function wrapEmailShell(opts: { title: string; body: string; preheader?: string }): string {
  const footer = `${escapeHtml(COMPANY.name)} &middot; ${escapeHtml(COMPANY.address)}<br/>
    ${escapeHtml(COMPANY.phone)} &middot; <a href="${escapeHtml(COMPANY.website)}" style="color:${BRAND};text-decoration:none;">${escapeHtml(COMPANY.website)}</a>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader ?? opts.title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE};">
            <tr>
              <td style="background:${BRAND};padding:20px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.4px;">${escapeHtml(COMPANY.name.toUpperCase())}</td>
                    <td align="right" style="color:#a7f3d0;font-size:12px;">${escapeHtml(COMPANY.tagline)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td style="padding:28px;" class="vxt-body"><div class="vxt-inner">${opts.body}</div></td></tr>
            <tr>
              <td style="background:${SOFT};padding:20px 28px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED};line-height:18px;">${footer}</td>
            </tr>
          </table>
          <p style="color:#94a3b8;font-size:11px;margin:14px 0 0;">${escapeHtml(COMPANY.name)} &middot; ${escapeHtml(COMPANY.website)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function progressBar(stageKey: string, lang: "en" | "vi"): string {
  const current = stageIndex(stageKey);
  const isLost = stageKey === "lost";
  const cells = FUNNEL_STAGES.map((s, i) => {
    const done = i < current && !isLost;
    const active = i === current && !isLost;
    const bg = active ? BRAND : done ? "#99f6e4" : "#e2e8f0";
    const fg = active ? "#ffffff" : done ? "#0f766e" : "#94a3b8";
    const label = lang === "vi" ? s.label : s.labelEn;
    return `<td align="center" style="width:${Math.floor(100 / FUNNEL_STAGES.length)}%;padding:0 2px;vertical-align:top;">
      <div style="background:${bg};color:${fg};border-radius:999px;font-size:11px;font-weight:700;padding:5px 2px;white-space:nowrap;overflow:hidden;">${done ? "&#10003;" : i + 1}</div>
      <div style="font-size:9px;color:${active ? INK : "#94a3b8"};margin-top:5px;line-height:12px;font-weight:${active ? 700 : 400};">${escapeHtml(label)}</div>
    </td>`;
  }).join("");

  if (isLost) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
      <tr><td style="padding:12px 16px;color:#b91c1c;font-size:13px;font-weight:600;">${lang === "vi" ? "Đơn hàng đang tạm hoãn." : "This order is currently on hold."}</td></tr>
    </table>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 22px;"><tr>${cells}</tr></table>`;
}

export function statusPill(stageKey: string, lang: "en" | "vi"): string {
  const stage = getStage(stageKey);
  const label = lang === "vi" ? stage.label : stage.labelEn;
  return `<div style="display:inline-block;background:${stage.color};color:#ffffff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:999px;letter-spacing:.3px;">${escapeHtml(label.toUpperCase())}</div>`;
}

export function summaryTable(rows: { label: string; value: string }[], header: string, labelWidth = "42%"): string {
  const body = rows
    .filter((r) => r.value && r.value !== "—")
    .map(
      (r) => `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};color:${MUTED};font-size:13px;width:${labelWidth};">${escapeHtml(r.label)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid ${LINE};color:${INK};font-size:13px;font-weight:600;">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;overflow:hidden;">
    <tr><td style="background:${SOFT};padding:10px 12px;font-size:12px;font-weight:700;color:${INK};letter-spacing:.4px;">${escapeHtml(header)}</td></tr>
    <tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr>
  </table>`;
}

function calloutBox(title: string, html: string, tone: "brand" | "amber" = "brand"): string {
  const c = tone === "brand" ? { bg: "#ecfeff", border: BRAND, fg: "#134e4a" } : { bg: "#fffbeb", border: "#d97706", fg: "#78350f" };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};border-left:4px solid ${c.border};border-radius:8px;margin-top:18px;">
    <tr><td style="padding:14px 16px;">
      <div style="font-size:11px;font-weight:800;color:${c.border};letter-spacing:.6px;margin-bottom:6px;">${escapeHtml(title)}</div>
      <div style="font-size:13px;line-height:20px;color:${c.fg};">${html}</div>
    </td></tr>
  </table>`;
}

function signature(name: string | null, role: string): string {
  return `<p style="font-size:14px;line-height:20px;margin:18px 0 0;">
      <strong>${escapeHtml(name || COMPANY.name)}</strong><br/>
      <span style="color:${MUTED};">${escapeHtml(role)} &middot; ${escapeHtml(COMPANY.name)}</span><br/>
      <span style="color:${MUTED};">${escapeHtml(COMPANY.phone)} &middot; ${escapeHtml(COMPANY.email)}</span>
    </p>`;
}

function paragraphs(list: string[]): string {
  return list
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:24px;margin:12px 0 0;">${escapeHtml(p)}</p>`,
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* EMAIL GỬI BUYER (tiếng Anh)                                        */
/* KHÔNG bao giờ đưa tên/giá nhà cung cấp vào nội dung                */
/* ------------------------------------------------------------------ */
export function buildBuyerEmail(opts: {
  buyer: Buyer;
  stage: StageKey;
  note?: string | null;
}): EmailPayload {
  const { buyer, stage } = opts;
  const copy = STAGE_CONTENT[stage].buyer;
  const name = buyer.contact_name?.trim() || buyer.company;

  const summary = summaryTable(
    [
      { label: "Product", value: buyer.product ?? "—" },
      { label: "Specification", value: buyer.spec ?? "—" },
      { label: "Quantity", value: buyer.quantity ?? "—" },
      { label: "Price term", value: buyer.incoterm ?? "—" },
      { label: "Destination port", value: buyer.port ?? "—" },
      { label: "Expected shipment", value: fmtDate(buyer.expected_ship_date, "en-GB") || "To be confirmed" },
      { label: "Our reference", value: shortCode(buyer.id) },
    ],
    "ORDER DETAILS",
  );

  const body = `
    ${statusPill(stage, "en")}
    <p style="font-size:15px;line-height:24px;margin:18px 0 0;">Dear ${escapeHtml(name)},</p>
    ${paragraphs(copy.body.map((p) => fill(p, buyer)))}
    ${progressBar(stage, "en")}
    ${summary}
    ${calloutBox("WHAT HAPPENS NEXT", escapeHtml(fill(copy.action, buyer)))}
    ${opts.note ? `<p style="font-size:14px;line-height:22px;margin:18px 0 0;padding:12px 14px;background:${SOFT};border-radius:8px;color:#334155;"><strong>Message from our team:</strong><br/>${escapeHtml(opts.note)}</p>` : ""}
    <p style="font-size:14px;line-height:22px;margin:22px 0 0;">Please feel free to reply to this email if you need any clarification.<br/>Best regards,</p>
    ${signature(buyer.owner, "Export Department")}`;

  const subject = `[${shortCode(buyer.id)}] ${fill(copy.subject, buyer)}`;

  return {
    subject,
    html: wrapEmailShell({ title: subject, body, preheader: fill(copy.body[0] ?? "", buyer) }),
    text: [
      subject,
      "",
      `Dear ${name},`,
      ...copy.body.map((p) => fill(p, buyer)),
      "",
      `Status: ${getStage(stage).labelEn}`,
      "",
      `Product: ${buyer.product ?? "-"}`,
      `Specification: ${buyer.spec ?? "-"}`,
      `Quantity: ${buyer.quantity ?? "-"}`,
      `Price term: ${buyer.incoterm ?? "-"}`,
      `Port: ${buyer.port ?? "-"}`,
      "",
      fill(copy.action, buyer),
      "",
      opts.note ? `Message from our team: ${opts.note}` : "",
      "",
      "Best regards,",
      `${buyer.owner || COMPANY.name} - Export Department, ${COMPANY.name}`,
      `${COMPANY.phone} | ${COMPANY.email}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/* ------------------------------------------------------------------ */
/* EMAIL GỬI SUPPLIER (tiếng Việt)                                    */
/* Giao VIỆC CỤ THỂ + THỜI HẠN; mặc định ẨN DANH buyer                */
/* ------------------------------------------------------------------ */
export function buildSupplierEmail(opts: {
  buyer: Buyer;
  supplier: Supplier;
  stage: StageKey;
  note?: string | null;
}): EmailPayload {
  const { buyer, supplier, stage } = opts;
  const copy = STAGE_CONTENT[stage].supplier;
  const stageDef = getStage(stage);
  const hidden = buyer.hide_buyer_from_supplier !== false;
  const buyerLabel = hidden
    ? `Khách hàng thị trường ${buyer.country || "nước ngoài"} (ẩn danh)`
    : `${buyer.company}${buyer.country ? ` – ${buyer.country}` : ""}`;

  const summary = summaryTable(
    [
      { label: "Buyer", value: buyerLabel },
      { label: "Mặt hàng", value: buyer.product ?? "—" },
      { label: "Quy cách", value: buyer.spec ?? "—" },
      { label: "Số lượng", value: buyer.quantity ?? "—" },
      { label: "Điều kiện giao", value: buyer.incoterm ?? "—" },
      { label: "Ngày giao dự kiến", value: fmtDate(buyer.expected_ship_date, "vi-VN") || "Chờ xác nhận" },
      { label: "Mã đơn nội bộ", value: shortCode(buyer.id) },
    ],
    "THÔNG TIN ĐƠN HÀNG",
    "38%",
  );

  const tasks = copy.tasks
    .map((t) => `<li style="margin:0 0 7px;padding-left:2px;">${escapeHtml(fill(t, buyer, supplier))}</li>`)
    .join("");

  const taskBox = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:4px solid #d97706;border-radius:8px;margin-top:18px;">
    <tr><td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;font-weight:800;color:#d97706;letter-spacing:.6px;">VIỆC CẦN LÀM</td>
        <td align="right" style="font-size:11px;font-weight:800;color:#b45309;">HẠN: ${escapeHtml(fill(copy.deadline, buyer, supplier))}</td>
      </tr></table>
      <ol style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:20px;color:#78350f;">${tasks}</ol>
    </td></tr>
  </table>`;

  const body = `
    ${statusPill(stage, "vi")}
    <p style="font-size:15px;line-height:24px;margin:18px 0 0;">Kính gửi Anh/Chị ${escapeHtml(supplier.contact_name || supplier.name)},</p>
    <p style="font-size:14px;line-height:22px;margin:10px 0 0;color:${MUTED};">
      Đơn <strong style="color:${INK};">${escapeHtml(shortCode(buyer.id))}</strong> · giai đoạn <strong style="color:${INK};">${escapeHtml(stageDef.label)}</strong>
    </p>
    ${paragraphs(copy.body.map((p) => fill(p, buyer, supplier)))}
    ${summary}
    ${taskBox}
    ${opts.note ? `<p style="font-size:14px;line-height:22px;margin:18px 0 0;padding:12px 14px;background:${SOFT};border-radius:8px;color:#334155;"><strong>Ghi chú từ phòng sale:</strong><br/>${escapeHtml(opts.note)}</p>` : ""}
    ${hidden ? `<p style="font-size:12px;line-height:18px;color:${MUTED};margin:16px 0 0;">Thông tin buyer được giữ kín theo chính sách bảo mật của ${escapeHtml(COMPANY.name)}. Mọi trao đổi về giá và hợp đồng vui lòng làm việc trực tiếp với phòng sale.</p>` : ""}
    <p style="font-size:14px;line-height:22px;margin:20px 0 0;">Trân trọng,</p>
    ${signature(buyer.owner, "Phòng Xuất khẩu")}`;

  const subject = `[${shortCode(buyer.id)}] ${fill(copy.subject, buyer, supplier)}`;

  return {
    subject,
    html: wrapEmailShell({ title: subject, body, preheader: fill(copy.body[0] ?? "", buyer, supplier) }),
    text: [
      subject,
      "",
      `Kính gửi Anh/Chị ${supplier.contact_name || supplier.name},`,
      `Đơn ${shortCode(buyer.id)} - giai đoạn: ${stageDef.label}`,
      "",
      ...copy.body.map((p) => fill(p, buyer, supplier)),
      "",
      `Buyer: ${buyerLabel}`,
      `Mặt hàng: ${buyer.product ?? "-"}`,
      `Quy cách: ${buyer.spec ?? "-"}`,
      `Số lượng: ${buyer.quantity ?? "-"}`,
      "",
      "VIỆC CẦN LÀM:",
      ...copy.tasks.map((t, i) => `${i + 1}. ${fill(t, buyer, supplier)}`),
      `Hạn: ${fill(copy.deadline, buyer, supplier)}`,
      "",
      opts.note ? `Ghi chú từ phòng sale: ${opts.note}` : "",
      "",
      "Trân trọng,",
      `${buyer.owner || "Phòng Xuất khẩu"} - ${COMPANY.name}`,
      `${COMPANY.phone} | ${COMPANY.email}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Lấy lại phần nội dung bên trong khung email (dùng khi mở bản nháp / trả lời) */
export function unwrapEmailShell(html: string): string {
  const m = html.match(/<div class="vxt-inner">([\s\S]*)<\/div><\/td>/);
  return m ? m[1] : html;
}

/* ------------------------------------------------------------------ */
/* EMAIL GỬI SUPPLIER KHI BUYER VỪA ĐƯỢC GÁN VÀO NCC                  */
/* Gửi MỘT LẦN lúc gán, thông báo "có buyer đã kết nối với bạn"       */
/* ------------------------------------------------------------------ */
export function buildSupplierAssignedEmail(opts: {
  buyer: Buyer;
  supplier: Supplier;
}): EmailPayload {
  const { buyer, supplier } = opts;
  const hidden = buyer.hide_buyer_from_supplier !== false;
  const buyerLabel = hidden
    ? `Khách hàng thị trường ${buyer.country || "nước ngoài"} (ẩn danh)`
    : `${buyer.company}${buyer.country ? ` – ${buyer.country}` : ""}`;

  const summary = summaryTable(
    [
      { label: "Buyer", value: buyerLabel },
      { label: "Mặt hàng", value: buyer.product ?? "—" },
      { label: "Quy cách", value: buyer.spec ?? "—" },
      { label: "Số lượng", value: buyer.quantity ?? "—" },
      { label: "Điều kiện giao", value: buyer.incoterm ?? "—" },
      { label: "Cảng đến", value: buyer.port ?? "—" },
      { label: "Ngày giao dự kiến", value: fmtDate(buyer.expected_ship_date, "vi-VN") || "Chờ xác nhận" },
      { label: "Mã đơn nội bộ", value: shortCode(buyer.id) },
    ],
    "THÔNG TIN BUYER VỪA KẾT NỐI",
    "38%",
  );

  const tasks = [
    "Xem thông tin đơn và xác nhận xưởng có nhận được đơn này hay không",
    "Chuẩn bị báo giá tốt nhất cho mặt hàng và số lượng nêu trên",
    "Cho biết thời gian giao hàng tính từ ngày nhận cọc",
  ];

  const taskBox = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:4px solid #d97706;border-radius:8px;margin-top:18px;">
    <tr><td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;font-weight:800;color:#d97706;letter-spacing:.6px;">VIỆC CẦN LÀM</td>
        <td align="right" style="font-size:11px;font-weight:800;color:#b45309;">HẠN: Phản hồi trong 2 ngày làm việc</td>
      </tr></table>
      <ol style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:20px;color:#78350f;">${tasks
        .map((t) => `<li style="margin:0 0 7px;padding-left:2px;">${escapeHtml(t)}</li>`)
        .join("")}</ol>
    </td></tr>
  </table>`;

  const body = `
    <p style="font-size:15px;line-height:24px;margin:0;">Kính gửi Anh/Chị ${escapeHtml(supplier.contact_name || supplier.name)},</p>
    <p style="font-size:15px;line-height:24px;margin:12px 0 0;">
      Phòng sale ${escapeHtml(COMPANY.name)} vừa <strong>kết nối một buyer mới</strong> với xưởng của Anh/Chị.
      Từ thời điểm này, mọi cập nhật tiến độ của đơn sẽ được hệ thống tự động gửi tới Anh/Chị.
    </p>
    ${summary}
    ${taskBox}
    ${hidden ? `<p style="font-size:12px;line-height:18px;color:${MUTED};margin:16px 0 0;">Thông tin buyer được giữ kín theo chính sách bảo mật. Mọi trao đổi về giá và hợp đồng vui lòng làm việc trực tiếp với phòng sale.</p>` : ""}
    <p style="font-size:14px;line-height:22px;margin:20px 0 0;">Trân trọng,</p>
    ${signature(buyer.owner, "Phòng Xuất khẩu")}`;

  const subject = `[${shortCode(buyer.id)}] Buyer mới được kết nối – ${fill("{product}, {quantity}", buyer)}`;

  return {
    subject,
    html: wrapEmailShell({ title: subject, body, preheader: `Buyer mới: ${buyerLabel}` }),
    text: [
      subject,
      "",
      `Kính gửi Anh/Chị ${supplier.contact_name || supplier.name},`,
      `Phòng sale ${COMPANY.name} vừa kết nối một buyer mới với xưởng.`,
      "",
      `Buyer: ${buyerLabel}`,
      `Mặt hàng: ${buyer.product ?? "-"}`,
      `Quy cách: ${buyer.spec ?? "-"}`,
      `Số lượng: ${buyer.quantity ?? "-"}`,
      "",
      "Việc cần làm:",
      ...tasks.map((t, i) => `${i + 1}. ${t}`),
      "Hạn: Phản hồi trong 2 ngày làm việc",
      "",
      "Trân trọng,",
      `${buyer.owner || "Phòng Xuất khẩu"} - ${COMPANY.name}`,
      `${COMPANY.phone} | ${COMPANY.email}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
