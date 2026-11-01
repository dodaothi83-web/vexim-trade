import "server-only";
import { getSupabaseClient } from "@/lib/db/supabase";

export type PriceContextDiff = { revisionId: string; revisionStatus: string; changed: string[]; missingContext: boolean };

/** Tên trường đọc được cho người duyệt, không phải tên cột trong cơ sở dữ liệu. */
const FIELD_LABELS: Record<string, string> = {
  name: "tên sản phẩm", spec: "quy cách", description: "mô tả", description_detail: "mô tả chi tiết",
  unit: "đơn vị", moq: "MOQ", moq_qty: "số lượng MOQ", moq_unit: "đơn vị MOQ", currency: "tiền tệ",
  incoterm: "Incoterm", incoterm_place: "nơi giao", payment_terms: "điều kiện thanh toán",
  packaging: "đóng gói", certifications: "chứng nhận", export_port: "cảng xuất", lead_time_days: "thời gian giao",
  monthly_capacity: "công suất", raw_material_region: "vùng nguyên liệu", input_material_origin: "nguồn nguyên liệu",
  ref_price: "giá tham chiếu", ref_price_max: "giá tham chiếu tối đa", price_publicly_visible: "chia sẻ giá",
  keywords: "từ khoá", sample_price_usd: "giá mẫu", package_type: "kiểu đóng gói",
  package_weight_kg: "khối lượng gói", units_per_carton: "số đơn vị mỗi thùng",
  review_category: "danh mục duyệt", slug: "đường dẫn",
};

/** Gộp các thay đổi thành một câu ngắn để hiện cạnh nút duyệt. */
export function describePriceContextChanges(changed: string[], limit = 3): string {
  const labels = changed.map((key) => key.startsWith("specs.")
    ? `thuộc tính ${key.slice(6)}`
    : FIELD_LABELS[key] ?? key);
  const unique = [...new Set(labels)];
  if (unique.length <= limit) return unique.join(", ");
  return `${unique.slice(0, limit).join(", ")} và ${unique.length - limit} mục khác`;
}

/**
 * Vì sao sản phẩm bị chặn đăng: so bản chụp thông tin lúc chốt giá với sản phẩm hiện tại.
 * Chỉ đọc, không sửa dữ liệu. Lỗi mạng trả về null để không chặn trang duyệt.
 */
export async function readPriceContextDiff(productId: string): Promise<PriceContextDiff | null> {
  const db = getSupabaseClient();
  if (!db) return null;
  const { data, error } = await db.rpc("quantity_product_price_context_diff", { p_product_id: productId });
  if (error || !data || typeof data !== "object") return null;
  const payload = data as { status?: unknown; revision_id?: unknown; revision_status?: unknown; changed?: unknown; missing_context?: unknown };
  if (payload.status !== "diff" || typeof payload.revision_id !== "string") return null;
  const changed = Array.isArray(payload.changed) ? payload.changed.filter((key): key is string => typeof key === "string") : [];
  return {
    revisionId: payload.revision_id,
    revisionStatus: typeof payload.revision_status === "string" ? payload.revision_status : "approved",
    changed,
    missingContext: payload.missing_context === true,
  };
}
