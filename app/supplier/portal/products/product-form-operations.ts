"use client";

import { createProductFormDraftAction, saveProductFormDraftAction } from "@/app/supplier/portal/product-form-draft-actions";
import { setProductFormImagesAction } from "@/app/supplier/portal/product-form-image-actions";
import { uploadProductFormImageAction } from "@/app/supplier/portal/product-form-upload-action";
import { snapshotProductFormImagesAction } from "@/app/supplier/portal/product-form-snapshot-action";
import { productFormSubmitAvailabilityAction, submitProductFormDraftAction } from "@/app/supplier/portal/product-form-submit-action";
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
    // Check the project boundary before the session persists or snapshots any
    // images. The submit action repeats the check after all asynchronous work.
    prepareSubmit: productFormSubmitAvailabilityAction,
    submit: submitProductFormDraftAction,
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
