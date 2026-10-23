import Link from "next/link";
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

export const dynamic = "force-dynamic";
export const metadata = { title: "Trang của tôi | Vexim Trade", robots: { index: false, follow: false } };

const CHECKS = [[1, "Documents checked"], [2, "Factory visit"], [3, "Delivery history"]] as const;

/**
 * “Trang của tôi”: đúng giao diện buyer nhìn thấy, dựng từ cùng component với trang công
 * khai nên hai nơi không thể lệch nhau.
 *
 * Khác trang công khai ở ba điểm: có thanh xem trước, nút + để nhà cung cấp tự thêm ảnh
 * bìa/ảnh đại diện, và nút gửi RFQ được vô hiệu hoá để họ không tự gửi yêu cầu cho mình.
 * Không hiện những mục buyer không thấy (giấy tờ nội bộ, email, điện thoại, hồ sơ chờ duyệt).
 */
export default async function SupplierStorefrontPreviewPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, store, review, reviews, user } = access;

  // Thiếu migration thì báo ngay trên trang, không để cả cổng trắng: nhà cung cấp vẫn
  // vào được các mục khác và biết đây là lỗi dữ liệu chứ không phải hồ sơ của mình.
  let loaded: { card: Awaited<ReturnType<typeof getSupplierStorefront>>; categories: Awaited<ReturnType<typeof store.listCategories>>;
    certificates: ReturnType<typeof publicSupplierCertificates>;
    progress: ReturnType<typeof buildVerificationProgress> } | null = null;
  try {
    const [card, categories, rawCertificates, supplierMedia, submissions, requests, l1Media] = await Promise.all([
      getSupplierStorefront(supplier),
      store.listCategories({ publishedOnly: true }),
      store.listCertificates(supplier.id).catch(() => []),
      store.listMedia("supplier", supplier.id).catch(() => []),
      store.listSubmissions(supplier.id).catch(() => []),
      store.listSupplierVerificationRequests(supplier.id).catch(() => []),
      review ? store.listMedia("verification", review.id).catch(() => []) : Promise.resolve([]),
    ]);
    // Đếm bằng chứng đã nộp để nút ở khối dưới nói đúng “còn mấy ảnh/chứng từ”.
    const submissionItems = Object.fromEntries(await Promise.all(submissions.map(async (submission) =>
      [submission.id, await store.listSubmissionItems(submission.id).catch(() => [])] as const)));
    loaded = {
      card,
      categories: categories.filter((c) => c.status === "published" && c.is_published),
      certificates: publicSupplierCertificates(supplier.id, rawCertificates, supplierMedia),
      progress: buildVerificationProgress({
        supplierId: supplier.id, reviews, submissions, submissionItems, requests, documents: l1Media, userId: user.id,
      }),
    };
  } catch (error) {
    console.error(`[supplier-portal] chưa dựng được Trang của tôi. ${migrationHint(error) ?? ""}`.trim(), error);
  }
  if (!loaded) return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Trang của tôi" sub="Đúng nội dung buyer nhìn thấy trên hồ sơ công khai." />
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      <p className="font-bold">Chưa dựng được bản xem trước</p>
      <p className="mt-1 leading-6">Hệ thống chưa đọc được dữ liệu hồ sơ. Hồ sơ của bạn không bị thay đổi. Thử tải lại trang; nếu vẫn lỗi, báo nhân viên Vexim.</p>
    </div>
  </>;
  const { card, categories, certificates, progress } = loaded;

  const published = supplier.status === "published";
  const synthetic = isSyntheticSupplier(supplier);
  const steps = card.approved_verification_steps;
  const approved = CHECKS.filter(([level]) => steps.includes(level)).map(([, label]) => label);
  const missing = CHECKS.filter(([level]) => !steps.includes(level)).map(([, label]) => label);
  const coverUrl = supplier.cover_image ? `/public-media/${supplier.cover_image.replace(/^\/+/, "")}` : null;
  const avatarUrl = supplier.profile_image ? `/public-media/${supplier.profile_image.replace(/^\/+/, "")}` : null;

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="Trang của tôi"
      sub="Đúng nội dung buyer nhìn thấy trên hồ sơ công khai." />
    <section aria-label="Preview status" className="rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] leading-5 text-ink-700">
          <b className="text-ink-900">Preview.</b> This is exactly what buyers see on your public page. Only you can see this screen.
        </p>
        {published
          ? <Link href={`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-brand-300 bg-white px-3 py-1 text-[11px] font-bold text-brand-800 hover:bg-brand-50">
            Profile is live · Open public page
          </Link>
          : <span className="inline-flex items-center rounded-full bg-ink-100 px-3 py-1 text-[11px] font-bold text-ink-700">
            Not published yet · buyers cannot open this page
          </span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-brand-200/70 pt-2.5 text-[11.5px] text-ink-700">
        <span className="font-bold text-ink-900">Verification: {approved.length} of 3 checks approved</span>
        <span>Approved: {approved.length ? approved.join(", ") : "none yet"}</span>
        <span className="text-ink-500">Not reviewed yet: {missing.length ? missing.join(", ") : "none, all three checks are approved"}</span>
      </div>
    </section>

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
      coverAction={<SupplierPhotoButton kind="cover" hasImage={!!coverUrl}
        className="absolute right-4 bottom-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/95 text-ink-800 shadow-md transition hover:bg-white hover:text-brand-800 disabled:opacity-60" />}
      avatarAction={<SupplierPhotoButton kind="profile" hasImage={!!avatarUrl}
        className="absolute -right-2 -bottom-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-white shadow-md ring-2 ring-white transition hover:bg-brand-800 disabled:opacity-60" />}
      verificationActions={<StorefrontVerificationActions progress={progress} />}
    />
  </>;
}
