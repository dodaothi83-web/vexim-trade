import { VeximTradeIcon } from "@/components/brand/vexim-icons";
import { ProductCertificateCards } from "@/components/public/product-certificate-cards";
import { ShareProductButton } from "@/components/share-product-button";
import { SaveProductButton } from "@/components/buyer-saved-products";
import { cache, Suspense, type ReactNode } from "react";
import { AskSupplierDialog } from "@/components/products/ask-supplier-dialog";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, MapPin } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";
import { ProductVerificationIcons } from "@/components/product-verification-icons";
import { VerifiedBadge } from "@/components/verified-badge";
import { parseProductSpecification, productSpecificationKey, publicProductLocationDisplay, publicProductMoqDisplay } from "@/lib/public/product-detail-display";
import { publicProductExportPortDisplay } from "@/lib/public/product-export-port";
import { getStore } from "@/lib/db";
import { readTopViewedProductIds } from "@/lib/traffic/server";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { allPublicProductRouteParams, listMoreFromSupplier, listPublicCategoryProducts, loadPublicProductCatalogSnapshot, publicProductRouteParams, shareableProductImages } from "@/lib/public/product-catalog";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";
import { tagProductPage } from "@/lib/public/product-page-tag";
import { fieldsFor, supplierFieldsFor } from "@/lib/product-attributes";
import { shareableProductVideo } from "@/lib/public/product-video";
import { ProductMediaGallery } from "@/components/product-media-gallery";
import { StickyProductColumn } from "@/components/sticky-product-column";
import { ProductTradeLabels } from "@/components/product-trade-labels";
import { cardTitleGrades, PublicProductCard } from "@/components/public-product-card";
import { ProductDescription } from "@/components/public/product-description";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { ProductAplus } from "@/components/public/product-aplus";
import { aplusVideoEmbedUrl, aplusVideoThumbnailUrl, isoDuration, productShowsAplus, readAplusModules, readGalleryVideo } from "@/lib/products/aplus";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { QuantityPriceTable } from "@/components/public/quantity-price-table";
import { productBelongsToCategory, withoutDirectContacts } from "@/lib/public/product-selection";
import { movedProductDestination } from "@/lib/public/product-category-redirect";
import { isStaffProductView } from "@/lib/public/product-staff-view";
import { SupplierTrafficBeacon } from "@/components/supplier-traffic-beacon";
import { pageTitle, SITE_NAME, SITE_URL } from "@/lib/site";
import { safeJsonLd } from "@/lib/public/supplier-seo";
import { hasProductComparisonPeer } from "@/lib/public/product-comparison";
import { packagingSummaryEnglish, samplePriceEnglish } from "@/lib/public/product-extras-display";
import { productCertificatesFor } from "@/lib/public/product-certificates";
import type { CategoryCertificateData } from "@/lib/public/category-certificate-data";
import { similarOffers } from "@/lib/public/similar-offers";
import { supplierChatAvailable } from "@/lib/chat/service";
import { SimilarOffersRail } from "@/components/public/similar-offers-rail";
import { SupplierWebsiteLink } from "@/components/public/supplier-website-link";
import { categoryTieWindow } from "@/lib/public/ranking";
import { absolutePublicMediaUrl, cdnVariant, publicMediaUrl, publicMediaUrlAt } from "@/lib/media/public-url";

/**
 * Trang dựng sẵn (ISR) phục vụ từ CDN thay vì render lại mỗi lượt xem (từng là force-dynamic).
 * Bản này KHÔNG được đọc cookie/phiên — đọc là Next.js buộc render động và mất cache. Việc cần
 * phiên (xem trước danh mục chưa công khai, không đếm lượt xem của chính mình) chỉ chạy ở bản
 * động app/(public)/staff-product-view, nơi middleware.ts đưa người có cookie phiên tới (URL
 * không đổi, xem lib/public/product-route.ts). Làm mới mỗi giờ; sửa sản phẩm thì trang của sản
 * phẩm đó làm mới ngay, trang khác làm mới ở nền (lib/public/revalidate-public.ts).
 */
// 1 giờ (chủ dự án duyệt 24/11/2026); sửa sản phẩm thì trang đó làm mới ngay (revalidateProductEdit).
export const revalidate = 3600;

/** Tối đa bấy nhiêu trang sản phẩm được dựng sẵn mỗi lần deploy. */
const PREBUILT_PRODUCT_PAGES = 500;

/**
 * Dựng sẵn lúc deploy để người mua không phải chờ dựng trang ở lượt xem đầu (mỗi lần deploy cache
 * trang bắt đầu lại từ đầu). Còn ít hơn PREBUILT_PRODUCT_PAGES sản phẩm công khai thì dựng sẵn hết;
 * nhiều hơn thì chỉ dựng những sản phẩm được xem nhiều nhất 90 ngày qua, trang khác dựng ở lượt
 * xem đầu rồi giữ trong cache. Đọc lỗi thì không dựng sẵn trang nào, không làm hỏng bản build.
 */
export async function generateStaticParams(): Promise<Array<{ slug: string; productId: string }>> {
  try {
    const all = await allPublicProductRouteParams();
    if (all.length <= PREBUILT_PRODUCT_PAGES) return all;
    return await publicProductRouteParams(await readTopViewedProductIds(PREBUILT_PRODUCT_PAGES));
  } catch (error) {
    console.error("[product-page] top products for prebuild", error);
    return [];
  }
}

type Props = { params: Promise<{ slug: string; productId: string }> };

async function getDetail(slug: string, productId: string) {
  const store = getStore();
  // Đọc cùng lúc thay vì lần lượt. Danh mục lấy từ danh sách đầy đủ: mỗi lần đọc danh mục ở
  // Supabase kèm một lượt quét sản phẩm/nhà cung cấp (decorateCategoryReadiness), đọc một lần đủ.
  const productRead = store.getProduct(productId);
  // Ảnh, nhà cung cấp và quyền chat chỉ cần sản phẩm: đọc luôn trong lúc chờ danh mục, trang dùng
  // khi sản phẩm qua hết các bước kiểm tra bên dưới (không qua thì kết quả bị bỏ, không hiện gì).
  const mediaRead = store.listMedia("product", productId);
  const supplierRead = productRead.then((row) => row ? store.getSupplier(row.supplier_id).catch(() => null) : null);
  const chatRead = supplierRead.then((row) => row ? supplierChatAvailable(store, row.id, row) : false).catch(() => false);
  // Lỗi vẫn ném ra ở dòng await; mấy dòng này chỉ tránh lỗi "unhandled" khi trả 404 sớm.
  for (const read of [productRead, mediaRead, supplierRead]) read.catch(() => undefined);
  const categories = await store.listCategories({ publishedOnly: false });
  const category = categories.find((candidate) => candidate.slug === slug) ?? null;
  if (!category) return null;
  const published = category.status === "published" && category.is_published;
  // Chỉ bản động cho người có phiên mới đọc cookie (bản tĩnh coi danh mục chưa công khai là 404).
  const session = !published && isStaffProductView() ? await getSession() : null;
  if (!published && !(session && hasPermission(session.role, "categories.manage"))) return null;
  let certificateData: Promise<CategoryCertificateData> | undefined;
  // Nhân viên/nhà cung cấp (bản động) đọc thẳng dữ liệu mới, không qua bản cache catalog: vừa sửa
  // xong mở trang là thấy ngay, kể cả khi bản cache đang được làm mới ở nền.
  const snapshot = isStaffProductView() ? await loadPublicProductCatalogSnapshot({ categories }) : undefined;
  const categoryProducts = await listPublicCategoryProducts(category, { snapshot, onCertificateData: (data) => { certificateData = data; } });
  const card = categoryProducts.find((p) => p.id === productId);
  if (!card) return null;
  const product = await productRead;
  if (!product || product.supplier_id !== card.supplierId) return null;
  if (!productBelongsToCategory(product, category, categories)) return null;
  // Cùng mặt hàng từ nhà cung cấp khác, ưu tiên cùng grade, theo thứ tự xếp hạng danh mục.
  // Không có nhà cung cấp khác thì khối này ẩn; hàng cùng nhà cung cấp đã nằm ở "More from this supplier".
  const similar = similarOffers(card, categoryProducts, { limit: 12, window: categoryTieWindow(Date.now()) });
  return { category, categories, card, categoryProducts, product, similar, preview: !published, certificateData, reads: { media: mediaRead, supplier: supplierRead, chat: chatRead } };
}

/**
 * Một lần đọc cho mỗi request: generateMetadata và trang dùng chung kết quả (React cache),
 * thay vì đọc cả danh mục hai lần. Lệnh chuyển hướng 301 vẫn chạy trước khi trang render.
 */
const getDetailOrRedirect = cache(async (slug: string, productId: string) => {
  const detail = await getDetail(slug, productId);
  if (detail) return detail;
  // An old indexed category path must continue working when staff approve a
  // category change. Never redirect to an unpublished or ineligible product.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return null;
  const store = getStore();
  const [product, categories] = await Promise.all([store.getProduct(productId), store.listCategories({ publishedOnly: true })]);
  if (!product) return null;
  const destination = await movedProductDestination(product, categories, slug, async (targetSlug) => {
    const target = await getDetail(targetSlug, product.id);
    return !!target && !target.preview;
  });
  if (!destination) return null;
  permanentRedirect(destination);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params;
  const detail = await getDetailOrRedirect(slug, productId);
  if (!detail) return { title: "Product not found | Vexim Trade", robots: { index: false } };
  const categoryName = detail.category.name_i18n.en || slug;
  // Tiêu đề đặt tên sản phẩm trước rồi mới tới quốc gia + danh mục: tên sản phẩm
  // của nhà cung cấp thường rất dài (60–110 ký tự), nên ghép thêm hậu tố dài sẽ
  // bị Google cắt giữa từ. pageTitle() cũng chặn việc lặp "· Vexim Trade".
  const title = pageTitle(`${detail.card.name} – ${categoryName}, Vietnam`);
  const description = `${detail.card.name}. MOQ ${detail.card.moq}. Supplied in ${publicProductLocationDisplay(detail.card.province)}. Request a quote from ${SITE_NAME}.`;
  const ogImagePath = detail.card.cardImagePath ?? detail.card.imagePaths[0];
  const ogImage = ogImagePath ? absolutePublicMediaUrl(cdnVariant(ogImagePath, 1024) ?? ogImagePath, SITE_URL) : null;
  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}/${productId}` },
    robots: { index: !detail.preview && !detail.card.isDemo && !!detail.category.seo_indexable, follow: true },
    openGraph: {
      title, description, url: `/products/${slug}/${productId}`, siteName: "Vexim Trade", type: "website",
      ...(ogImage ? { images: [{ url: ogImage, alt: detail.card.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image", title, description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

function Spec({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="grid gap-1 border-b border-ink-100 py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(130px,0.42fr)_minmax(0,1fr)] sm:gap-5">
    <dt className="font-medium text-ink-500">{withoutDirectContacts(label)}</dt>
    <dd className="whitespace-pre-wrap break-words font-semibold leading-6 text-ink-800">{withoutDirectContacts(String(value))}</dd>
  </div>;
}

function renderGradeRowPrice(rawPriceText: string | null | undefined) {
  const safe = withoutDirectContacts(rawPriceText || "").trim();
  if (!safe) return "On request";
  const compact = safe
    .replace(/(\d)\s+to\s+(\d)/gi, "$1–$2")
    .replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
  const unitMatch = compact.match(/^(.*?)(\/[A-Za-z]+)$/);
  if (!unitMatch) return compact;
  return (
    <>
      <span>{unitMatch[1]}</span>
      <span className="text-[12.5px] font-medium text-ink-500">{unitMatch[2]}</span>
    </>
  );
}

export default async function PublicProductDetail({ params }: Props) {
  const { slug, productId } = await params;
  const detail = await getDetailOrRedirect(slug, productId);
  if (!detail) notFound();
  const { category, categories, card, categoryProducts, product: p, similar, preview, certificateData, reads } = detail;
  // Product eligibility was checked above. Read the website only for this
  // supplier card; don't put raw supplier contact fields in the product catalogue.
  const store = getStore();
  // Trang mang thẻ riêng của sản phẩm: sửa sản phẩm này chỉ dựng lại trang này (revalidateProductEdit).
  const pageTagged = tagProductPage(p.id);
  // Tối đa 5 sản phẩm khác của cùng nhà cung cấp; chỉ có một sản phẩm thì khối này ẩn hẳn.
  // Không chờ ở đây: hai khối gợi ý cuối trang tự tải sau (Suspense), phần chính hiện trước.
  const moreFromSupplierRead = listMoreFromSupplier(card, slug, categoryProducts, { limit: 5 });
  const parentCategory = category.parent_id ? categories.find((candidate) => candidate.id === category.parent_id) ?? null : null;
  const categoryPath = [category.id, ...(parentCategory ? [parentCategory.id] : [])];
  // Phần lớn đã đọc sẵn trong getDetail. Chứng nhận dùng lại dữ liệu đã đọc cho danh sách danh mục.
  const [media, supplier, productCertificates, canChat] = await Promise.all([
    reads.media,
    // Hồ sơ demo: không đọc website/gói của nhà cung cấp.
    card.isDemo ? Promise.resolve(null) : reads.supplier,
    productCertificatesFor(p.id, p.supplier_id, categoryPath, certificateData),
    // Nút chat chỉ hiện khi nhà cung cấp có tài khoản cổng đang hoạt động để trả lời.
    card.isDemo ? supplierChatAvailable(store, card.supplierId).catch(() => false) : reads.chat,
    readPlanCatalog(),
    pageTagged,
  ]);
  const supplierWebsite = supplier?.status === "published" ? supplier.website : null;
  const images = card.usesFormGallery ? card.imagePaths : shareableProductImages(media, p.id, p.featured_media_id, 24);
  const thumbnails = card.usesFormGallery ? (card.imageThumbnailPaths ?? card.imagePaths) : shareableProductImages(media, p.id, p.featured_media_id, 24, true);
  const video = shareableProductVideo(media, p.id);
  // Grade đi kèm để form chọn sẵn đúng chip; tên sản phẩm thì server tự dựng từ product_id.
  const rfqGrade = (card.quantityOffer?.grade ?? card.grade ?? card.gradeRows[0]?.grade ?? "").trim();
  const rfq = `/rfq?category=${encodeURIComponent(slug)}&suppliers=${encodeURIComponent(card.supplierId)}&product=${encodeURIComponent(card.name)}&product_id=${encodeURIComponent(card.id)}${rfqGrade ? `&grade=${encodeURIComponent(rfqGrade)}` : ""}`;

  const approvedAttributes = card.attributes;
  const configuredKeys = new Set(fieldsFor(category).map((f) => f.key));
  // Thông số NCC tự thêm chưa được Vexim duyệt thành trường của danh mục: không tự lên trang buyer.
  const supplierKeys = new Set(supplierFieldsFor(category).map((f) => f.key));
  const legacyKeys = [...supplierKeys].filter((key) => !configuredKeys.has(key));
  const specs = [
    ...fieldsFor(category).filter((f) => approvedAttributes[f.key]).map((f) => [f.label, approvedAttributes[f.key]] as [string, string]),
    ...(configuredKeys.size ? [] : Object.entries(p.specs ?? {}).filter(([key, value]) =>
      (typeof value === "string" || typeof value === "number") && !legacyKeys.includes(key)).map(([key, value]) => [key, String(value)] as [string, string])),
  ].slice(0, 12);

  // Trang buyer hiển thị bản tiếng Anh (AI dịch, nhân viên Vexim đã chốt); chỉ lùi về nội dung gốc khi chưa có bản dịch.
  const enDescription = p.description_i18n?.en?.trim() || p.description;
  const enSpec = p.spec_i18n?.en?.trim() || p.spec;
  const enPackaging = p.packaging_i18n?.en?.trim() || p.packaging;
  // Đóng gói có cấu trúc (Phase 2) là tiếng Anh, dựng từ số liệu nhà cung cấp đã khai.
  const structuredPackaging = packagingSummaryEnglish(p);
  const samplePrice = samplePriceEnglish(p);
  const samplePriceDisplay = p.sample_price_usd === 0 ? "Free sample" : samplePrice;
  const textDetail = p.description_detail_i18n?.en?.trim() || p.description_detail;
  // Nội dung A+ chỉ hiện khi gói nhà cung cấp còn quyền; gói hết hạn thì nội dung giữ nhưng ẩn.
  const planRules = supplier ? supplierPlanRules(supplier, new Date(), await readPlanCatalog()) : null;
  const aplusAll = planRules?.richContent
    ? readAplusModules(p.aplus_content, { supplierId: p.supplier_id, productId: p.id }) : [];
  // Nhà cung cấp chọn "Nội dung cơ bản" thì trang hiện mô tả chữ, A+ vẫn được giữ để bật lại.
  const aplus = productShowsAplus(p, aplusAll, !!planRules?.richContent) ? aplusAll : [];
  // Video sản phẩm (Premium/Pro) nằm cuối dãy ảnh; gói hết quyền thì video giữ nhưng ẩn.
  const galleryVideo = planRules?.video ? readGalleryVideo(p.gallery_video) : null;
  // Nội dung A+ thay cho mô tả bằng chữ; chưa có A+ hoặc gói hết hạn thì hiện mô tả chữ.
  const enDetail = aplus.length ? null : textDetail;
  const parsedSpecifications = parseProductSpecification(enSpec);
  const detailRows = parsedSpecifications.filter((row) => !["grade", "minimum order quantity (moq)", "packaging specification"].includes(row.key));
  const detailedPackaging = parsedSpecifications.find((row) => row.key === "packaging specification")?.value;
  const gradeRows = card.gradeRows ?? [];
  const occupiedSpecKeys = new Set([
    ...parsedSpecifications.map((row) => row.key),
    "grade", "product type", "product_type", "moq", "minimum order quantity (moq)", "packaging", "packaging specification",
    "reference price", "lead time", "incoterm", "export port", "loading port",
  ]);
  const additionalSpecs = specs.filter(([label]) => !occupiedSpecKeys.has(productSpecificationKey(label)));
  const supplierImageUrl = card.supplierProfileImage ? publicMediaUrl(card.supplierProfileImage) : null;
  const relatedOffers = moreFromSupplierRead.then((moreFromSupplier) => {
    const relatedComparisonOffers = [
      ...[card, ...similar.map((s) => s.offer)].map((product) => ({ product, categorySlug: slug })),
      ...moreFromSupplier.map(({ card: product, categorySlug }) => ({ product, categorySlug })),
    ].map(({ product, categorySlug }) => ({
      id: product.id, supplierId: product.supplierId, categorySlug, isDemo: product.isDemo,
    }));
    return { moreFromSupplier, relatedComparisonOffers };
  });
  const offerCard = (offer: typeof card, offerSlug: string, relatedComparisonOffers: ComparisonPeer[]) => <PublicProductCard key={offer.id} href={`/products/${encodeURIComponent(offerSlug)}/${encodeURIComponent(offer.id)}`}
    imagePath={offer.cardImagePath ?? offer.imagePaths[0]} name={offer.name} grades={cardTitleGrades(offer)} gradeRows={offer.gradeRows} moq={offer.moq}
    volumePricing={offer.quantityOffer?.hasVolumePricing}
    price={offer.price} incoterm={offer.incoterm} fob={offer.incoterm?.toUpperCase() === "FOB"} leadTimeDays={offer.leadTimeDays} leadTimeText={offer.leadTimeText}
    supplierName={offer.supplierName} supplierHref={`/suppliers/${encodeURIComponent(offer.supplierSlug || offer.supplierId)}`}
    verificationSteps={offer.verificationSteps} l2Scope={offer.l2Scope} certificates={offer.certificates}
    comparison={!preview && hasProductComparisonPeer(relatedComparisonOffers, {
      id: offer.id, supplierId: offer.supplierId, categorySlug: offerSlug, isDemo: offer.isDemo,
    }) ? { id: offer.id, categorySlug: offerSlug } : undefined} />;

  // Người có phiên (nhân viên/NCC) luôn đi bản động staff-product-view: không đếm lượt xem của chính họ.
  // /api/public/traffic vẫn tự kiểm tra lại phiên, danh mục, sản phẩm và nhà cung cấp trước khi đếm.
  const countView = !preview && !card.isDemo && !isStaffProductView();
  // Product schema chỉ cho trang đủ điều kiện index. Không khai offers/aggregateRating:
  // giá trên trang là giá tham khảo qua RFQ, không phải chào bán giao dịch trực tiếp.
  // Đóng gói và giá mẫu vì vậy nằm trong additionalProperty, không nằm trong Offer.
  const indexable = !preview && !card.isDemo && !!category.seo_indexable;
  // Thuộc tính có cấu trúc chỉ lấy từ dữ kiện đã qua kiểm tra: MOQ và lead time
  // trên bản ghi sản phẩm công khai, cùng các trường thuộc tính theo danh mục
  // đã qua kiểm tra hợp lệ. Không lấy thuộc tính thô ngoài cấu hình danh mục.
  const structuredProperties: Array<{ "@type": "PropertyValue"; name: string; value: string }> = [];
  const pushProperty = (name: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (!v) return;
    if (structuredProperties.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;
    structuredProperties.push({ "@type": "PropertyValue", name, value: v });
  };
  const structuredMoq = card.moq !== "On request" ? card.moq : publicProductMoqDisplay(p.moq);
  if (structuredMoq) pushProperty("MOQ", structuredMoq);
  if (card.leadTimeText && card.leadTimeText !== "On request") pushProperty("Lead time", card.leadTimeText);
  // Phase 2: chỉ khai những gì nhà cung cấp đã nhập và đã qua kiểm tra hiển thị.
  if (structuredPackaging) pushProperty("Packaging", structuredPackaging);
  if (samplePrice) pushProperty("Sample price", samplePrice);
  for (const f of fieldsFor(category)) {
    if (approvedAttributes[f.key]) pushProperty(f.label, approvedAttributes[f.key]);
  }
  // Video A+ khai báo dạng VideoObject để Google/AI hiểu trang có video sản phẩm. Chỉ video đã có
  // ngày tải lên (máy chủ lấy từ Cloudflare khi lưu), vì uploadDate là trường bắt buộc.
  const videoJsonLd = [
    ...(galleryVideo ? [{ video_uid: galleryVideo.video_uid, title: "", duration: galleryVideo.duration, uploaded_at: galleryVideo.uploaded_at }] : []),
    ...aplus.flatMap((module) => module.type === "video" ? [module] : []),
  ].flatMap((video) => video.uploaded_at ? [{
    "@type": "VideoObject",
    name: video.title || `${card.name} video`,
    description: video.title ? `${video.title} — ${card.name}` : `${card.name} by ${card.supplierName}`,
    thumbnailUrl: aplusVideoThumbnailUrl(video.video_uid),
    uploadDate: video.uploaded_at,
    embedUrl: aplusVideoEmbedUrl(video.video_uid),
    ...(video.duration ? { duration: isoDuration(video.duration) } : {}),
  }] : []);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.name,
    url: `${SITE_URL}/products/${slug}/${productId}`,
    ...(images.length ? { image: images.map((path) => absolutePublicMediaUrl(path, SITE_URL)) } : {}),
    ...(enDescription ? { description: withoutDirectContacts(enDescription) } : {}),
    category: category.name_i18n.en || slug,
    brand: {
      "@type": "Organization",
      name: card.supplierName,
      ...(card.supplierSlug ? { url: `${SITE_URL}/suppliers/${encodeURIComponent(card.supplierSlug)}` } : {}),
    },
    ...(structuredProperties.length ? { additionalProperty: structuredProperties } : {}),
    ...(videoJsonLd.length ? { subjectOf: videoJsonLd } : {}),
    // Chỉ chứng nhận đã được duyệt gắn cho sản phẩm và còn hiệu lực; không suy ra
    // chứng nhận của nhà cung cấp sang từng sản phẩm.
    ...(productCertificates.length
      ? {
        hasCertification: productCertificates.map((certificate) => ({
          "@type": "Certification",
          name: certificate.shortName,
          ...(certificate.validUntil ? { expires: certificate.validUntil } : {}),
        })),
      }
      : {}),
  };
  // BreadcrumbList đi kèm Product: Google và các hệ thống AI dùng đường dẫn phân
  // cấp này để hiểu sản phẩm nằm trong danh mục nào, và để thay chuỗi URL thô
  // bằng breadcrumb trong kết quả tìm kiếm. Trước đây trang chi tiết có
  // <Breadcrumbs> trên giao diện nhưng thiếu hẳn khai báo có cấu trúc.
  const productBreadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: category.name_i18n.en || slug, item: `${SITE_URL}/products/${encodeURIComponent(slug)}` },
      { "@type": "ListItem", position: 3, name: card.name, item: `${SITE_URL}/products/${encodeURIComponent(slug)}/${encodeURIComponent(productId)}` },
    ],
  };
  return <div className="mx-auto max-w-6xl px-5 pb-24 pt-7 sm:px-6 lg:px-8">
    {indexable && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }} />}
    {indexable && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productBreadcrumbJsonLd) }} />}
    {countView && <SupplierTrafficBeacon pageKey={`product:${p.id}`} product={{ slug, productId: p.id }} />}
    {preview && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">Staff preview — this category is not public yet.</p>}
    {card.isDemo && <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900">DEMO DATA · Sample product, not a real supplier offer.</p>}
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: category.name_i18n.en || slug, href: `/products/${slug}` }, { label: card.name }]} />
    <Link href={`/products/${slug}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to products</Link>
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <StickyProductColumn>
        <ProductMediaGallery name={card.name} images={images} thumbnails={thumbnails} video={video}
          streamVideo={galleryVideo ? { uid: galleryVideo.video_uid, title: `${card.name} video` } : null}
          actions={!preview && !card.isDemo ? <>
            <SaveProductButton id={card.id} href={`/products/${encodeURIComponent(slug)}/${encodeURIComponent(card.id)}`} iconOnly />
            <ShareProductButton title={card.name} href={`/products/${encodeURIComponent(slug)}/${encodeURIComponent(card.id)}`} />
          </> : undefined} />
        <aside className="mt-6 overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card" aria-labelledby="supplier-card-title">
          <div className="border-b border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5">
            <div className="flex items-start gap-3">
              <Link prefetch={false} href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${card.supplierName} supplier profile (opens in a new tab)`}
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand-100 bg-white text-brand-700 shadow-sm">
                {supplierImageUrl ? <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={supplierImageUrl} alt="" className="h-full w-full object-cover" />
                </> : <VeximTradeIcon className="h-6 w-6" aria-hidden="true" />}
              </Link>
              <div className="min-w-0 flex-1">
                <h2 id="supplier-card-title" className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Supplied by</h2>
                <Link prefetch={false} href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} target="_blank" rel="noopener noreferrer" className="mt-1 block break-words text-base font-bold leading-6 text-ink-900 hover:text-brand-800">{card.supplierName}</Link>
                {/* Website nằm cùng hàng với dấu xác minh; hết chỗ thì tự xuống dòng. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {/* Cùng nhãn "Verified L1/L2/L3" như thẻ sản phẩm (chủ sàn chốt 24/11/2026). */}
                  <VerifiedBadge levels={card.verificationSteps} l2Scope={card.l2Scope} align="left" />
                  <SupplierWebsiteLink website={supplierWebsite} plain className="min-h-8" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-ink-600">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-brand-700" />{publicProductLocationDisplay(card.province)}</span>
              {card.supplierFoundedYear && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-brand-700" />Founded {card.supplierFoundedYear}</span>}
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-ink-800">Supplier verification</p>
              <span className="text-xs font-semibold text-ink-500">{card.verificationSteps.length}/3 approved</span>
            </div>
            <div className="mt-2"><ProductVerificationIcons levels={card.verificationSteps} l2Scope={card.l2Scope} /></div>
            {(card.verificationSteps.includes(2) || card.verificationSteps.includes(3)) && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {card.verificationSteps.includes(2) && (card.l2Scope === "factory" || card.l2Scope === "both") && <Link prefetch={false} href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#factory-visit`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Factory verification scope</Link>}
              {card.verificationSteps.includes(2) && (card.l2Scope === "partner_contract" || card.l2Scope === "both") && <Link prefetch={false} href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#partner-factory-contract`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Partner contract review scope</Link>}
              {card.verificationSteps.includes(3) && <Link prefetch={false} href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#delivery-history`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Delivery review scope</Link>}
            </div>}
            <Link prefetch={false} href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-800 hover:underline">View supplier profile <ArrowRight className="h-4 w-4" /></Link>
            <p className="mt-3 text-xs leading-5 text-ink-500">Ask this supplier directly through an RFQ in your account. Vexim coordinates only general sourcing requests. The website is supplier-provided.</p>
            <Link href={`/khieu-nai?product=${encodeURIComponent(card.id)}`} className="mt-3 inline-block text-xs font-semibold text-brand-700 underline">Report this listing</Link>
          </div>
        </aside>
      </StickyProductColumn>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Vietnam · {category.name_i18n.en || slug}</p>
        <h1 className="mt-2 break-words text-xl font-semibold leading-snug tracking-tight text-ink-900 sm:text-2xl">{card.name}</h1>
        {enDescription && <p className="mt-4 text-sm leading-relaxed text-ink-700">{withoutDirectContacts(enDescription)}</p>}
        {card.quantityOffer ? <QuantityPriceTable offer={card.quantityOffer} /> : gradeRows.length > 0 ? (
          <div id="reference-price" className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3">
              <h2 className="text-sm font-bold text-ink-900">Grades &amp; reference pricing</h2>
              <p className="mt-0.5 text-xs text-ink-500">Per-grade indicative pricing, Incoterm and minimum order quantity</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="border-b border-ink-100 bg-ink-50/40 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-5 py-2.5">Grade</th>
                    <th className="px-4 py-2.5">Reference price</th>
                    <th className="px-4 py-2.5">Incoterm</th>
                    <th className="px-5 py-2.5">MOQ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {gradeRows.map((row, index) => (
                    <tr key={`${row.grade}-${index}`}>
                      <td className="px-5 py-3 font-semibold text-ink-900">
                        {withoutDirectContacts(row.grade)}
                        {row.isCustom && (
                          <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">
                            Supplier grade
                          </span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 ${
                          row.priceText
                            ? "font-bold tabular-nums tracking-tight text-brand-800"
                            : "font-medium text-ink-500"
                        }`}
                      >
                        {renderGradeRowPrice(row.priceText)}
                      </td>
                      <td className="px-4 py-3 text-ink-800">{withoutDirectContacts(row.incoterm || "FOB")}</td>
                      <td className="px-5 py-3 text-ink-800">{withoutDirectContacts(row.moq || "On request")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div id="reference-price" className="mt-5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Reference price</p>
            <p className={`mt-0.5 break-words text-lg font-bold leading-snug text-brand-800 sm:text-xl ${card.price ? "tabular-nums tracking-tight" : ""}`}>{withoutDirectContacts(card.price || "On request")}</p>
          </div>
        )}
        {(p.oem || p.odm || p.samples) && <div className="mt-4"><ProductTradeLabels oem={p.oem} odm={p.odm} samples={p.samples} />
          <p className="mt-1.5 text-xs text-ink-500">Stated by the supplier. Confirm availability, scope and sample costs with Vexim in your RFQ.</p></div>}
        <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-3">
            <h2 className="text-sm font-bold text-ink-900">Key terms</h2>
            <p className="mt-0.5 text-xs text-ink-500">Commercial details for your RFQ</p>
          </div>
          <dl className="px-5">
            {!card.quantityOffer && gradeRows.length === 0 && (
              <>
                <Spec label="Grade" value={approvedAttributes.grade ?? card.grade} />
                <Spec label="MOQ" value={card.moq} />
              </>
            )}
            <Spec label="Packaging" value={structuredPackaging || detailedPackaging || enPackaging} />
            {samplePriceDisplay && <Spec label="Sample price" value={samplePriceDisplay} />}
            <Spec label="Lead time" value={card.leadTimeText || (card.leadTimeDays !== null ? `${card.leadTimeDays} days` : "On request")} />
            {!card.quantityOffer && gradeRows.length === 0 && <Spec label="Incoterm" value={card.incoterm} />}
            <Spec label="Loading port" value={publicProductExportPortDisplay(p)} />
            <Spec label="Raw material region" value={card.rawMaterialRegion} />
            <Spec label="Input material origin" value={card.inputMaterialOrigin} />
          </dl>
        </div>
        {productCertificates.length > 0 && (
          <section aria-labelledby="product-certificates-heading" className="mt-5 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
            <h2 id="product-certificates-heading" className="text-sm font-bold text-ink-900">Product certificates</h2>
            <p className="mt-1 text-xs leading-5 text-ink-600">Shared by the supplier and linked to this product by Vexim. Holder names and expiry dates come from the document copies; issuer authentication is a separate check.</p>
            <div className="mt-4">
              <ProductCertificateCards certificates={productCertificates} />
            </div>
            <p className="mt-4 text-xs leading-5 text-ink-600">
              <Link prefetch={false} href={`/suppliers/${encodeURIComponent(card.supplierSlug || card.supplierId)}#certificates`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">All certificates on the supplier profile</Link>
            </p>
          </section>
        )}
        <p className="mt-2 text-xs leading-5 text-ink-500">Product details and reference prices are supplier-provided and reviewed for listing. Confirm current specifications, availability and final terms in your RFQ.</p>
        <div className={canChat ? "mt-5 grid grid-cols-2 gap-3" : "mt-5 grid grid-cols-1 gap-3"}>
          <Link href={rfq} className="btn btn-primary min-h-12 w-full justify-center px-2 text-sm font-bold shadow-lg shadow-brand-900/20 sm:px-4 sm:text-base">Request a quote <ArrowRight className="hidden h-5 w-5 sm:block" /></Link>
          {canChat && <Suspense fallback={<button disabled className="btn btn-soft min-h-12 w-full justify-center">Chat with supplier</button>}>
            <AskSupplierDialog category={slug} productId={card.id} productName={card.name} supplierId={card.supplierId} supplierName={card.supplierName} grade={rfqGrade}
              imageUrl={images[0] ? publicMediaUrlAt(images[0], 400) : null} quoteHref={rfq} />
          </Suspense>}
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-600">Your request goes to this supplier first. If they can’t meet it, we’ll ask you before suggesting anyone else.</p>
      </div>
    </div>
    <Suspense fallback={null}>
      <MoreFromSupplierSection related={relatedOffers} offerCard={offerCard} />
    </Suspense>
    {(detailRows.length > 0 || additionalSpecs.length > 0) && <section aria-labelledby="full-specifications-heading" className="mt-12 border-t border-ink-200 pt-8">
      <h2 id="full-specifications-heading" className="text-2xl font-black text-ink-900">Full specifications</h2>
      <p className="mt-1 text-sm text-ink-500">Technical details from the listing</p>
      <dl className="mt-5 grid gap-x-10 overflow-hidden rounded-xl border border-ink-200 bg-white px-5 shadow-sm md:grid-cols-2">
        {detailRows.map((row, index) => <Spec key={`${row.key}-${index}`} label={row.label} value={row.value} />)}
        {additionalSpecs.map(([key, value]) => <Spec key={key} label={key} value={String(value)} />)}
      </dl>
    </section>}
    {(enDetail || aplus.length > 0) && <section aria-labelledby="product-description-heading" className="mt-10 border-t border-ink-200 pt-8">
      <h2 id="product-description-heading" className="text-2xl font-black text-ink-900">Product description</h2>
      {enDetail && <ProductDescription value={enDetail} className="mt-4 max-w-3xl" />}
      <ProductAplus modules={aplus} productName={card.name} />
    </section>}
    <Suspense fallback={null}>
      <SimilarOffersSection related={relatedOffers} similar={similar} slug={slug} offerCard={offerCard} />
    </Suspense>
  </div>;
}

type ComparisonPeer = { id: string; supplierId: string; categorySlug: string; isDemo: boolean };
type RelatedOffers = Promise<{ moreFromSupplier: Awaited<ReturnType<typeof listMoreFromSupplier>>; relatedComparisonOffers: ComparisonPeer[] }>;
type OfferCardRenderer = (offer: PublicCategoryProduct, offerSlug: string, relatedComparisonOffers: ComparisonPeer[]) => ReactNode;

/**
 * Hai khối gợi ý cuối trang tải sau phần chính: "More from this supplier" có thể phải đọc thêm sản
 * phẩm ở danh mục khác. Trang đã dựng sẵn thì HTML có đủ cả hai khối như trước; chỉ lượt dựng
 * trang đầu tiên mới gửi phần chính trước rồi gửi tiếp hai khối này.
 */
async function MoreFromSupplierSection({ related, offerCard }: { related: RelatedOffers; offerCard: OfferCardRenderer }) {
  const { moreFromSupplier, relatedComparisonOffers } = await related;
  return <>
    {moreFromSupplier.length > 0 && <section id="more-from-supplier" className="mt-12 scroll-mt-24 border-t border-ink-200 pt-8">
      <SimilarOffersRail title="More from this supplier" titleId="more-from-supplier-heading">
        {moreFromSupplier.map(({ card: offer, categorySlug }) => offerCard(offer, categorySlug, relatedComparisonOffers))}
      </SimilarOffersRail>
    </section>}
  </>;
}

async function SimilarOffersSection({ related, similar, slug, offerCard }: {
  related: RelatedOffers; similar: Array<{ offer: PublicCategoryProduct }>; slug: string; offerCard: OfferCardRenderer;
}) {
  const { relatedComparisonOffers } = await related;
  return <>
    {similar.length > 0 && <section id="similar-offers" className="mt-12 scroll-mt-24 border-t border-ink-200 pt-8">
      <SimilarOffersRail title="Similar offers from other suppliers" titleId="similar-offers-heading">
        {similar.map(({ offer }) => offerCard(offer, slug, relatedComparisonOffers))}
      </SimilarOffersRail>
    </section>}
  </>;
}
