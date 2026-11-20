import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { SupplierCoverDeleteButton, SupplierPhotoButton } from "@/components/supplier-photo-button";
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
import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { draftLayoutOf } from "@/lib/supplier-portal/storefront-design";

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
export default async function SupplierStorefrontPreviewPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const showDraft = (await searchParams).draft === "1";
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
    {/* Premium/Pro: mẫu, tông màu và các khối nằm trong "Thiết kế trang". Gói đã hết hạn mà còn
        khối ảnh cũ thì vẫn thấy để gỡ. Gói Basic: lời mời nâng gói là nút dưới link website. */}
    {planRules.premiumStorefront && (showDraft
      ? <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="flex-1">{m.designer.cta.draftBanner}</span>
          <Link href="/supplier/portal/storefront/design" className="btn btn-soft btn-sm">{m.designer.cta.draftBack}</Link>
        </div>
      : <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-brand-200 bg-brand-50/70 p-4">
          <LayoutTemplate className="size-8 shrink-0 text-brand-700" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-900">{m.designer.cta.title}</p>
            <p className="mt-0.5 text-sm leading-6 text-ink-600">{m.designer.cta.body}</p>
          </div>
          <Link href="/supplier/portal/storefront/design" className="btn btn-primary btn-sm">{m.designer.cta.button}</Link>
        </div>)}
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
      layoutOverride={showDraft && planRules.premiumStorefront ? draftLayoutOf(supplier) : undefined}
      coverAction={<div className="absolute right-4 bottom-3 z-10 flex items-center gap-2">
        {coverUrl && <SupplierCoverDeleteButton />}
        <SupplierPhotoButton kind="cover" hasImage={!!coverUrl}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/95 text-ink-800 shadow-md transition hover:bg-white hover:text-brand-800 disabled:opacity-60" />
      </div>}
      avatarAction={<SupplierPhotoButton kind="profile" hasImage={!!avatarUrl}
        className="absolute -right-2 -bottom-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-white shadow-md ring-2 ring-white transition hover:bg-brand-800 disabled:opacity-60" />}
      verificationActions={<StorefrontVerificationActions progress={progress} />}
      nameAside={<StorefrontPlanBadge plan={planRules.plan} expiresOn={planExpiresOn} publicHref={publicHref} copy={copy.owner} />}
      ownerActions={<StorefrontUpgradeButton plan={planRules.plan} catalog={planCatalog} expiresOn={planExpiresOn} requestOpen={upgradeRequestOpen} email={user.email} copy={copy.owner} />}
      coverHint={<p className={`pointer-events-none absolute ${coverUrl ? "right-28" : "right-16"} bottom-3 z-10 rounded-lg bg-white/95 px-2.5 py-1 text-right text-[11px] leading-4 text-ink-700 shadow-sm`}>
        <span className="block font-semibold text-ink-900">{coverUrl ? copy.owner.coverChange : copy.owner.coverAdd}</span>{copy.owner.coverHint}
      </p>}
    />
  </>;
}
