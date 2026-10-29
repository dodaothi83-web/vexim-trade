"use client";

import { createProductFormDraftAction, saveProductFormDraftAction } from "@/app/supplier/portal/product-form-draft-actions";
import { submitProductFormDraftAction } from "@/app/supplier/portal/product-form-submit-action";
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
    submit: submitProductFormDraftAction,
    async upload(id, image) {
      const body = new FormData();
      body.set("kind", "image");
      body.set("file", image);
      const response = await fetch(`/api/supplier-portal/products/${encodeURIComponent(id)}/media`, { method: "POST", body });
      const data: unknown = await response.json().catch(() => null);
      if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả tải ảnh. Hãy tải lại trang." };
      const result = data as Record<string, unknown>;
      if (!response.ok || result.ok !== true) return { ok: false, requiresReload: response.status >= 500,
        message: response.status >= 500 ? "Không xác nhận được kết quả tải ảnh. Hãy tải lại trang." :
          typeof result.message === "string" ? result.message : "Không tải được ảnh." };
      const asset = result.image;
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) return { ok: false, requiresReload: true, message: "Không xác nhận được ảnh vừa tải. Hãy tải lại trang." };
      const row = asset as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.url !== "string" || !row.url.startsWith("/api/media/file/"))
        return { ok: false, requiresReload: true, message: "Không xác nhận được ảnh vừa tải. Hãy tải lại trang." };
      return { ok: true, image: { id: row.id, url: row.url } };
    },
  };
}
