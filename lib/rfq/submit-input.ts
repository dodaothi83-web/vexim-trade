import { z } from "zod";

import { RFQ_FIELD_LIMITS as L, RFQ_TEXT_MAX } from "./input-limits";
import type { SubmitRfqInput } from "./submit";

/**
 * Kiểm tra kiểu + độ dài dữ liệu RFQ ngay đầu Server Action.
 *
 * Server Action là một endpoint công khai: TypeScript không bảo vệ gì lúc chạy. Trước đây thiếu
 * `company` làm `raw.company.trim()` ném lỗi 500, và các ô như công ty/điện thoại/website không có
 * trần độ dài (thân request được tới 4 MB) nên có thể ghi chuỗi cực dài vào CSDL.
 *
 * - Ô người mua gõ: quá trần → từ chối (form đã đặt maxLength cùng giá trị, người thật không chạm).
 *   product_text/message có trần riêng 4.000 ký tự kèm thông báo thân thiện ở submit.ts, nên ở đây
 *   chỉ chặn mức bất thường.
 * - Siêu dữ liệu trình duyệt tự gửi (referrer, utm, honeypot…): cắt bớt thay vì từ chối, để một URL
 *   giới thiệu dài không làm hỏng yêu cầu thật.
 * - Khoá lạ bị bỏ đi.
 */
const text = (max: number) => z.string().max(max).nullish();
const meta = (max: number) => z.string().transform((value) => value.slice(0, max)).nullish();
const flag = z.boolean().optional();
// Form gửi Number(chuỗi): NaN/Infinity coi như bỏ trống (đúng hành vi cũ), không chặn yêu cầu.
const amount = z.preprocess(
  (value) => (typeof value === "number" && !Number.isFinite(value) ? null : value),
  z.number().nonnegative().max(1e12).nullish(),
);

const schema = z.object({
  product_text: z.string().max(RFQ_TEXT_MAX * 5),
  source_product_id: text(64),
  category_slug: text(120),
  grade: text(L.grade),
  quantity: amount,
  unit: text(20),
  frequency: text(40),
  incoterm: text(20),
  destination_country: text(L.destination_country),
  destination_port: text(L.destination_port),
  needed_by: text(20),
  shipment_month: text(20),
  target_price: amount,
  target_price_currency: text(8),
  target_price_unit: text(20),
  share_target_price: flag,
  // Mã phương thức vận chuyển (lib/rfq/shipping.ts); mã lạ bị bỏ ở submit.ts, không chặn yêu cầu.
  shipping_method: text(20),
  wants_samples: flag,
  wants_inspection: flag,
  wants_video_call: flag,
  preferred_supplier_ids: z.array(z.string().max(64)).max(50).optional(),
  packaging: text(L.packaging),
  // Chứng nhận = các chip đã chọn + ô "khác", nối bằng dấu phẩy.
  certifications: text(L.certifications + 500),
  message: z.string().max(RFQ_TEXT_MAX * 5).nullish(),

  company: z.string().max(L.company),
  contact_name: z.string().max(L.contact_name),
  email: z.string().max(L.email),
  phone: text(L.phone),
  country: text(L.country),
  website: text(L.website),
  business_type: text(L.business_type),
  consent: z.boolean(),
  marketing_opt_in: flag,

  inquiry_kind: z.enum(["quote", "supplier_question"]).optional(),
  share_contact_consent: flag,
  source_page: meta(200),
  referrer: meta(1_000),
  utm_source: meta(200),
  utm_medium: meta(200),
  utm_campaign: meta(200),

  honeypot: meta(500),
  challenge_token: text(600),
});

export type ParsedSubmitRfqInput = { ok: true; data: SubmitRfqInput } | { ok: false; field: string };

export function parseSubmitRfqInput(raw: unknown): ParsedSubmitRfqInput {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data as SubmitRfqInput };
  return { ok: false, field: String(parsed.error.issues[0]?.path?.[0] ?? "input") };
}
