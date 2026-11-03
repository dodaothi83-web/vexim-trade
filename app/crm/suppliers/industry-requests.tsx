"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CategoryRequestGroup } from "@/lib/supplier-portal/requested-category";
import { decideCategoryRequestAction } from "./industry-actions";

type Option = { slug: string; label: string };

/**
 * Hàng đợi "ngành NCC đề nghị mở", gom theo ngành và đếm số NCC.
 *
 * Vì sao gom: ba NCC cùng gõ "dừa", "cơm dừa", "dừa sấy" là một việc, không phải ba. Mỗi
 * dòng hiện số NCC, các cách gọi khác nhau và gợi ý danh mục đã có (so khớp gần đúng) để
 * nhân viên mở đúng danh mục thay vì tạo trùng.
 *
 * Nút "Đã mở" chỉ TRẢ LỜI yêu cầu — nhân viên vẫn xuất bản danh mục trong CMS trước; danh
 * mục chưa xuất bản thì nút từ chối lưu và báo lỗi rõ ràng.
 */
export function IndustryRequests({ groups, supplierNames, options }: {
  groups: CategoryRequestGroup[];
  /** Tên doanh nghiệp theo supplier id, để hiện danh sách thay vì id. */
  supplierNames: Record<string, string>;
  /** Danh mục đang xuất bản, để chọn "mở thành danh mục nào". */
  options: Option[];
}) {
  if (!groups.length) {
    return <p className="rounded-xl border border-ink-200 bg-white p-5 text-sm text-ink-600">
      Chưa có nhà cung cấp nào đề nghị mở ngành. Khi họ ghi ngành chưa có trong danh mục ở bước hồ sơ,
      yêu cầu sẽ hiện ở đây kèm số nhà cung cấp và gợi ý danh mục gần nhất.
    </p>;
  }
  return <div className="space-y-3">{groups.map((group) => <GroupCard key={group.normalized} group={group}
    supplierNames={supplierNames} options={options} />)}</div>;
}

function GroupCard({ group, supplierNames, options }: {
  group: CategoryRequestGroup;
  supplierNames: Record<string, string>;
  options: Option[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Gợi ý gần đúng (nếu có) được chọn sẵn: đó là lý do gợi ý tồn tại.
  const [slug, setSlug] = useState(group.suggestion?.category.slug ?? "");

  async function submit(event: React.FormEvent<HTMLFormElement>, decision: "opened" | "rejected") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("decision", decision);
    setBusy(true); setMessage(null);
    try {
      // Một yêu cầu đại diện cho cả nhóm: máy chủ chốt theo từng dòng chờ cùng `normalized`
      // qua id của dòng cũ nhất, nhờ vậy ba NCC cùng ngành nhận câu trả lời như nhau.
      const results = await Promise.all(group.requestIds.map((requestId) => {
        const payload = new FormData();
        payload.set("request_id", requestId);
        payload.set("decision", decision);
        payload.set("category_slug", slug);
        payload.set("note", String(form.get("note") ?? ""));
        return decideCategoryRequestAction(payload);
      }));
      const failed = results.filter((result) => !result.ok);
      setMessage(failed.length
        ? { ok: false, text: failed[0].message }
        : { ok: true, text: results[0]?.message ?? "Đã trả lời." });
      if (!failed.length) router.refresh();
    } catch {
      setMessage({ ok: false, text: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally { setBusy(false); }
  }

  return <div className="rounded-xl border border-ink-200 bg-white p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-base font-bold text-ink-900">{group.label}</p>
      <p className="text-xs font-semibold text-brand-800">{group.count} nhà cung cấp đang chờ</p>
    </div>
    {group.labels.length > 1 && <p className="mt-1 text-xs text-ink-500">Cách gọi khác: {group.labels.filter((label) => label !== group.label).join(" · ")}</p>}
    <p className="mt-1 text-xs text-ink-600">
      {group.suggestion
        ? <>Gợi ý danh mục đã có: <strong>{group.suggestion.category.name_i18n?.vi || group.suggestion.category.slug}</strong> ({group.suggestion.kind === "exact" ? "trùng tên" : "gần đúng"}).</>
        : <>Chưa có danh mục nào khớp. Tạo và xuất bản danh mục trong CMS trước khi trả lời.</>}
    </p>
    <p className="mt-2 text-xs text-ink-600">Doanh nghiệp: {group.supplierIds.map((id) => supplierNames[id] ?? id).join(" · ")}</p>

    <div className="mt-3 flex flex-wrap items-end gap-3">
      <form onSubmit={(event) => submit(event, "opened")} className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-ink-700">Mở thành danh mục
          <select className="input mt-1 max-w-xs" value={slug} onChange={(event) => setSlug(event.target.value)}>
            <option value="">Chọn danh mục đã xuất bản…</option>
            {options.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !slug} className="btn btn-primary btn-sm">Đã mở, báo nhà cung cấp</button>
      </form>
      <form onSubmit={(event) => submit(event, "rejected")} className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-ink-700">Lý do chưa mở
          <input name="note" required maxLength={1000} className="input mt-1 max-w-xs" placeholder="VD: ngành này chưa thuộc phạm vi Vexim" />
        </label>
        <button type="submit" disabled={busy} className="btn btn-soft btn-sm">Chưa mở, gửi lý do</button>
      </form>
    </div>
    {message && <p role="status" className={`mt-2 text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
    <p className="mt-2 text-[11.5px] leading-snug text-ink-500">
      Trả lời ở đây chỉ gửi email và ghi nhận ý kiến. Danh mục phải được tạo và xuất bản trong CMS; nhà cung cấp
      tự chọn phạm vi của mình sau đó, sản phẩm vẫn phải duyệt.
    </p>
  </div>;
}
