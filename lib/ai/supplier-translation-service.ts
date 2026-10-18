import "server-only";

import {
  supplierProfilePatch,
  supplierProfileSource,
  supplierProfileTranslationState,
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
 * MOQ dạng chữ và thị trường xuất khẩu được dịch; phần giới thiệu được AI soạn từ
 * dữ kiện hồ sơ chỉ khi NCC để trống ô tiếng Anh (không bao giờ ghi đè bản NCC tự viết).
 * Lỗi dịch không chặn nghiệp vụ nộp hoặc công khai hồ sơ.
 */
export async function ensureSupplierProfileEnglish(
  store: Store,
  supplierId: string,
  actor?: Actor,
): Promise<EnsureSupplierTranslationResult> {
  const supplier = await store.getSupplier(supplierId);
  if (!supplier) throw new Error("Không tìm thấy nhà cung cấp.");
  const source = supplierProfileSource(supplier);
  const state = supplierProfileTranslationState(supplier);
  const needsSummary = !supplier.summary_i18n?.en?.trim() && Boolean(supplier.products?.trim());
  const needsTranslation = (Boolean(source.moq_text) || Boolean(source.export_markets.length)) && !state.current;
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
      draftSummary: needsSummary,
    });
    const patch = supplierProfilePatch(translation, supplier, "ai", model, needsSummary && Boolean(translation.summary_en));
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
