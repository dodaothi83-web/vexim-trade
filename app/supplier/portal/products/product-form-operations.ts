"use client";

import { createProductFormDraftAction, saveProductFormDraftAction } from "@/app/supplier/portal/product-form-draft-actions";
import { setProductFormImagesAction } from "@/app/supplier/portal/product-form-image-actions";
import { uploadProductFormImageAction } from "@/app/supplier/portal/product-form-upload-action";
import { snapshotProductFormImagesAction } from "@/app/supplier/portal/product-form-snapshot-action";
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
    // Block before the session persists or snapshots anything. Keep the second
    // guard in submit as defense in depth until atomic approval is complete.
    async prepareSubmit() { return { ok: false, message: "Chức năng gửi duyệt cho form mới chưa sẵn sàng." }; },
    async submit() { return { ok: false, message: "Chức năng gửi duyệt cho form mới chưa sẵn sàng." }; },
    snapshotImages: snapshotProductFormImagesAction,
    setImages: setProductFormImagesAction,
    // Never call the legacy media endpoint, which publishes immediately.
    async upload(id, revision, file) {
      const data = new FormData();
      data.set("product_id", id); data.set("revision", String(revision)); data.set("file", file);
      return uploadProductFormImageAction(data);
    },
  };
}
