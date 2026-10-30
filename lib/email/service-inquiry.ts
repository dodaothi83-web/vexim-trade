/**
 * Email cho form "Đăng ký dịch vụ" ở Section 4 trang chủ (4 dịch vụ của Vexim).
 *
 * Có 2 thư, dùng chung khung thương hiệu `wrapEmailShell`:
 *   - `buildServiceInquiryInternalEmail`: báo cho đội Vexim (admin / kinh doanh /
 *     thu mua) để gọi lại khách. Reply-To là địa chỉ khách đã để lại.
 *   - `buildServiceInquiryAcknowledgement`: xác nhận cho chính doanh nghiệp đã
 *     đăng ký, viết theo đúng ngôn ngữ họ dùng trên form.
 *
 * Nguyên tắc viết (để thư KHÔNG giống văn bản máy):
 *   - Tiêu đề ngắn, đọc như người gõ: nêu việc + tên doanh nghiệp + mã yêu cầu.
 *     Không dùng nhãn máy kiểu "[Đăng ký dịch vụ]", không gạch dài "—", không
 *     lặp lại tên dịch vụ marketing đầy đủ trong tiêu đề.
 *   - Thân thư nói rõ 3 việc: khách đăng ký gì, việc cần làm tiếp theo, ai liên hệ.
 *   - Mọi giá trị do khách nhập đều escape trước khi vào HTML.
 */

import { COMPANY } from "@/lib/config";
import { escapeHtml, summaryTable, wrapEmailShell } from "@/lib/email/templates";

export type ServiceInquiryLang = "en" | "vi";

export interface ServiceInquiryInput {
  /** Ngôn ngữ khách dùng trên form */
  lang: ServiceInquiryLang;
  /** Mã dịch vụ do form gửi lên (free_listing, international_website, featured_ads, fda_compliance) */
  serviceKey: string;
  /** Tiêu đề dịch vụ dự phòng khi mã không nằm trong danh mục */
  serviceTitle?: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  productsText?: string;
  note?: string;
  /** Mã yêu cầu in trong tiêu đề + thân thư, ví dụ DV-261021-4F7K */
  reference: string;
  submittedAt: Date;
}

/** Tên đầy đủ của 4 dịch vụ trên landing page (dùng cho log CRM và nội dung thư). */
export const SERVICE_TITLES: Record<string, { vi: string; en: string }> = {
  free_listing: {
    vi: "Đăng ký lên sàn miễn phí",
    en: "Free marketplace listing",
  },
  international_website: {
    vi: "Thiết kế website chuẩn thương mại quốc tế",
    en: "International trade website design",
  },
  featured_ads: {
    vi: "Quảng cáo nổi bật",
    en: "Featured placement",
  },
  fda_compliance: {
    vi: "Tuân thủ pháp lý FDA",
    en: "US FDA regulatory compliance",
  },
};

/** Tên ngắn dùng trong tiêu đề email — đọc gọn trong hộp thư. */
const SERVICE_DESK_LABELS: Record<string, { vi: string; en: string }> = {
  free_listing: { vi: "gian hàng miễn phí", en: "free marketplace listing" },
  international_website: { vi: "website thương mại quốc tế", en: "international trade website" },
  featured_ads: { vi: "quảng cáo nổi bật", en: "featured placement" },
  fda_compliance: { vi: "tư vấn FDA", en: "US FDA compliance" },
};

/** Bước tiếp theo riêng cho từng dịch vụ, để thư xác nhận không nói chung chung. */
const SERVICE_NEXT_STEP: Record<string, { vi: string; en: string }> = {
  free_listing: {
    vi: "Chúng tôi sẽ gửi danh sách giấy tờ doanh nghiệp cần chuẩn bị để mở gian hàng.",
    en: "We will send the list of business documents needed to open your storefront.",
  },
  international_website: {
    vi: "Chúng tôi sẽ hỏi trước về danh mục sản phẩm để báo giá đúng số trang bạn cần, không tính thừa.",
    en: "We will ask for your product catalogue first, so the quote covers the pages you actually need.",
  },
  featured_ads: {
    vi: "Chúng tôi sẽ liên hệ để trao đổi về vị trí banner doanh nghiệp, thời gian hiển thị và báo giá.",
    en: "We will contact you to discuss business banner placement, display period, and pricing.",
  },
  fda_compliance: {
    vi: "Chúng tôi sẽ rà xem sản phẩm của bạn cần bước nào trước: đăng ký cơ sở, U.S. Agent, nhãn hàng hoá, FSVP hay Prior Notice.",
    en: "We will check which step your products need first: facility registration, U.S. Agent, labelling, FSVP or Prior Notice.",
  },
};

function clean(value: string | null | undefined, max = 300): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Tiêu đề dự phòng: bỏ số thứ tự "2. " và cắt bớt để tiêu đề thư không dài dòng. */
function fallbackTitle(raw: string | null | undefined, lang: ServiceInquiryLang): string {
  const value = clean(raw, 90).replace(/^\s*\d+\s*[.)-]\s*/, "");
  if (value) return value;
  return lang === "vi" ? "dịch vụ của Vexim Trade" : "a Vexim Trade service";
}

/** Tên dịch vụ đầy đủ, theo mã dịch vụ; rơi về tiêu đề form khi mã lạ. */
export function serviceDisplayTitle(
  serviceKey: string,
  lang: ServiceInquiryLang,
  rawTitle?: string | null,
): string {
  const known = SERVICE_TITLES[serviceKey];
  if (known) return known[lang];
  const value = clean(rawTitle, 140).replace(/^\s*\d+\s*[.)-]\s*/, "");
  return value || (lang === "vi" ? "Dịch vụ doanh nghiệp" : "Vexim Trade business service");
}

/** Tên ngắn cho tiêu đề thư. */
export function serviceDeskLabel(
  serviceKey: string,
  lang: ServiceInquiryLang,
  rawTitle?: string | null,
): string {
  const known = SERVICE_DESK_LABELS[serviceKey];
  if (known) return known[lang];
  return fallbackTitle(rawTitle, lang).toLowerCase();
}

/** Mã yêu cầu dạng DV-YYMMDD-XXXX (giờ Việt Nam), đủ ngắn để khách đọc qua điện thoại. */
export function serviceInquiryReference(
  now: Date = new Date(),
  random: () => number = Math.random,
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${pick("year")}${pick("month")}${pick("day")}`.replace(/\D/g, "").slice(-6) || "000000";
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // bỏ I, O cho dễ đọc
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    const r = Math.min(Math.max(random(), 0), 0.999999);
    suffix += alphabet[Math.floor(r * alphabet.length)];
  }
  return `DV-${day}-${suffix}`;
}

function submittedLabel(date: Date): string {
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} (giờ Việt Nam)`;
}

function firstName(fullName: string): string {
  const tokens = clean(fullName, 120).split(" ").filter(Boolean);
  return tokens.length > 1 ? tokens[tokens.length - 1] : clean(fullName, 120);
}

function plainText(lines: Array<string | null | false | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

/* ------------------------------------------------------------------ */
/* 1) Thư nội bộ: báo đội Vexim có khách đăng ký dịch vụ               */
/* ------------------------------------------------------------------ */

export interface ServiceInquiryEmail {
  subject: string;
  html: string;
  text: string;
}

export function serviceInquiryInternalSubject(input: ServiceInquiryInput): string {
  const company = clean(input.companyName, 80) || "Doanh nghiệp";
  const label = serviceDeskLabel(input.serviceKey, "vi", input.serviceTitle);
  return `${company} đăng ký ${label} (${input.reference})`;
}

export function buildServiceInquiryInternalEmail(input: ServiceInquiryInput): ServiceInquiryEmail {
  const title = serviceDisplayTitle(input.serviceKey, "vi", input.serviceTitle);
  const company = clean(input.companyName, 160);
  const contact = clean(input.contactName, 120);
  const phone = clean(input.phone, 50);
  const email = clean(input.email, 140);
  const products = clean(input.productsText, 240);
  const note = String(input.note ?? "").trim().slice(0, 1200);
  const submitted = submittedLabel(input.submittedAt);
  const subject = serviceInquiryInternalSubject(input);

  const details = summaryTable(
    [
      { label: "Mã yêu cầu", value: input.reference },
      { label: "Dịch vụ", value: title },
      { label: "Doanh nghiệp", value: company },
      { label: "Người liên hệ", value: contact },
      { label: "Điện thoại / Zalo", value: phone },
      { label: "Email", value: email },
      { label: "Ngành hàng chính", value: products },
      { label: "Thời điểm gửi", value: submitted },
      { label: "Ngôn ngữ form", value: input.lang === "vi" ? "Tiếng Việt" : "Tiếng Anh" },
    ],
    "NỘI DUNG ĐĂNG KÝ",
    "38%",
  );

  const body = `
    <p style="font-size:15px;line-height:24px;margin:0 0 4px;">Chào đội Vexim,</p>
    <p style="font-size:15px;line-height:24px;margin:12px 0 18px;">
      <strong>${escapeHtml(company)}</strong> vừa gửi đăng ký <strong>${escapeHtml(title)}</strong>
      từ mục dịch vụ trên trang chủ veximtrade.com.
    </p>
    ${details}
    ${
      note
        ? `<div style="margin-top:18px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
             <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:6px;">Khách ghi thêm</div>
             <div style="font-size:14px;line-height:22px;color:#334155;white-space:pre-line;">${escapeHtml(note)}</div>
           </div>`
        : `<p style="font-size:13px;line-height:20px;color:#64748b;margin:14px 0 0;">Khách không ghi thêm yêu cầu cụ thể.</p>`
    }
    <p style="font-size:14px;font-weight:700;margin:22px 0 6px;">Việc cần làm</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:22px;color:#334155;">
      <li>Gọi lại cho ${escapeHtml(contact)} trong vòng <strong>1 ngày làm việc</strong>.</li>
      <li>Bấm <strong>Trả lời</strong> thư này để đi thẳng tới ${escapeHtml(email)} — không cần chép tay địa chỉ.</li>
      <li>Ghi mã <strong>${escapeHtml(input.reference)}</strong> khi trao đổi nội bộ để tra lại lịch sử.</li>
    </ul>
    <p style="font-size:12px;line-height:18px;color:#64748b;margin:22px 0 0;">
      Thư tự động từ form đăng ký dịch vụ trên trang chủ Vexim Trade.
    </p>`;

  const text = plainText([
    "Chào đội Vexim,",
    "",
    `${company} vừa đăng ký ${title} từ mục dịch vụ trên trang chủ veximtrade.com.`,
    "",
    `Mã yêu cầu: ${input.reference}`,
    `Dịch vụ: ${title}`,
    `Doanh nghiệp: ${company}`,
    `Người liên hệ: ${contact}`,
    `Điện thoại / Zalo: ${phone}`,
    `Email: ${email}`,
    products ? `Ngành hàng chính: ${products}` : null,
    `Thời điểm gửi: ${submitted}`,
    "",
    note ? `Khách ghi thêm: ${note}` : "Khách không ghi thêm yêu cầu cụ thể.",
    "",
    "Việc cần làm:",
    `- Gọi lại cho ${contact} trong vòng 1 ngày làm việc.`,
    `- Trả lời thư này để gửi thẳng tới ${email}.`,
    `- Ghi mã ${input.reference} khi trao đổi nội bộ.`,
  ]);

  return {
    subject,
    html: wrapEmailShell({
      title: subject,
      preheader: `${title} · ${contact} · ${phone}`,
      body,
    }),
    text,
  };
}

/* ------------------------------------------------------------------ */
/* 2) Thư xác nhận cho doanh nghiệp đã đăng ký                         */
/* ------------------------------------------------------------------ */

export function serviceInquiryAckSubject(input: ServiceInquiryInput): string {
  const label = serviceDeskLabel(input.serviceKey, input.lang, input.serviceTitle);
  return input.lang === "vi"
    ? `Vexim Trade đã nhận đăng ký ${label} của bạn (${input.reference})`
    : `Vexim Trade received your ${label} registration (${input.reference})`;
}

export function buildServiceInquiryAcknowledgement(input: ServiceInquiryInput): ServiceInquiryEmail {
  const isVi = input.lang === "vi";
  const title = serviceDisplayTitle(input.serviceKey, input.lang, input.serviceTitle);
  const company = clean(input.companyName, 160);
  const contact = clean(input.contactName, 120);
  const phone = clean(input.phone, 50);
  const email = clean(input.email, 140);
  const products = clean(input.productsText, 240);
  const nextStep =
    SERVICE_NEXT_STEP[input.serviceKey]?.[input.lang] ??
    (isVi
      ? "Chúng tôi sẽ xem nội dung bạn gửi và phản hồi bằng văn bản trước khi bắt đầu bất kỳ công việc nào."
      : "We will read what you sent and reply in writing before any work starts.");
  const subject = serviceInquiryAckSubject(input);

  const details = summaryTable(
    isVi
      ? [
          { label: "Mã yêu cầu", value: input.reference },
          { label: "Dịch vụ", value: title },
          { label: "Doanh nghiệp", value: company },
          { label: "Người liên hệ", value: contact },
          { label: "Điện thoại / Zalo", value: phone },
          { label: "Email", value: email },
          { label: "Ngành hàng chính", value: products },
        ]
      : [
          { label: "Reference", value: input.reference },
          { label: "Service", value: title },
          { label: "Company", value: company },
          { label: "Contact", value: contact },
          { label: "Phone / Zalo", value: phone },
          { label: "Email", value: email },
          { label: "Main products", value: products },
        ],
    isVi ? "THÔNG TIN ĐÃ GHI NHẬN" : "WHAT WE RECEIVED",
    "38%",
  );

  const body = isVi
    ? `
    <p style="font-size:15px;line-height:24px;margin:0;">Kính gửi anh/chị ${escapeHtml(firstName(contact))},</p>
    <p style="font-size:15px;line-height:24px;margin:12px 0 18px;">
      Vexim Trade đã nhận đăng ký <strong>${escapeHtml(title)}</strong> của
      <strong>${escapeHtml(company)}</strong>. Dưới đây là thông tin chúng tôi ghi nhận,
      anh/chị kiểm tra giúp nếu có chỗ cần sửa.
    </p>
    ${details}
    <p style="font-size:14px;font-weight:700;margin:22px 0 6px;">Bước tiếp theo</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:22px;color:#334155;">
      <li>Chuyên viên Vexim Trade tại Hà Nội sẽ liên hệ anh/chị trong <strong>1 ngày làm việc</strong> qua số ${escapeHtml(phone)}.</li>
      <li>${escapeHtml(nextStep)}</li>
      <li>Mọi chi phí được báo bằng văn bản trước; chúng tôi chỉ bắt đầu khi anh/chị đồng ý.</li>
    </ul>
    <p style="font-size:14px;line-height:22px;margin:18px 0 0;">
      Cần bổ sung thông tin, anh/chị chỉ cần trả lời thư này. Khi gọi điện, đọc mã
      <strong>${escapeHtml(input.reference)}</strong> để chúng tôi tra đúng hồ sơ.
    </p>
    <p style="font-size:14px;line-height:22px;margin:18px 0 0;">
      Trân trọng,<br/>
      <strong>${escapeHtml(COMPANY.name)}</strong><br/>
      <span style="color:#64748b;">${escapeHtml(COMPANY.phoneDisplay ?? COMPANY.phone)} &middot;
      <a href="${escapeHtml(COMPANY.website)}" style="color:#0f766e;text-decoration:none;">${escapeHtml(COMPANY.website.replace(/^https?:\/\//, ""))}</a></span>
    </p>`
    : `
    <p style="font-size:15px;line-height:24px;margin:0;">Dear ${escapeHtml(firstName(contact))},</p>
    <p style="font-size:15px;line-height:24px;margin:12px 0 18px;">
      Thank you for registering for <strong>${escapeHtml(title)}</strong> with Vexim Trade.
      Here is what we have on file for <strong>${escapeHtml(company)}</strong> — tell us if anything needs correcting.
    </p>
    ${details}
    <p style="font-size:14px;font-weight:700;margin:22px 0 6px;">What happens next</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:22px;color:#334155;">
      <li>A Vexim Trade consultant in Hanoi will contact you within <strong>one business day</strong> on ${escapeHtml(phone)}.</li>
      <li>${escapeHtml(nextStep)}</li>
      <li>Costs are always quoted in writing first; we start only after you agree.</li>
    </ul>
    <p style="font-size:14px;line-height:22px;margin:18px 0 0;">
      If you want to add anything, just reply to this email. Quote reference
      <strong>${escapeHtml(input.reference)}</strong> so we can find your file.
    </p>
    <p style="font-size:14px;line-height:22px;margin:18px 0 0;">
      Best regards,<br/>
      <strong>${escapeHtml(COMPANY.name)}</strong><br/>
      <span style="color:#64748b;">${escapeHtml(COMPANY.phoneDisplay ?? COMPANY.phone)} &middot;
      <a href="${escapeHtml(COMPANY.website)}" style="color:#0f766e;text-decoration:none;">${escapeHtml(COMPANY.website.replace(/^https?:\/\//, ""))}</a></span>
    </p>`;

  const text = isVi
    ? plainText([
        `Kính gửi anh/chị ${firstName(contact)},`,
        "",
        `Vexim Trade đã nhận đăng ký ${title} của ${company}.`,
        "",
        `Mã yêu cầu: ${input.reference}`,
        `Dịch vụ: ${title}`,
        `Doanh nghiệp: ${company}`,
        `Người liên hệ: ${contact}`,
        `Điện thoại / Zalo: ${phone}`,
        `Email: ${email}`,
        products ? `Ngành hàng chính: ${products}` : null,
        "",
        "Bước tiếp theo:",
        `- Chuyên viên Vexim Trade tại Hà Nội sẽ liên hệ trong 1 ngày làm việc qua số ${phone}.`,
        `- ${nextStep}`,
        "- Mọi chi phí được báo bằng văn bản trước; chúng tôi chỉ bắt đầu khi anh/chị đồng ý.",
        "",
        `Cần bổ sung thông tin, anh/chị chỉ cần trả lời thư này. Khi gọi điện, đọc mã ${input.reference} để chúng tôi tra đúng hồ sơ.`,
        "",
        "Trân trọng,",
        COMPANY.name,
        `${COMPANY.phoneDisplay ?? COMPANY.phone} · ${COMPANY.website}`,
      ])
    : plainText([
        `Dear ${firstName(contact)},`,
        "",
        `Thank you for registering for ${title} with Vexim Trade.`,
        "",
        `Reference: ${input.reference}`,
        `Service: ${title}`,
        `Company: ${company}`,
        `Contact: ${contact}`,
        `Phone / Zalo: ${phone}`,
        `Email: ${email}`,
        products ? `Main products: ${products}` : null,
        "",
        "What happens next:",
        `- A Vexim Trade consultant in Hanoi will contact you within one business day on ${phone}.`,
        `- ${nextStep}`,
        "- Costs are always quoted in writing first; we start only after you agree.",
        "",
        `If you want to add anything, just reply to this email. Quote reference ${input.reference} so we can find your file.`,
        "",
        "Best regards,",
        COMPANY.name,
        `${COMPANY.phoneDisplay ?? COMPANY.phone} · ${COMPANY.website}`,
      ]);

  return {
    subject,
    html: wrapEmailShell({
      title: subject,
      preheader: isVi
        ? `Đã nhận đăng ký ${title} · mã ${input.reference}`
        : `Registration received: ${title} · ref ${input.reference}`,
      body,
    }),
    text,
  };
}
