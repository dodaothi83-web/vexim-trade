/**
 * Làm giàu RFQ bằng AI **sau khi** yêu cầu đã được lưu — tác vụ nền, không bắt buộc.
 *
 * RÀNG BUỘC BẮT BUỘC (lý do tồn tại của file này):
 *   - Chạy bằng `after()` của Next, tức là SAU khi response đã gửi đi. Người mua không chờ AI.
 *   - Nếu `after()` không khả dụng (môi trường test, ngoài request scope) thì bỏ qua hoàn toàn —
 *     thà mất một lần trích xuất còn hơn ảnh hưởng luồng chính.
 *   - `scheduleRfqEnrichment()` và `enrichRfqAfterSubmit()` **không bao giờ throw**.
 *   - Chỉ điền vào ô đang trống; không ghi đè bất cứ thứ gì người mua đã nhập hoặc nhân viên đã sửa.
 *   - Mọi thay đổi được ghi dấu trong `specs.ai_extract` để nhân viên biết và có thể hoàn tác.
 */
import { after } from "next/server";

import type { Rfq } from "@/lib/types";
import { aiExtractionEnabled, extractRfqFields } from "./ai-extract";

/** Phần tầng dữ liệu mà tác vụ nền cần; tách ra để kiểm tra độc lập. */
export interface EnrichmentStore {
  getRfq(id: string): Promise<Rfq | null>;
  updateRfq(id: string, patch: Partial<Rfq>): Promise<Rfq>;
}

export interface EnrichmentJob {
  rfqId: string;
  productText: string;
  message?: string | null;
  categorySlug?: string | null;
  allowedCategories?: string[];
  store: EnrichmentStore;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (typeof value === "string" && !value.trim());
}

/**
 * Chạy tác vụ nền. Không await, không throw, không ảnh hưởng response.
 * `after()` ném lỗi khi gọi ngoài request scope → nuốt lỗi và bỏ qua lần trích xuất này.
 */
export function scheduleRfqEnrichment(job: EnrichmentJob): void {
  try {
    if (!aiExtractionEnabled()) return;
    after(async () => {
      await enrichRfqAfterSubmit(job);
    });
  } catch {
    // Không có request scope hoặc Next không hỗ trợ: bỏ qua, RFQ vẫn đã lưu bình thường.
  }
}

/**
 * Áp kết quả trích xuất vào RFQ. Luôn resolve; trả `{ applied: false, reason }` khi bỏ qua.
 * Hàm này chạy sau khi đã trả response nên mọi lỗi chỉ được ghi log.
 */
export async function enrichRfqAfterSubmit(
  job: EnrichmentJob,
  deps: { extract?: typeof extractRfqFields } = {},
): Promise<{ applied: boolean; reason?: string; filled?: string[] }> {
  try {
    const extract = deps.extract ?? extractRfqFields;
    const rfq = await job.store.getRfq(job.rfqId);
    if (!rfq) return { applied: false, reason: "rfq_not_found" };
    // Câu hỏi trực tiếp cho nhà cung cấp không có trường báo giá để điền.
    if (rfq.specs?.inquiry_kind === "supplier_question" || rfq.source_page === "/rfq?intent=question") {
      return { applied: false, reason: "supplier_question" };
    }
    // Nhân viên đã sửa tay rồi thì không động vào nữa.
    if ((rfq.specs as Record<string, unknown> | undefined)?.ai_extract) return { applied: false, reason: "already_extracted" };

    const result = await extract({
      productText: job.productText,
      message: job.message ?? null,
      categorySlug: job.categorySlug ?? null,
      allowedCategories: job.allowedCategories ?? [],
    });

    const specs = (rfq.specs as Record<string, unknown>) ?? {};
    const now = new Date().toISOString();
    if (!result.ok) {
      await job.store.updateRfq(job.rfqId, {
        specs: { ...specs, ai_extract: { ok: false, reason: result.reason, at: now } },
      }).catch(() => null);
      return { applied: false, reason: result.reason };
    }

    // Chỉ điền ô trống. Đây là lớp bảo vệ quan trọng nhất: AI không được ghi đè dữ liệu người thật.
    const patch: Record<string, unknown> = {};
    const filled: string[] = [];
    for (const key of ["grade", "quantity", "unit", "destination_country", "needed_by", "incoterm", "target_price", "target_price_currency"] as const) {
      const value = result.fields[key];
      if (value === undefined || value === null) continue;
      if (!isBlank((rfq as unknown as Record<string, unknown>)[key])) continue;
      patch[key] = value;
      filled.push(key);
    }
    if (result.fields.wants_samples === true && rfq.wants_samples !== true) {
      patch.wants_samples = true;
      filled.push("wants_samples");
    }
    if (result.fields.wants_inspection === true && rfq.wants_inspection !== true) {
      patch.wants_inspection = true;
      filled.push("wants_inspection");
    }

    const grade = result.fields.grade;
    const nextSpecs: Record<string, unknown> = { ...specs };
    if (grade && isBlank(specs.grade)) nextSpecs.grade = grade;
    if (result.fields.category_slug && isBlank(rfq.category_id)) {
      // category_id cần UUID thật nên chỉ ghi gợi ý để nhân viên xác nhận.
      nextSpecs.ai_category_slug = result.fields.category_slug;
    }
    nextSpecs.ai_extract = {
      ok: true,
      model: result.model,
      at: now,
      filled,
      // Tóm tắt để nhân viên đọc nhanh; không gửi cho người mua hay nhà cung cấp.
      summary: result.fields.summary ?? null,
    };
    patch.specs = nextSpecs;

    await job.store.updateRfq(job.rfqId, patch as Partial<Rfq>);
    return { applied: filled.length > 0, filled };
  } catch (err) {
    console.warn("[rfq] AI enrichment bỏ qua (RFQ đã lưu an toàn):", err instanceof Error ? err.message : err);
    return { applied: false, reason: "error" };
  }
}
