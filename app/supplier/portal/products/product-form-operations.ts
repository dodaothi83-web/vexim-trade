"use client";

import { createProductFormDraftAction, saveProductFormDraftAction } from "@/app/supplier/portal/product-form-draft-actions";
import { setProductFormImagesAction } from "@/app/supplier/portal/product-form-image-actions";
import { uploadProductFormImageAction } from "@/app/supplier/portal/product-form-upload-action";
import type { ProductFormSessionOperations } from "@/lib/products/product-form-session";

/**
 * Adapter for the private supplier form, still disconnected from routes until
 * review, buyer cutover and synthetic staging are complete. Uploads use only the
 * private action, which checks schema readiness before writing any bytes.
 */
export function supplierProductFormOperations(): ProductFormSessionOperations {
  return {
    newRequestId: () => crypto.randomUUID(),
    create: createProductFormDraftAction,
    save: saveProductFormDraftAction,
    // The old submit RPC enumerates media_assets rather than a private image
    // selection. Keep it inaccessible from this editor until the new snapshot
    // and approval transaction are both complete.
    async submit() { return { ok: false, message: "Chức năng gửi duyệt cho form mới chưa sẵn sàng." }; },
    setImages: setProductFormImagesAction,
    // Never call the legacy media endpoint, which publishes immediately.
    async upload(id, revision, file) {
      const data = new FormData();
      data.set("product_id", id); data.set("revision", String(revision)); data.set("file", file);
      return uploadProductFormImageAction(data);
    },
  };
}
