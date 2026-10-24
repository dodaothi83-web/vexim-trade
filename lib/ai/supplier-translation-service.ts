import "server-only";

import {
  supplierProfileHasSource,
  supplierProfilePatch,
  supplierProfileSource,
  supplierProfileSourceHash,
  supplierProfileTranslationState,
  supplierSummarySourceHash,
  translateSupplierProfile,
} from "@/lib/ai/translate-supplier";
import { translationConfigured } from "@/lib/ai/translate-content";
import type { DataStore } from "@/lib/db/types";
import type { Supplier } from "@/lib/types";

type Store = Pick<DataStore, "getSupplier" | "updateSupplier" | "addAuditLog">;
type Actor = { id: string; email: string } | null;

const TYPE_LABELS: Record<string, string> = {
  manufacturer: "manufacturer",
  trading: "trading company",
  cooperative: "cooperative",
};

export type EnsureSupplierTranslationResult =
  | { status: "current"; supplier: Supplier }
  | { status: "translated"; supplier: Supplier }
  | { status: "unconfigured"; supplier: Supplier }
  | { status: "failed"; supplier: Supplier; message: string };

/**
 * Bảo đảm các nội dung hồ sơ NCC hiển thị cho buyer có bản tiếng Anh:
 * MOQ, địa điểm, địa chỉ, mặt hàng, thị trường, công suất, điều khoản, cảng và Incoterms
 * được dịch cùng phần giới thiệu. NCC sửa nội dung gốc thì toàn bộ bản dịch được làm mới.
 * Chỉ khi NCC không viết phần giới thiệu, AI mới soạn nháp từ dữ kiện hồ sơ.
 * Lỗi dịch không chặn nghiệp vụ nộp hoặc công khai hồ sơ.
 */
export async function ensureSupplierProfileEnglish(
  store: Store,
  supplierId: string,
  actor?: Actor,
  opts?: { preserveSummary?: boolean },
): Promise<EnsureSupplierTranslationResult> {
  const supplier = await store.getSupplier(supplierId);
  if (!supplier) throw new Error("Không tìm thấy nhà cung cấp.");
  const source = supplierProfileSource(supplier);
  const state = supplierProfileTranslationState(supplier);
  const story = supplier.intro_source?.trim() ?? "";
  if (opts?.preserveSummary && story && !state.summaryCurrent) {
    // Nhân viên vừa chốt tay bản tiếng Anh: ghi nhận hash câu chuyện hiện tại để
    // các lần lưu sau không dịch đè mất bản đã chốt, cho đến khi câu chuyện thay đổi.
    await store.updateSupplier(supplierId, {
      profile_translation_meta: {
        source_hash: supplier.profile_translation_meta?.source_hash ?? supplierProfileSourceHash(supplier),
        translated_at: supplier.profile_translation_meta?.translated_at ?? new Date().toISOString(),
        origin: "staff",
        model: supplier.profile_translation_meta?.model ?? null,
        summary_generated: false,
        summary_source_hash: supplierSummarySourceHash(story),
        fields: supplier.profile_translation_meta?.fields,
      },
    }).catch((error) => console.error("[supplier-translation] preserve summary", error));
  }
  // Có câu chuyện tự viết thì dịch lại mỗi khi câu chuyện thay đổi; không có thì soạn nháp khi đang trống.
  const needsSummary = !opts?.preserveSummary && (story ? !state.summaryCurrent
    : !supplier.summary_i18n?.en?.trim() && Boolean(supplier.products?.trim()));
  const needsTranslation = supplierProfileHasSource(source) && !state.current;
  if (!needsTranslation && !needsSummary) return { status: "current", supplier };
  if (!translationConfigured()) return { status: "unconfigured", supplier };
  try {
    const { translation, model } = await translateSupplierProfile({
      source,
      facts: {
        supplier_type_label: TYPE_LABELS[supplier.supplier_type ?? supplier.role] ?? null,
        province: supplier.province,
        products: supplier.products,
        founded_year: supplier.founded_year ?? null,
        employees: supplier.employees ?? null,
      },
      story,
      draftSummary: !story && needsSummary,
    });
    const patch = supplierProfilePatch(translation, supplier, "ai", model, !story && needsSummary && Boolean(translation.summary_en));
    if (needsSummary && translation.summary_en) {
      patch.summary_i18n = { ...(supplier.summary_i18n ?? {}), en: translation.summary_en };
    }
    const saved = await store.updateSupplier(supplierId, patch);
    if (actor) {
      await store.addAuditLog({
        actor_id: actor.id, actor_email: actor.email, entity: "supplier", entity_id: supplierId,
        action: "supplier.profile_translation_ai",
        before: { translated_at: supplier.profile_translation_meta?.translated_at ?? null },
        after: {
          translated_at: saved.profile_translation_meta?.translated_at ?? null,
          origin: "ai", model, summary_generated: Boolean(patch.profile_translation_meta?.summary_generated),
        },
      }).catch((error) => console.error("[supplier-translation] audit", error));
    }
    return { status: "translated", supplier: saved };
  } catch (error) {
    console.error("[supplier-translation] translate failed", error);
    return { status: "failed", supplier, message: error instanceof Error ? error.message : "Không dịch được hồ sơ." };
  }
}
