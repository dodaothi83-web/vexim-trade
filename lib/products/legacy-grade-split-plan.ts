/*
 * Read-only planning for a legacy two-grade listing. This module does not
 * connect to a database or object storage and cannot perform a split. A plan
 * must be rechecked under transaction locks against every captured baseline.
 */
type JsonObject = Record<string, unknown>;
type Asset = {
  id: string; product_id: string | null; supplier_id: string | null; kind: string;
  storage_path: string | null; thumb_path: string | null; [key: string]: unknown;
};
type Rfq = { id: string; source_product_id: string | null; specs: unknown; updated_at: string };
type Certificate = { id: string; requested_product_ids: string[]; approved_product_ids: string[]; updated_at: string };
type Product = {
  id: string; supplier_id: string; category: string | null; updated_at: string; specs: unknown;
  featured_media_id?: string | null; images?: string[] | null; [key: string]: unknown;
};
type MediaMapping = { sourceId: string; newId: string };
export type LegacySplitInput = {
  product: Product; newProductId: string; resolvedCategorySlug: string; assets: Asset[]; imageMappings: MediaMapping[];
  rfqs: Rfq[]; certificates: Certificate[];
};
export type LegacySplitPlan = {
  sourceId: string; sourceUpdatedAt: string; supplierId: string; category: string;
  originalUrl: string; newProductId: string; newUrl: string;
  // Private snapshots support compare-and-swap checks. They are not a backup.
  sourceSnapshot: Product; assetSnapshots: Asset[]; certificateSnapshots: Certificate[];
  // Original rows, including ranges and MOQ, must be kept exactly as stored.
  gradeRows: [JsonObject, JsonObject];
  sourceGrade: string; newGrade: string;
  assetCopies: Array<{ sourceId: string; newId: string; sourcePath: string; newPath: string; sourceThumbPath: string | null; newThumbPath: string | null }>;
  featuredImageMapping: MediaMapping | null;
  rfqs: Array<{ id: string; updatedAt: string; decision: "keep" | "move_candidate" | "review" }>;
  certificates: Array<{ id: string; updatedAt: string; requested: boolean; approved: boolean }>;
  warnings: string[];
};
type Result = { ok: false; errors: string[] } | { ok: true; plan: LegacySplitPlan };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (value: unknown): JsonObject | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const norm = (value: unknown): string => str(value).normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
// Do not compare prices through floating point: preserve the exact stored range.
function decimal(value: unknown): { digits: bigint; scale: number } | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match || match[1].length + (match[2]?.length ?? 0) > 40) return null;
  const digits = BigInt(match[1] + (match[2] ?? ""));
  return digits > 0n ? { digits, scale: match[2]?.length ?? 0 } : null;
}
function validPriceRange(minimum: unknown, maximum: unknown): boolean {
  const min = decimal(minimum), max = decimal(maximum);
  if (!min || !max) return false;
  const scale = Math.max(min.scale, max.scale);
  return min.digits * 10n ** BigInt(scale - min.scale) <= max.digits * 10n ** BigInt(scale - max.scale);
}
function pathInfo(path: string | null, productId: string): { extension: string } | null {
  if (!path) return null;
  const prefix = `products/${productId}/`;
  if (!path.startsWith(prefix)) return null;
  const match = /^[A-Za-z0-9_-]+\.([A-Za-z0-9]+)$/.exec(path.slice(prefix.length));
  return match ? { extension: match[1].toLowerCase() } : null;
}

/** Never infer an RFQ's product association from product name or other free text. */
export function planLegacyGradeSplit(input: LegacySplitInput): Result {
  const errors: string[] = [];
  const p = input.product;
  if (!uuid.test(p.id) || !uuid.test(p.supplier_id) || !uuid.test(input.newProductId) || p.id.toLowerCase() === input.newProductId.toLowerCase())
    errors.push("Mã sản phẩm hoặc NCC không hợp lệ.");
  // The public route is resolved by catalog rules, not necessarily p.category.
  // A trusted caller must supply the current resolved slug and verify the URL.
  const category = str(input.resolvedCategorySlug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category) ||
      (str(p.reviewed_category_slug) && str(p.reviewed_category_slug) !== category) ||
      (p.supplier_originated === true && !str(p.reviewed_category_slug)))
    errors.push("Danh mục URL không hợp lệ; cần đối chiếu route hiện tại.");
  if (!str(p.updated_at) || !Number.isFinite(Date.parse(p.updated_at))) errors.push("Thiếu mốc phiên bản sản phẩm.");
  if (!["kg", "mt"].includes(str(p.unit).toLowerCase()) || !str(p.currency))
    errors.push("Đơn vị hoặc tiền tệ giá gốc cần được xác nhận trước khi sao chép.");
  if (typeof p.ready_for_buyer !== "boolean" ||
      !(p.supplier_review_status === null || ["draft", "pending", "approved", "changes_requested", "paused"].includes(String(p.supplier_review_status))))
    errors.push("Thiếu trạng thái gốc cần bảo toàn.");
  const specs = obj(p.specs), rows = specs?.grade_rows;
  if (!Array.isArray(rows) || rows.length !== 2 || !obj(rows[0]) || !obj(rows[1])) errors.push("Sản phẩm phải có đúng hai dòng grade hợp lệ.");
  const first = Array.isArray(rows) ? obj(rows[0]) : null, second = Array.isArray(rows) ? obj(rows[1]) : null;
  const firstGrade = str(first?.grade), secondGrade = str(second?.grade);
  if (!firstGrade || !secondGrade || norm(firstGrade) === norm(secondGrade)) errors.push("Hai grade phải có tên khác nhau và không để trống.");
  for (const row of [first, second]) {
    if (!validPriceRange(row?.price_min, row?.price_max) || !str(row?.moq) || !["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"].includes(str(row?.incoterm).toUpperCase()))
      errors.push("Dòng grade thiếu khoảng giá, MOQ hoặc Incoterm hợp lệ.");
  }
  const mappings = new Map(input.imageMappings.map((item) => [item.sourceId, item]));
  if (mappings.size !== input.imageMappings.length || new Set(input.imageMappings.map((m) => m.newId.toLowerCase())).size !== input.imageMappings.length ||
      input.imageMappings.some((m) => !uuid.test(m.sourceId) || !uuid.test(m.newId) || m.sourceId.toLowerCase() === m.newId.toLowerCase()))
    errors.push("Ánh xạ mã ảnh không hợp lệ hoặc bị lặp.");
  const images = input.assets.filter((asset) => asset.kind === "image");
  if (input.assets.some((asset) => asset.kind !== "image"))
    errors.push("Sản phẩm có tệp khác ngoài ảnh; cần phương án sao chép và đối chiếu riêng.");
  const sourceAssetIds = new Set(input.assets.map((asset) => asset.id.toLowerCase()));
  if (input.imageMappings.some((m) => sourceAssetIds.has(m.newId.toLowerCase()) || m.newId.toLowerCase() === input.newProductId.toLowerCase()))
    errors.push("Mã ảnh mới trùng với mã ảnh cũ hoặc mã sản phẩm mới.");
  if (images.length < 1 || images.length > 8 || images.length !== mappings.size ||
      new Set(images.map((asset) => asset.id.toLowerCase())).size !== images.length)
    errors.push("Cần ánh xạ đầy đủ từ 1 đến 8 ảnh gốc.");
  const assetCopies: LegacySplitPlan["assetCopies"] = [];
  for (const asset of images) {
    const mapping = mappings.get(asset.id), main = pathInfo(asset.storage_path, p.id);
    const thumb = asset.thumb_path ? pathInfo(asset.thumb_path, p.id) : null;
    if (!mapping || !main || !["jpg", "jpeg", "png", "webp"].includes(main.extension) ||
        (asset.thumb_path && (!thumb || !["jpg", "jpeg", "png", "webp"].includes(thumb.extension))) ||
        asset.owner_type !== "product" || asset.product_id !== p.id || asset.supplier_id !== p.supplier_id) {
      errors.push("Ảnh thiếu ánh xạ, không thuộc sản phẩm/NCC hoặc đường dẫn không an toàn.");
      continue;
    }
    assetCopies.push({ sourceId: asset.id, newId: mapping.newId, sourcePath: asset.storage_path!,
      newPath: `products/${input.newProductId}/${mapping.newId}.${main.extension}`,
      sourceThumbPath: asset.thumb_path, newThumbPath: thumb ? `products/${input.newProductId}/${mapping.newId}-thumb.${thumb.extension}` : null });
  }
  const sourcePaths = assetCopies.flatMap((copy) => [copy.sourcePath, ...(copy.sourceThumbPath ? [copy.sourceThumbPath] : [])]);
  if (new Set(sourcePaths).size !== sourcePaths.length) errors.push("Tệp ảnh gốc dùng chung đường dẫn; cần đối chiếu thủ công.");
  if (p.featured_media_id && !mappings.has(p.featured_media_id)) errors.push("Ảnh đại diện không nằm trong tập ảnh được sao chép.");
  if (Array.isArray(p.images) && p.images.some((id) => !mappings.has(id))) errors.push("Danh sách ảnh của sản phẩm có liên kết chưa được ánh xạ.");
  if (new Set(input.rfqs.map((r) => r.id)).size !== input.rfqs.length || new Set(input.certificates.map((c) => c.id)).size !== input.certificates.length)
    errors.push("RFQ hoặc chứng nhận bị lặp trong dữ liệu kiểm kê.");
  const rfqs: LegacySplitPlan["rfqs"] = [];
  for (const rfq of input.rfqs) {
    if (!uuid.test(rfq.id) || rfq.source_product_id !== p.id || !Number.isFinite(Date.parse(rfq.updated_at))) {
      errors.push("RFQ không liên kết trực tiếp với sản phẩm gốc hoặc thiếu phiên bản.");
      continue;
    }
    const grade = norm(obj(rfq.specs)?.grade);
    const decision = grade === norm(secondGrade) ? "move_candidate" : grade === norm(firstGrade) ? "keep" : "review";
    rfqs.push({ id: rfq.id, updatedAt: rfq.updated_at, decision });
  }
  const certificates: LegacySplitPlan["certificates"] = [];
  for (const cert of input.certificates) {
    if (!uuid.test(cert.id) || !Number.isFinite(Date.parse(cert.updated_at)) || !Array.isArray(cert.requested_product_ids) || !Array.isArray(cert.approved_product_ids)) {
      errors.push("Chứng nhận thiếu danh sách phạm vi hoặc phiên bản hợp lệ.");
      continue;
    }
    const requested = cert.requested_product_ids.includes(p.id), approved = cert.approved_product_ids.includes(p.id);
    if (!requested && !approved) { errors.push("Chứng nhận không có liên kết tới sản phẩm gốc."); continue; }
    certificates.push({ id: cert.id, updatedAt: cert.updated_at, requested, approved });
  }
  if (errors.length || !first || !second) return { ok: false, errors };
  return { ok: true, plan: {
    sourceId: p.id, sourceUpdatedAt: p.updated_at, supplierId: p.supplier_id, category,
    originalUrl: `/products/${category}/${p.id}`, newProductId: input.newProductId,
    newUrl: `/products/${category}/${input.newProductId}`,
    sourceSnapshot: structuredClone(p), assetSnapshots: structuredClone(images), certificateSnapshots: structuredClone(input.certificates),
    gradeRows: [structuredClone(first), structuredClone(second)],
    sourceGrade: firstGrade, newGrade: secondGrade, assetCopies,
    featuredImageMapping: p.featured_media_id ? { ...mappings.get(p.featured_media_id)! } : null,
    rfqs, certificates,
    warnings: ["Chỉ là kế hoạch chỉ đọc, chưa sao chép tệp hoặc thay đổi dữ liệu.",
      "Cần kiểm tra nội dung mô tả và tên chứa nhiều grade; không tự sửa hoặc tự tạo bản dịch.",
      "RFQ được đánh dấu move_candidate cần rà soát xác nhận trước khi cập nhật; RFQ không rõ giữ nguyên.",
      "Bảo toàn trạng thái và quyền hiển thị; kiểm tra chứng nhận theo phạm vi được duyệt.",
      "Sao chép và kiểm tra tệp độc lập trước giao dịch; khóa và đối chiếu toàn bộ snapshot trước khi ghi."],
  } };
}
