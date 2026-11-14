import { getStore } from "@/lib/db";
import { verificationLabels } from "@/lib/verification-status";
import { listPublicCategoryProducts } from "./product-catalog";
import { packagingSummaryEnglish } from "./product-extras-display";
import { publicProductExportPortDisplay } from "./product-export-port";
import { productCertificatesFor } from "./product-certificates";
import { supplierShortName } from "./supplier-name";

/**
 * Ngữ cảnh sản phẩm hiện ở đầu form RFQ khi người mua bấm "Request a quote" từ trang
 * sản phẩm. Chỉ trả về khi sản phẩm đã qua đúng cổng công bố (nằm trong danh sách
 * buyer-ready của danh mục và đúng nhà cung cấp); mọi trường hợp khác trả null để form
 * quay về trạng thái "vào từ menu" — không đoán, không hiện dữ liệu chưa duyệt.
 */
export type RfqProductContext = {
  id: string;
  name: string;
  imageUrl: string | null;
  supplierName: string;
  supplierHref: string;
  /** Tên các bước xác minh đã duyệt (không hiện "x/3 approved"). */
  checks: string[];
  grade: string | null;
  moq: string | null;
  incoterm: string | null;
  /** Giá tham khảo nhà cung cấp công bố — KHÔNG phải giá mục tiêu của người mua. */
  referencePrice: string | null;
  priceUpdatedAt: string | null;
  packaging: string | null;
  leadTime: string | null;
  exportPort: string | null;
  certificates: string[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-02" → "2 Nov 2026". Không dùng toLocaleDateString để server luôn ra một kết quả. */
function shortDate(iso: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export async function loadRfqProductContext(input: {
  categorySlug: string | null | undefined;
  supplierId: string | null | undefined;
  productId: string | null | undefined;
}): Promise<RfqProductContext | null> {
  const { categorySlug, supplierId, productId } = input;
  if (!categorySlug || !supplierId || !productId) return null;
  const store = getStore();
  const category = await store.getCategoryBySlug(categorySlug).catch(() => null);
  if (!category || !category.is_published) return null;

  // Cổng công bố: chỉ sản phẩm buyer-ready của đúng nhà cung cấp mới có thẻ ngữ cảnh.
  const card = (await listPublicCategoryProducts(category).catch(() => []))
    .find((product) => product.id === productId && product.supplierId === supplierId);
  if (!card) return null;

  // Sản phẩm đã qua cổng công khai ở trên (card); chỉ đọc đúng bản ghi này, không đọc cả bảng.
  const raw = await store.getProduct(productId).catch(() => null);
  const parentCategory = category.parent_id ? await store.getCategory(category.parent_id).catch(() => null) : null;
  const certificates = await productCertificatesFor(productId, supplierId, [
    category.id,
    ...(parentCategory ? [parentCategory.id] : []),
  ]).catch(() => []);

  const offer = card.quantityOffer;
  const imagePath = card.cardImagePath ?? card.imagePaths[0] ?? null;
  const packaging = raw ? (packagingSummaryEnglish(raw) || raw.packaging_i18n?.en?.trim() || raw.packaging?.trim() || "") : "";

  return {
    id: card.id,
    name: card.name,
    imageUrl: imagePath ? `/public-media/${imagePath.replace(/^\/+/, "")}` : null,
    supplierName: supplierShortName({ name: card.supplierName }),
    supplierHref: `/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`,
    checks: verificationLabels(card.verificationSteps ?? []),
    grade: offer?.grade?.trim() || card.grade?.trim() || card.gradeRows[0]?.grade?.trim() || null,
    moq: offer?.moq?.trim() || card.moq?.trim() || null,
    incoterm: offer?.incoterm?.trim() || card.incoterm?.trim() || card.gradeRows[0]?.incoterm?.trim() || null,
    referencePrice: card.price?.trim() || null,
    priceUpdatedAt: shortDate(card.pricePoint?.updatedAt),
    packaging: packaging || null,
    leadTime: card.leadTimeText?.trim() || (card.leadTimeDays != null ? `${card.leadTimeDays} days` : null),
    exportPort: raw ? publicProductExportPortDisplay(raw) || null : null,
    certificates: certificates.slice(0, 4).map((certificate) => certificate.name),
  };
}
