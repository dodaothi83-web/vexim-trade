"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { aplusImagePaths, aplusModuleText, type AplusModule } from "@/lib/products/aplus";
import { removeCompanyAplusModuleAction } from "./company-aplus-actions";

const TYPE_LABEL: Record<AplusModule["type"], string> = {
  hero: "Banner có chữ", highlights: "Điểm nổi bật", steps: "Quy trình theo bước", packing: "Đóng gói và container", faq: "Câu hỏi thường gặp",
  image: "Ảnh lớn", image_text: "Ảnh kèm chữ", gallery: "Lưới ảnh", text: "Đoạn chữ", video: "Video",
};

/**
 * A+ doanh nghiệp nhà cung cấp đã lưu (hiện ngay dưới About trên trang công khai khi gói còn quyền).
 * Nhân viên thấy bản tiếng Anh người mua đọc và bản tiếng Việt nhà cung cấp viết, gỡ được khối vi phạm.
 */
export function CrmCompanyAplusReview({ supplierId, modules, visible, canManage }: { supplierId: string; modules: AplusModule[]; visible: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Soạn A+ hộ nhà cung cấp (dịch vụ Vexim): mở trang soạn riêng, lưu là đăng ngay.
  const editLink = canManage && <Link href={`/crm/suppliers/${supplierId}/aplus`} className="btn btn-primary btn-sm shrink-0">{modules.length ? "Sửa content A+" : "Soạn content A+"}</Link>;
  // A+ chỉ có ở gói Premium/Pro: gói Basic chưa có nội dung thì không hiện khối này.
  if (!modules.length) return canManage && visible ? <section id="company-aplus" className="card mb-4 flex flex-wrap items-center gap-3 p-5" aria-label="Nội dung A+ doanh nghiệp">
    <div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-ink-900">Nội dung A+ doanh nghiệp</h2>
      <p className="mt-0.5 text-xs text-ink-500">Chưa có content A+ doanh nghiệp. Nhân viên hỗ trợ soạn cho doanh nghiệp và đăng.</p></div>
    {editLink}
  </section> : null;
  const img = (path: string) => `/api/crm/aplus?path=${encodeURIComponent(path)}`;
  return <section id="company-aplus" className="card mb-4 scroll-mt-24 p-5" aria-label="Nội dung A+ doanh nghiệp">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-ink-900">Nội dung A+ doanh nghiệp ({modules.length} khối)</h2>{editLink}</div>
    <p className="mt-0.5 text-xs text-ink-500">{visible ? "Đang hiện dưới mục About trên trang nhà cung cấp." : "Gói không còn trang cao cấp: đang ẩn với người mua."} Gỡ khối có liên hệ trực tiếp hoặc nội dung sai.</p>
    <ul className="mt-3 space-y-2">
      {modules.map((m, index) => {
        const text = aplusModuleText(m).filter(Boolean).join(" · ");
        const source = (m.vi ?? []).filter(Boolean).join(" · ");
        return <li key={m.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-ink-200 p-2.5">
          <div className="flex shrink-0 gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {aplusImagePaths([m]).slice(0, 4).map((p) => <img key={p} src={img(p)} alt="" className="h-14 w-20 rounded object-cover ring-1 ring-ink-200" />)}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-ink-900">{index + 1}. {TYPE_LABEL[m.type]}</p>
            {text && <p className="mt-0.5 line-clamp-3 break-words text-ink-600">{text}</p>}
            {source && source !== text && <p className="mt-0.5 line-clamp-2 break-words text-ink-400">Bản tiếng Việt: {source}</p>}
          </div>
          {canManage && <button type="button" disabled={!!busy} className="btn btn-soft btn-sm" onClick={async () => {
            if (!window.confirm("Gỡ khối này khỏi trang nhà cung cấp?")) return;
            setBusy(m.id); setMessage(null);
            const result = await removeCompanyAplusModuleAction(supplierId, m.id);
            setMessage({ ok: result.ok, text: result.message }); setBusy(null);
            if (result.ok) router.refresh();
          }}>{busy === m.id ? "Đang gỡ…" : "Gỡ khối"}</button>}
        </li>;
      })}
    </ul>
    {message && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </section>;
}
