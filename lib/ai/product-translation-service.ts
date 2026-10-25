import "server-only";

import {
  productTranslationPatch,
  productTranslationState,
  translateProductContent,
  translationConfigured,
  type ProductTranslationSource,
} from "@/lib/ai/translate-content";
import type { DataStore } from "@/lib/db/types";
import type { SupplierProduct } from "@/lib/types";

type Store = Pick<DataStore, "getProduct" | "updateProduct" | "addAuditLog">;
type Actor = { id: string; email: string } | null;

const sourceOf = (p: ProductTranslationSource): ProductTranslationSource => ({
  name: p.name, description: p.description, spec: p.spec,
  description_detail: p.description_detail, packaging: p.packaging, certifications: p.certifications,
  moq: p.moq, monthly_capacity: p.monthly_capacity, payment_terms: p.payment_terms,
  incoterm_place: p.incoterm_place, export_port: p.export_port,
});

export type EnsureTranslationResult =
  | { status: "current"; product: SupplierProduct }
  | { status: "translated"; product: SupplierProduct }
  | { status: "unconfigured"; product: SupplierProduct }
  | { status: "failed"; product: SupplierProduct; message: string };

/**
 * Bảo đảm sản phẩm có bản dịch tiếng Anh khớp nội dung gốc hiện tại.
 * Dịch bằng AI khi chưa có bản dịch hoặc nội dung gốc đã đổi sau lần dịch trước.
 * Không bao giờ chặn nghiệp vụ chính: lỗi dịch được trả về để nơi gọi quyết định cách thông báo.
 */
export async function ensureProductEnglishTranslation(
  store: Store,
  productId: string,
  actor?: Actor,
  /** Nội dung gốc mới nhất chưa kịp lưu (ví dụ form CRM đang lưu đồng thời bật sẵn sàng gửi buyer). */
  overrideSource?: ProductTranslationSource,
): Promise<EnsureTranslationResult> {
  const product = await store.getProduct(productId);
  if (!product) throw new Error("Không tìm thấy sản phẩm.");
  const merged = overrideSource ? { ...product, ...overrideSource } : product;
  const state = productTranslationState({ ...merged, name: merged.name ?? "" });
  if (state.current) return { status: "current", product };
  if (!translationConfigured()) return { status: "unconfigured", product };
  try {
    const { translation, model } = await translateProductContent(sourceOf(merged));
    const saved = await store.updateProduct(productId, productTranslationPatch(translation, sourceOf(merged), "ai", model));
    if (actor) {
      await store.addAuditLog({
        actor_id: actor.id, actor_email: actor.email, entity: "product", entity_id: productId,
        action: "product.translation_ai",
        before: { translated_at: product.translation_meta?.translated_at ?? null, origin: product.translation_meta?.origin ?? null },
        after: { translated_at: saved.translation_meta?.translated_at ?? null, origin: "ai", model },
      }).catch((error) => console.error("[product-translation] audit", error));
    }
    return { status: "translated", product: saved };
  } catch (error) {
    console.error("[product-translation] translate failed", error);
    return { status: "failed", product, message: error instanceof Error ? error.message : "Không dịch được nội dung." };
  }
}
