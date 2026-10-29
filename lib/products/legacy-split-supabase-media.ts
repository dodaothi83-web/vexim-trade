import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SplitMediaIO } from "@/lib/products/legacy-split-media-copy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Storage adapter for a reviewed split plan. The caller must use an explicitly
 * authorized service-role client, the actual private media bucket and an unused
 * product ID. Never use the application's upserting or local-fallback helpers.
 * This is intentionally not connected to a route, job, migration or CLI yet.
 */
export function createSplitSupabaseMediaIO(db: SupabaseClient, bucket: string, newProductId: string): SplitMediaIO {
  if (!UUID.test(newProductId) || !bucket.trim()) throw new Error("Bucket hoặc mã sản phẩm mới không hợp lệ.");
  const storage = db.storage.from(bucket);
  const safePath = (path: string) => /^products\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(path) &&
    UUID.test(path.split("/")[1]);
  const targetPath = (path: string) => safePath(path) && path.startsWith(`products/${newProductId}/`);
  return {
    async read(path) {
      if (!safePath(path)) throw new Error("Đường dẫn ảnh không an toàn.");
      const { data, error } = await storage.download(path);
      if (error) {
        // Do not conflate a permissions/network error with a missing file.
        const status = (error as { status?: number; statusCode?: string | number }).status ??
          (error as { statusCode?: string | number }).statusCode;
        if (String(status) === "404") return null;
        throw new Error(`Không đọc được tệp trong bucket: ${error.message}`);
      }
      if (!data) throw new Error("Storage không trả dữ liệu hoặc xác nhận tệp không tồn tại.");
      return new Uint8Array(await data.arrayBuffer());
    },
    async putIfAbsent(path, bytes, mime) {
      if (!targetPath(path)) throw new Error("Đường dẫn ảnh mới không an toàn.");
      const { error } = await storage.upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw new Error(`Không sao chép được tệp trong bucket: ${error.message}`);
    },
    async isUnreferenced(path) {
      if (!targetPath(path)) throw new Error("Đường dẫn ảnh mới không an toàn.");
      // A previously committed or unrelated product cannot become an accidental
      // retry target. The eventual commit transaction rechecks all references.
      const { data: product, error: productError } = await db.from("supplier_products").select("id").eq("id", newProductId).maybeSingle();
      if (productError) throw new Error(`Không kiểm tra được sản phẩm mới: ${productError.message}`);
      if (product) return false;
      const { data, error } = await db.from("media_assets").select("id")
        .or(`storage_path.eq.${path},thumb_path.eq.${path}`).limit(1);
      if (error) throw new Error(`Không kiểm tra được liên kết ảnh: ${error.message}`);
      if (!Array.isArray(data)) throw new Error("Không xác nhận được liên kết ảnh.");
      return data.length === 0;
    },
  };
}
