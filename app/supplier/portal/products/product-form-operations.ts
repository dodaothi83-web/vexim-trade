"use client";

import { createProductFormDraftAction, saveProductFormDraftAction } from "@/app/supplier/portal/product-form-draft-actions";
import { setProductFormImagesAction } from "@/app/supplier/portal/product-form-image-actions";
import type { ProductFormSessionOperations } from "@/lib/products/product-form-session";

/**
 * Adapter for the private supplier form. The form is not connected to a route
 * yet: an image write for an already-approved listing needs a private revision
 * flow before this adapter can safely be enabled for that case.
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
    // Never fall back to the old media endpoint: it publishes uploads on an
    // approved product immediately. Wire a private staged uploader only after
    // submission and review both use the immutable image selection.
    async upload() {
      return { ok: false, message: "Chức năng tải ảnh cho form mới chưa sẵn sàng." };
    },
  };
}
