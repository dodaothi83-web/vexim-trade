import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SupplierPhotoButton } from "@/components/supplier-photo-button";
import { SupplierStorefront } from "@/components/public/supplier-storefront";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { getSupplierStorefront } from "@/lib/public/catalog";
import { publicSupplierCertificates } from "@/lib/public/certificates";
import { migrationHint } from "@/lib/db/migration-hints";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { buildVerificationProgress } from "@/lib/supplier-portal/verification-progress";
import { StorefrontVerificationActions } from "../verification-progress";
import { getPortalMessages } from "@/lib/i18n/server";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { formatCertificateDate } from "@/lib/certificate-supplier-copy";
import { hasOpenServiceRequest } from "@/lib/supplier-services";
import { StorefrontPlanBadge, StorefrontUpgradeButton } from "@/components/supplier-portal/storefront-owner";
import { normalizeShowcaseBlocks } from "@/lib/supplier-showcase";
import { ShowcaseEditor } from "./showcase-editor";
import { StorefrontDesignHub } from "./design-hub";
import { COMPANY_APLUS_ID, readAplusModules } from "@/lib/products/aplus";
import { normalizeStorefrontTheme } from "@/lib/storefront-theme";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.storefront.metaTitle, robots: { index: false, follow: false } };
}

/**
 * “Trang của tôi”: đúng giao diện buyer nhìn thấy, dựng từ cùng component với trang công
 * khai nên hai nơi không thể lệch nhau.
 *
 * Khác trang công khai ở các điểm: badge gói + nút "Xem trang" cạnh tên, nút nâng cấp gói
 * dưới link website, nút + (kèm gợi ý kích thước) để nhà cung cấp tự thêm ảnh bìa/ảnh đại
 * diện, và nút gửi RFQ được vô hiệu hoá để họ không tự gửi yêu cầu cho mình.
 * Không hiện những mục buyer không thấy (giấy tờ nội bộ, email, điện thoại, hồ sơ chờ duyệt).
 */
export default async function SupplierStorefrontPreviewPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, store, review, reviews, user } = access;
  const { m, locale } = await getPortalMessages();
  const copy = m.storefront;

  // Thiếu migration thì báo ngay trên trang, không để cả cổng trắng: nhà cung cấp vẫn
  // vào được các mục khác và biết đây là lỗi dữ liệu chứ không phải hồ sơ của mình.
  let loaded: { card: Awaited<ReturnType<typeof getSupplierStorefront>>; categories: Awaited<ReturnType<typeof store.listCategories>>;
    certificates: ReturnType<typeof publicSupplierCertificates>;
    progress: ReturnType<typeof buildVerificationProgress>; upgradeRequestOpen: boolean } | null = null;
  try {
    const [card, categories, rawCertificates, supplierMedia, submissions, requests, l1Media, serviceRequests] = await Promise.all([
      getSupplierStorefront(supplier),
      store.listCategories({ publishedOnly: true }),
      store.listCertificates(supplier.id).catch(() => []),
      store.listMedia("supplier", supplier.id).catch(() => []),
      store.listSubmissions(supplier.id).catch(() => []),
      store.listSupplierVerificationRequests(supplier.id).catch(() => []),
      review ? store.listMedia("verification", review.id).catch(() => []) : Promise.resolve([]),
      // Bảng yêu cầu dịch vụ chưa có (chưa migrate) thì coi như chưa có yêu cầu nâng gói.
      store.listSupplierServiceRequests({ supplierId: supplier.id, limit: 50 }).catch(() => []),
    ]);
    // Đếm bằng chứng đã nộp để nút ở khối dưới nói đúng “còn mấy ảnh/chứng từ”.
    const submissionItems = Object.fromEntries(await Promise.all(submissions.map(async (submission) =>
      [submission.id, await store.listSubmissionItems(submission.id).catch(() => [])] as const)));
    loaded = {
      card,
      categories: categories.filter((c) => c.status === "published" && c.is_published),
      certificates: publicSupplierCertificates(supplier.id, rawCertificates, supplierMedia),
      progress: buildVerificationProgress({
        supplierId: supplier.id, supplierType: supplier.supplier_type, reviews, submissions, submissionItems, requests, documents: l1Media, userId: user.id,
      }),
      upgradeRequestOpen: hasOpenServiceRequest(serviceRequests.filter((r) => r.supplier_id === supplier.id), "plan_upgrade"),
    };
  } catch (error) {
    console.error(`[supplier-portal] could not build the storefront preview. ${migrationHint(error) ?? ""}`.trim(), error);
  }
  if (!loaded) return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      <p className="font-bold">{copy.loadError.title}</p>
      <p className="mt-1 leading-6">{copy.loadError.body}</p>
    </div>
  </>;
  const { card, categories, certificates, progress, upgradeRequestOpen } = loaded;

  const published = supplier.status === "published";
  const synthetic = isSyntheticSupplier(supplier);
  const planCatalog = await readPlanCatalog();
  const planRules = supplierPlanRules(supplier, new Date(), planCatalog);
  // Hạn gói hiển thị theo ngày Việt Nam; CRM lưu 23:59:59 +07:00 của ngày hết hạn.
  const planExpiresOn = planRules.plan !== "basic" && supplier.plan_expires_at && Number.isFinite(Date.parse(supplier.plan_expires_at))
    ? formatCertificateDate(new Date(Date.parse(supplier.plan_expires_at) + 7 * 3_600_000).toISOString().slice(0, 10), locale === "en" ? "en" : "vi")
    : null;
  const publicHref = published ? `/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}` : null;
  const coverUrl = supplier.cover_image ? `/public-media/${supplier.cover_image.replace(/^\/+/, "")}` : null;
  const avatarUrl = supplier.profile_image ? `/public-media/${supplier.profile_image.replace(/^\/+/, "")}` : null;

  // Ảnh khối nội dung trong cổng đi qua bản xem trước có đăng nhập, vì trang công khai chỉ
  // phục vụ khi hồ sơ đã đăng và gói còn hiệu lực.
  const showcasePreviewUrl = (path: string) => `/api/supplier-portal/showcase?path=${encodeURIComponent(path)}`;
  const showcaseBlocks = normalizeShowcaseBlocks(supplier.showcase_blocks)
    .map((block) => ({ id: block.id, title: block.title, body: block.body, url: showcasePreviewUrl(block.image_path) }));

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
    {/* Gói cao cấp: khu Thiết kế trang (đầu trang, sản phẩm ghim, A+ doanh nghiệp thay khối Showcase cũ).
        Gói Basic không có thẻ khoá ở đây; lời mời nâng gói là nút dưới link website. */}
    {planRules.premiumStorefront && <StorefrontDesignHub theme={normalizeStorefrontTheme(supplier.storefront_theme)} copy={m.showcase.theme}
      videoErrors={m.aplus.errors}
      aplusCount={readAplusModules(supplier.company_aplus, { supplierId: supplier.id, productId: COMPANY_APLUS_ID }).length}
      // Chỉ ghim được sản phẩm đang hiện cho người mua trên trang (cùng danh sách với khu sản phẩm).
      products={card.main_products.map((p) => {
        const form = card.form_product_cards?.[p.id];
        const image = form ? form.cardImagePath ?? form.imagePaths[0] : card.product_card_image_paths?.[p.id] ?? card.product_image_paths[p.id];
        return { id: p.id, name: form?.name || p.name_i18n?.en || p.name, imageUrl: image ? `/public-media/${image.replace(/^\/+/, "")}` : null };
      })} />}
    {!planRules.premiumStorefront && showcaseBlocks.length > 0 &&
      <ShowcaseEditor blocks={showcaseBlocks} enabled={false} copy={m.showcase} />}

    <SupplierStorefront
      supplier={card}
      certificates={certificates}
      categories={categories}
      coverUrl={coverUrl}
      avatarUrl={avatarUrl}
      synthetic={synthetic}
      productLinks={published}
      rfqActions={false}
      nameTag="h2"
      showcaseImageUrl={showcasePreviewUrl}
      companyAplusImageUrl={(path) => `/api/supplier-portal/company-aplus?path=${encodeURIComponent(path)}`}
      coverAction={<SupplierPhotoButton kind="cover" hasImage={!!coverUrl}
        className="absolute right-4 bottom-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/95 text-ink-800 shadow-md transition hover:bg-white hover:text-brand-800 disabled:opacity-60" />}
      avatarAction={<SupplierPhotoButton kind="profile" hasImage={!!avatarUrl}
        className="absolute -right-2 -bottom-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-white shadow-md ring-2 ring-white transition hover:bg-brand-800 disabled:opacity-60" />}
      verificationActions={<StorefrontVerificationActions progress={progress} />}
      nameAside={<StorefrontPlanBadge plan={planRules.plan} expiresOn={planExpiresOn} publicHref={publicHref} copy={copy.owner} />}
      ownerActions={<StorefrontUpgradeButton plan={planRules.plan} catalog={planCatalog} expiresOn={planExpiresOn} requestOpen={upgradeRequestOpen} email={user.email} copy={copy.owner} />}
      avatarHint={<p className="mx-auto mt-2 w-32 text-center text-[11px] leading-4 opacity-80">
        <span className="block font-semibold">{avatarUrl ? copy.owner.avatarChange : copy.owner.avatarAdd}</span>{copy.owner.avatarHint}
      </p>}
    />
  </>;
}
