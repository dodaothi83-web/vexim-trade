"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductAttributeField } from "@/lib/types";
import { mergeAttributeFields } from "@/lib/product-attributes";
import { fill } from "@/lib/i18n/format";
import { productEditorMessages, type ProductEditorMessages } from "@/lib/i18n/portal/product-editor";

/**
 * Thông số theo nhóm hàng dành cho nhà cung cấp.
 *
 * Chỉ hiện các thông số có cấu trúc do Vexim khai trong CMS (ví dụ Grade với W320,
 * W180) - những giá trị máy đọc được, dùng cho lọc và đối chiếu quy cách. Mô tả dài
 * như độ ẩm, tỷ lệ hạt vỡ đã có ô "Quy cách / tiêu chuẩn" phía dưới, nên không lặp
 * lại ở đây.
 *
 * Hiển thị gọn: không khung, không tiêu đề/ghi chú, không nút "Thêm" giá trị mới
 * (chủ sàn yêu cầu 2026-11-22 vì NCC không hiểu cách dùng). Danh mục chỉ có 1 thông
 * số thì nhãn là "Phân loại sản phẩm"; lựa chọn hiện đúng chữ Vexim nhập trong CRM
 * (không dịch trong code — chủ sàn yêu cầu 2026-11-22).
 *
 * Thông số NCC đã tự thêm trước đây vẫn được giữ: pool cũ gửi lại nguyên vẹn trong
 * ô ẩn `attribute_pool` để server không làm mất.
 */
export function SupplierAttributeInputs({ officialFields, supplierFields = [], values, disabled = false, onCommit,
  copy = productEditorMessages.vi.shared.attributes, columns = 1 }: {
  officialFields: ProductAttributeField[];
  supplierFields?: ProductAttributeField[];
  values?: Record<string, unknown> | null;
  disabled?: boolean;
  /**
   * Báo lại pool + giá trị đang chọn mỗi khi thay đổi. Ô attribute:* do state React
   * quản nên giá trị DOM cập nhật SAU sự kiện change; form cha cần được báo trực tiếp
   * để cờ "có thay đổi" không bỏ sót.
   */
  onCommit?: (poolJson: string, draft: Record<string, string>) => void;
  /** Nhãn hiển thị. CRM không truyền nên dùng bản tiếng Việt. */
  copy?: ProductEditorMessages["shared"]["attributes"];
  /** 2 = xếp lưới 2 cột (danh mục có nhiều ô phân loại, khối nằm riêng một hàng). */
  columns?: 1 | 2;
}) {
  const [pool] = useState<ProductAttributeField[]>(supplierFields);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(
    Object.entries(values ?? {}).filter(([, value]) => typeof value === "string") as [string, string][]));

  const fields = useMemo(() => mergeAttributeFields(officialFields, pool), [officialFields, pool]);
  const poolJson = JSON.stringify(pool);
  useEffect(() => { onCommit?.(poolJson, draft); }, [poolJson, draft, onCommit]);
  const visible = fields.filter((field) => !field.showWhen || draft[field.showWhen.key] === field.showWhen.value);
  const hiddenWithValues = fields.filter((field) => field.showWhen && draft[field.showWhen.key] !== field.showWhen.value && draft[field.key]);
  // Danh mục chưa có thông số nào: không hiện gì.
  if (!fields.length) return null;

  function set(key: string, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  const labelFor = (field: ProductAttributeField) =>
    visible.length === 1 ? copy.classification : field.label;

  return <div className={columns === 2 ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
    {visible.map((field) => <div key={field.key} className="min-w-0">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-700" htmlFor={`attribute-${field.key}`}>
        {labelFor(field)}
      </label>
      {field.type === "select"
        ? <select id={`attribute-${field.key}`} className="input" name={`attribute:${field.key}`} disabled={disabled}
          value={draft[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)}>
          <option value="">{copy.none}</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        : <input id={`attribute-${field.key}`} className="input" name={`attribute:${field.key}`} disabled={disabled}
          maxLength={200} placeholder={copy.valuePlaceholder} value={draft[field.key] ?? ""}
          onChange={(event) => set(field.key, event.target.value)} />}
    </div>)}

    {hiddenWithValues.map((field) => <div key={field.key} className="col-span-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
      <p>{fill(copy.hiddenWarn, { label: field.label, value: draft[field.key] })}</p>
      <button type="button" disabled={disabled} className="mt-1 min-h-10 font-semibold text-brand-800 disabled:opacity-50" onClick={() => set(field.key, "")}>{fill(copy.clearValue, { label: field.label })}</button>
    </div>)}

    <input type="hidden" name="attribute_pool" value={poolJson} />
  </div>;
}
