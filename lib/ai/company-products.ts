import "server-only";

import { readOutputText, readSources } from "@/lib/ai/company-introduction";
import type { SiteSignals } from "@/lib/ai/site-signals";
import type { ProspectCompanySource } from "@/lib/types";

/**
 * Đọc website + ẢNH SẢN PHẨM của buyer để trả lời ba câu: họ đang bán món gì, bán ở dạng
 * nào (thành phẩm có nhãn hay nông sản tươi/chưa chín), và nhóm hàng nào bên mình nên hỏi.
 *
 * Vì sao phải nhìn ảnh: danh mục dạng chữ không phân biệt được "nhà phân phối mì ăn liền"
 * với "vựa trái cây thu mua theo mùa" — mà hai loại này cần hai câu mở đầu khác nhau.
 * Kết quả là dữ liệu thô để máy chủ điền vào mẫu thư cố định (lib/ai/first-touch-draft.ts);
 * model KHÔNG viết câu thư nào.
 */

export type OfferForm = "finished" | "raw" | "mixed" | "unknown";

export type CompanyProducts = {
  products: string[];
  group: string | null;
  form: OfferForm;
  /** Câu giải thích ngắn (tiếng Việt, để nhân viên đối chiếu trong hồ sơ) */
  evidence: string | null;
  note: string | null;
  imagesSeen: number;
  sources: ProspectCompanySource[];
};

const SYSTEM_PROMPT = `Bạn là trợ lý nghiên cứu cho Vexim Trade — công ty tìm kiếm và sàng lọc nhà cung cấp tại Việt Nam cho khách quốc tế.

Đầu vào là nội dung vừa đọc từ CHÍNH WEBSITE của công ty buyer: tiêu đề trang, mô tả, mục điều hướng, tên sản phẩm khai báo bằng schema.org, alt ảnh — kèm vài ẢNH sản phẩm lấy từ website đó (nếu tải được).

Nhiệm vụ: trả lời đúng ba chuyện, không gì khác.
1) "products": tên các sản phẩm công ty ĐANG cung cấp, tối đa 6, lấy theo bằng chứng có trong đầu vào. Viết tên bằng tiếng Anh (website tiếng Việt thì dịch, giữ nguyên mã như W320, ST25, 5% broken). Không bịa sản phẩm chỉ vì nó hợp lý với ngành.
2) "form": hàng của họ ở dạng nào.
   - "finished": thành phẩm bán lẻ, có bao bì/nhãn thương hiệu, mua là bán được ngay (gói mì ăn liền, snack đóng gói, hộp quà, đồ gỗ hoàn thiện, hàng may sẵn).
   - "raw": nông sản/sản phẩm thô chưa qua chế biến hoặc chưa chín — quả tươi còn xanh, củ chưa phân loại, hạt thô, bao tải/jumbo, hàng cân theo tấn, ảnh chụp tại vườn/kho.
   - "mixed": cả hai.
   - "unknown": không đủ bằng chứng (không có ảnh, mô tả chung chung). Chọn "unknown" khi nghi ngờ, đừng đoán.
3) "group": 2-4 từ tiếng Anh gọi nhóm hàng chung của họ (vd "instant noodles", "fresh green mangoes", "roasted cashew").
4) "evidence": MỘT câu tiếng Việt ngắn nói bạn thấy gì mà kết luận như vậy, ví dụ "ảnh là gói mì ăn liền 80g có nhãn thương hiệu, mua theo thùng" hoặc "ảnh chụp xoài xanh đóng thùng carton tại vườn, chưa qua chế biến".

Quy tắc cứng:
- Chỉ dùng bằng chứng trong đầu vào. Không suy đoán từ tên công ty, tên người, quốc gia, hay từ nhóm hàng bên mình đang muốn bán cho họ.
- Không giá, không số liệu kinh doanh, không link, không nhận xét tốt/xấu về công ty họ.
- Không có sản phẩm nào đủ bằng chứng thì products = [], group = null.
- Chỉ trả về một khối JSON duy nhất, không markdown, không giải thích thêm:
{"products": ["..."], "group": "...", "form": "finished|raw|mixed|unknown", "evidence": "...", "note": "..."}`;

const FORMS: OfferForm[] = ["finished", "raw", "mixed", "unknown"];

function stripFences(text: string): string {
  let out = text.replace(/```(?:json)?/gi, "").trim();
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  if (start >= 0 && end > start) out = out.slice(start, end + 1);
  return out;
}

function normalizeName(value: unknown, max = 80): string {
  const raw = typeof value === "string" ? value : "";
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/\*\*?|`/g, "")
    .replace(/\[[^\]]{1,120}\]\((?:https?:)?\/\/[^)\s]+\)/gi, "")
    .replace(/(?:https?:\/\/|www\.)\S{3,}/gi, "")
    .replace(/[.,;:]+$/, "")
    .trim()
    .slice(0, max);
}

export function parseCompanyProducts(text: string): Pick<CompanyProducts, "products" | "group" | "form" | "evidence" | "note"> {
  const fallback = {
    products: [] as string[],
    group: null as string | null,
    form: "unknown" as OfferForm,
    evidence: null as string | null,
    note: /no (?:product|catalogue)|không (?:thấy|có) sản phẩm/i.test(text)
      ? "Không thấy danh mục sản phẩm trên các nguồn đã đọc."
      : null,
  };
  try {
    const payload = JSON.parse(stripFences(text)) as Record<string, unknown>;
    const raw = Array.isArray(payload.products) ? payload.products : typeof payload.products === "string" ? payload.products.split(/[,;\n]/) : [];
    const products = [...new Set(raw.map((item) => normalizeName(item)).filter((item) => item.length > 1))].slice(0, 6);
    const form = FORMS.includes(payload.form as OfferForm) ? (payload.form as OfferForm) : products.length ? "unknown" : "unknown";
    return {
      products,
      group: typeof payload.group === "string" ? normalizeName(payload.group, 60) || null : null,
      form: products.length ? form : "unknown",
      evidence: typeof payload.evidence === "string" ? normalizeName(payload.evidence, 220) || null : null,
      note: typeof payload.note === "string" ? normalizeName(payload.note, 220) || fallback.note : fallback.note,
    };
  } catch {
    const bullets = text
      .split("\n")
      .map((line) => normalizeName(line))
      .filter((line) => line.length > 2 && line.split(" ").length <= 8)
      .slice(0, 6);
    return { ...fallback, products: bullets };
  }
}

/** Phần chữ của website — vừa đủ để model đọc, không nhét cả trang HTML */
function textBlock(signals: SiteSignals, hasImages: boolean): string {
  const lines = [
    `URL đã đọc: ${signals.url}`,
    `Tiêu đề trang: ${signals.title ?? "(không có)"}`,
    `Mô tả: ${signals.description ?? "(không có)"}`,
    `Mục trên website: ${signals.headings.length ? signals.headings.slice(0, 10).join(" | ") : "(không có)"}`,
    `Điều hướng: ${signals.navLabels.length ? signals.navLabels.slice(0, 12).join(" | ") : "(không có)"}`,
    `Sản phẩm khai báo bằng schema.org: ${signals.productNames.length ? signals.productNames.join(" | ") : "(không có)"}`,
    `Alt của ảnh trên trang: ${signals.imageAlts.filter(Boolean).length ? signals.imageAlts.filter(Boolean).slice(0, 12).join(" | ") : "(không có)"}`,
    hasImages
      ? `Đính kèm ${signals.images.length} ảnh sản phẩm lấy từ website — hãy NHÌN ảnh để quyết định "form".`
      : "(Không tải được ảnh nào — chỉ có chữ; nếu không đủ bằng chứng thì form = unknown.)",
  ];
  return lines.join("\n");
}

/** Một lần gọi model (kèm ảnh) cho toàn bộ phần phân tích buyer. */
export async function extractCompanyProducts(input: {
  company: string;
  country: string | null;
  signals: SiteSignals;
  /** Gợi ý để định hướng (KHÔNG phải bằng chứng): ngành đã ghi, đoạn đích của danh sách tiếp thị */
  context?: string | null;
}): Promise<CompanyProducts> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Chưa cấu hình OPENAI_API_KEY trong môi trường máy chủ.");
  const company = input.company.trim().slice(0, 200);
  if (!company) throw new Error("Hồ sơ chưa có tên công ty để tra cứu.");

  const model =
    process.env.OPENAI_EMAIL_DRAFT_MODEL?.trim() ||
    process.env.OPENAI_COMPANY_RESEARCH_MODEL?.trim() ||
    "gpt-4.1-mini";

  const content: Record<string, unknown>[] = [
    {
      type: "input_text",
      text:
        `Công ty cần nghiên cứu: ${JSON.stringify({ company, country: input.country, context: input.context ?? null })}\n\n` +
        textBlock(input.signals, input.signals.images.length > 0),
    },
    ...input.signals.images.map((image) => ({
      type: "input_image",
      image_url: `data:${image.mediaType};base64,${image.base64}`,
      detail: "low",
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
        { role: "user", content },
      ],
      max_output_tokens: 500,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    console.error("[company-products] OpenAI request failed", response.status, payload.error);
    if (response.status === 401) throw new Error("OPENAI_API_KEY không hợp lệ hoặc chưa được cấp quyền.");
    if (response.status === 429) throw new Error("OpenAI đang giới hạn yêu cầu hoặc đã hết hạn mức API.");
    if (response.status === 400) throw new Error("Model chưa nhận ảnh/JSON — kiểm tra OPENAI_EMAIL_DRAFT_MODEL.");
    throw new Error("Không nhận được phản hồi hợp lệ từ OpenAI.");
  }

  const text = readOutputText(payload);
  const parsed = text ? parseCompanyProducts(text) : { products: [], group: null, form: "unknown" as OfferForm, evidence: null, note: "Model không trả về nội dung nào." };
  return {
    ...parsed,
    imagesSeen: input.signals.images.length,
    sources: readSources(payload).concat(
      input.signals.url && !readSources(payload).some((source) => source.url === input.signals.url)
        ? [{ url: input.signals.url, title: input.signals.title ?? new URL(input.signals.url).hostname }]
        : [],
    ).slice(0, 8),
  };
}
