"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { AplusEditor } from "@/components/products/aplus-editor";
import { aplusMessages } from "@/lib/i18n/portal/aplus";
import type { AplusModule } from "@/lib/products/aplus";
import { APLUS_COMPANY_TEMPLATE_IDS, APLUS_TEMPLATE_IDS } from "@/lib/products/aplus-templates";
import {
  saveStaffCompanyAplusAction, saveStaffProductAplusAction, translateStaffCompanyAplusAction, translateStaffProductAplusAction,
} from "./aplus-staff-actions";

/**
 * Trang CRM "Soạn A+ hộ nhà cung cấp": cùng trình soạn nhà cung cấp dùng, sửa thẳng vào nội dung A+
 * của sản phẩm hoặc A+ doanh nghiệp; bấm Lưu là đăng ngay (ghi nhật ký tên nhân viên).
 */
export function CrmAplusWorkspace({ kind, id, initial, backHref, backLabel, publicHref, visible, planNote }: {
  kind: "product" | "company"; id: string; initial: AplusModule[]; backHref: string; backLabel: string; publicHref: string | null;
  visible: boolean; planNote: string;
}) {
  const copy = aplusMessages.vi;
  const product = kind === "product";
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden="true" />{backLabel}</Link>
      {publicHref && <a href={publicHref} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:text-brand-700">Xem trang công khai<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
    </div>
    <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-950">
      <p className="font-semibold">Bạn đang soạn A+ hộ nhà cung cấp. Bấm lưu là nội dung đăng ngay{product ? " và trang sản phẩm chuyển sang hiện A+" : ""}.</p>
      <p className="text-xs text-brand-900">Chỉ dùng ảnh, số liệu nhà cung cấp gửi. Báo nhà cung cấp tạm không sửa A+ trong lúc bạn soạn, vì lần lưu sau sẽ thay lần lưu trước.</p>
    </div>
    {!visible && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{planNote}</p>}
    <AplusEditor productId={null} allowed editable initial={initial} copy={copy} standalone
      templateIds={product ? APLUS_TEMPLATE_IDS : APLUS_COMPANY_TEMPLATE_IDS}
      {...(product ? {} : { previewWidths: { desktop: 824, mobile: 318 } })}
      heading={product ? undefined : { title: copy.company.title, sub: copy.company.sub, lockedTitle: copy.company.lockedTitle, lockedBody: copy.company.lockedBody, save: copy.company.save }}
      api={product
        ? { endpoint: `/api/crm/aplus/product/${id}`, save: (list, again) => saveStaffProductAplusAction(id, list, again), translate: (list, again) => translateStaffProductAplusAction(id, list, again) }
        : { endpoint: `/api/crm/aplus/company/${id}`, save: (list, again) => saveStaffCompanyAplusAction(id, list, again), translate: (list, again) => translateStaffCompanyAplusAction(id, list, again) }} />
  </div>;
}
