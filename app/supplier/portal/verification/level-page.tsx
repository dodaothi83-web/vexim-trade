import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";

import { supplierLevelAccess } from "@/lib/supplier-portal/submission-access";
import { getOrCreateSubmission, loadSubmissionBundle } from "@/lib/verification-submission-service";
import { buildPortalSubmission, exportSpecs, partnerSpecs, photoSpecs } from "@/lib/supplier-portal/submission-view";
import { l2ScopeForSupplier } from "@/lib/l2-scope";
import { migrationHint } from "@/lib/db/migration-hints";
import { getPortalMessages } from "@/lib/i18n/server";
import type { VerificationMessages } from "@/lib/i18n/portal/verification";
import { LevelTabs } from "./level-tabs";
import { VerificationSubmissionPanel } from "./verification-panel";

/**
 * Khung dùng chung cho HAI trang xác minh tự gửi:
 *  - `/supplier/portal/verification/factory` - L2, 9 ảnh nhà máy
 *  - `/supplier/portal/verification/export`  - L3, chứng từ lịch sử xuất khẩu
 *
 * Mỗi trang chỉ tải hồ sơ của đúng cấp mình. Không gộp hai cấp vào một trang để menu,
 * tiến độ và hành động nộp của từng cấp không lẫn nhau. Dải tab ba bước dùng chung với
 * trang L1 (`level-tabs.tsx`) để ba cấp xác minh đọc như một quy trình. Bước 1 chỉ nộp
 * giấy tờ do nhân viên đối chiếu, nên không có nút nộp trong khung này.
 *
 * Bố cục lấy nhịp từ trang sản phẩm của sàn TMĐT: tab chuyển cấp ở trên, dải tổng quan
 * (trạng thái + tiến độ), lưới thẻ bằng chứng có ảnh thu nhỏ, và cột tóm tắt dính bên
 * phải với nút nộp. L2 giữ luồng AI; chứng từ L3 do nhân viên đối chiếu.
 */

/** Nội dung của một cấp: ba câu giới thiệu + 5 lợi ích + 3 bước, tất cả đọc từ từ điển. */
function levelCopy(level: 2 | 3, partner: boolean, copy: VerificationMessages["level"]) {
  if (level === 3) {
    return { title: copy.exportTitle, eyebrow: copy.eyebrowL3, description: copy.exportDescription,
      benefits: copy.exportBenefits, guideTitles: copy.exportGuideTitles, guideBodies: copy.exportGuideBodies };
  }
  if (partner) {
    return { title: copy.partnerTitle, eyebrow: copy.eyebrowL2, description: copy.partnerDescription,
      benefits: copy.partnerBenefits, guideTitles: copy.partnerGuideTitles, guideBodies: copy.partnerGuideBodies };
  }
  return { title: copy.factoryTitle, eyebrow: copy.eyebrowL2, description: copy.factoryDescription,
    benefits: copy.factoryBenefits, guideTitles: copy.factoryGuideTitles, guideBodies: copy.factoryGuideBodies };
}

export async function VerificationLevelPage({ level }: { level: 2 | 3 }) {
  const access = await supplierLevelAccess(level);
  if (!access) redirect("/login");
  const { store, supplier, user } = access;
  const scope = level === 2 ? l2ScopeForSupplier(supplier.supplier_type) : null;
  const { locale, intl, m } = await getPortalMessages();
  const partner = level === 2 && scope === "partner_contract";
  const copy = levelCopy(level, partner, m.verification.level);
  const specs = level === 2 ? partner ? partnerSpecs() : photoSpecs() : exportSpecs();
  if (level === 2 && !scope) return <>
    <PageHeader eyebrow={m.verification.level.eyebrowL2} title={m.verification.level.unknownTypeTitle} />
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      {m.verification.level.unknownTypeBody}
    </div>
  </>;

  let view: Awaited<ReturnType<typeof buildPortalSubmission>> | null = null;
  try {
    const submission = await getOrCreateSubmission(store, { supplierId: supplier.id, level, userId: user.id, supplierType: supplier.supplier_type });
    const bundle = await loadSubmissionBundle(store, submission.id);
    view = bundle ? buildPortalSubmission(bundle) : null;
  } catch (error) {
    // Bảng hồ sơ tự gửi chưa có trên môi trường này: báo cho NCC một câu rõ ràng
    // thay vì để trang trắng. Người vận hành đọc log để biết file migration cần chạy.
    console.error(`[supplier-portal] could not open the self-submission file. ${migrationHint(error) ?? ""}`.trim(), error);
    return <>
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} />
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="text-base font-bold">{m.verification.level.loadErrorTitle}</h2>
        <p className="mt-2">{m.verification.level.loadErrorBody}</p>
        <p className="mt-2">{m.verification.level.loadErrorSecond}</p>
        <Link href="/supplier/portal" className="mt-3 inline-block font-semibold text-amber-900 underline">{m.verification.level.backToDashboard}</Link>
      </div>
    </>;
  }

  return <>
    <PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      sub={copy.description}
      actions={<Link href="/supplier/portal" className="btn btn-ghost btn-sm">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{m.verification.level.overview}
      </Link>}
    />

    <LevelTabs current={level} partner={supplier.supplier_type === "trading"} copy={m.verification.tabs} />

    <ol className="mt-4 grid gap-2.5 sm:grid-cols-3" aria-label={m.verification.level.stepsAria}>
      {copy.guideTitles.map((title, index) => <li key={title} className="flex gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 shadow-sm">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-800 ring-1 ring-brand-200">{index + 1}</span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-bold text-ink-900">{title}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{copy.guideBodies[index]}</span>
        </span>
      </li>)}
    </ol>

    {view
      ? <VerificationSubmissionPanel view={view} specs={specs} benefits={copy.benefits}
        copy={m.verification.panel} benefitsTitle={m.verification.benefits.title}
        intl={intl} lang={locale} />
      : <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {m.verification.level.unavailable}
      </div>}

  </>;
}
