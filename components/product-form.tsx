"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { createProductAction, updateProductAction } from "@/app/actions";
import type { Category, Supplier, SupplierProduct } from "@/lib/types";
import { assignProductCategory } from "@/lib/public/category-assignment";
import { isTestOnlyProduct, supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import { Button, Field, cx } from "@/components/ui";
import { useToast } from "@/components/toast";

const INCOTERMS = ["EXW", "FOB", "CFR", "CIF", "DAP", "DDP", "FCA"];
const CURRENCIES = ["USD", "EUR", "VND"];

type FormState = Record<string, string | number | boolean>;

function init(p?: SupplierProduct | null): FormState {
  return {
    name: p?.name ?? "",
    category: p?.category ?? "",
    description: p?.description ?? "",
    description_detail: p?.description_detail ?? "",
    spec: p?.spec ?? "",
    unit: p?.unit ?? "MT",
    moq: p?.moq ?? "",
    monthly_capacity: p?.monthly_capacity ?? "",
    lead_time_days: p?.lead_time_days ?? "",
    packaging: p?.packaging ?? "",
    oem: p?.oem ?? false,
    odm: p?.odm ?? false,
    samples: p?.samples ?? false,
    ready_for_buyer: p?.ready_for_buyer ?? false,
    certifications: p?.certifications ?? "",
    export_port: p?.export_port ?? "",
    ref_price: p?.ref_price ?? "",
    price_publicly_visible: p?.price_publicly_visible ?? false,
    currency: p?.currency ?? "USD",
    price_valid_until: p?.price_valid_until ?? "",
    incoterm: p?.incoterm ?? "FOB",
    incoterm_place: p?.incoterm_place ?? "",
    payment_terms: p?.payment_terms ?? "",
  };
}

export function ProductForm({
  supplier,
  product,
  categories,
  supplierCategories = [],
  mediaState,
}: {
  supplier: Supplier;
  product?: SupplierProduct | null;
  categories: Pick<Category, "id" | "slug" | "name_i18n">[];
  supplierCategories?: string[];
  /** Trạng thái hình ảnh/tài liệu — có thì mới hiện công tắc "Sẵn sàng gửi buyer" */
  mediaState?: { ready: boolean; shareable: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => init(product));
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const v = (k: string) => String(form[k] ?? "");
  const dirty = product ? JSON.stringify(init(product)) !== JSON.stringify(form) : false;
  const assignedCategory = assignProductCategory({
    name: v("name"), spec: v("spec"), description: v("description"), category: product?.category ?? null,
  }, categories, supplierCategories);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v("name").trim()) {
      toast.push({ kind: "error", title: "Chưa nhập tên sản phẩm." });
      return;
    }
    setBusy(true);
    const payload = {
      ...form,
      category: assignedCategory?.slug ?? null,
      supplier_id: supplier.id,
      lead_time_days: v("lead_time_days") ? Number(v("lead_time_days")) : null,
      ref_price: v("ref_price") ? Number(v("ref_price")) : null,
    };
    try {
      const res = product
        ? await updateProductAction(product.id, payload)
        : await createProductAction(payload);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) {
        if (!product && res.id) router.push(`/crm/products/${res.id}/edit`);
        else router.refresh(); // Stay here and show the persisted public-price diagnostics.
      }
    } catch (err) {
      toast.push({ kind: "error", title: "Lỗi khi lưu", lines: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="card p-5">
        <h2 className="text-sm font-bold text-ink-900">1. Nhận diện sản phẩm</h2>
        <p className="mt-0.5 mb-4 text-xs text-ink-500">
          Nhà cung cấp: <strong className="text-ink-800">{supplier.name}</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tên sản phẩm" required className="sm:col-span-2 lg:col-span-3">
            <input
              className="input"
              value={v("name")}
              onChange={(e) => set("name", e.target.value)}
              placeholder="VD: Gạo Jasmine 5% tấm"
              autoFocus
            />
          </Field>
          {isTestOnlyProduct(v("name")) && <p className="text-xs font-semibold text-amber-800 sm:col-span-2 lg:col-span-3">Tên bắt đầu bằng TEST ONLY: sản phẩm sẽ không xuất hiện công khai.</p>}
          <Field label="Mô tả ngắn" className="sm:col-span-2 lg:col-span-3">
            <input
              className="input"
              value={v("description")}
              onChange={(e) => set("description", e.target.value)}
              placeholder="VD: Gạo thơm xay xát trong ngày, đánh bóng nhẹ"
            />
          </Field>
          <Field label="Mô tả chi tiết" hint="Thông tin dài hiển thị dưới trang sản phẩm; văn bản thuần, xuống dòng tùy ý." className="sm:col-span-2 lg:col-span-3">
            <textarea className="input min-h-40 resize-y" rows={7} maxLength={6000} value={v("description_detail")}
              onChange={(e) => set("description_detail", e.target.value)} placeholder="Nguồn gốc, tính năng, ứng dụng, đóng gói, lưu ý sử dụng..." />
          </Field>
          <Field label="Đơn vị tính">
            <input
              className="input"
              value={v("unit")}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="MT / cont / bộ / thùng"
            />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-bold text-ink-900">2. Quy cách &amp; năng lực</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Quy cách / specification" className="sm:col-span-2">
            <input
              className="input"
              value={v("spec")}
              onChange={(e) => set("spec", e.target.value)}
              placeholder="VD: 25kg PP bag, moisture ≤ 14%"
            />
          </Field>
          <Field label="MOQ">
            <input
              className="input"
              value={v("moq")}
              onChange={(e) => set("moq", e.target.value)}
              placeholder="VD: 100 MT / 1 cont 20ft"
            />
          </Field>
          <Field label="Công suất / tháng">
            <input
              className="input"
              value={v("monthly_capacity")}
              onChange={(e) => set("monthly_capacity", e.target.value)}
              placeholder="VD: 2.000 MT / tháng"
            />
          </Field>
          <Field label="Lead time (ngày)">
            <input
              type="number"
              min={0}
              className="input"
              value={v("lead_time_days")}
              onChange={(e) => set("lead_time_days", e.target.value)}
              placeholder="21"
            />
          </Field>
          <Field label="Cảng xuất hàng">
            <input
              className="input"
              value={v("export_port")}
              onChange={(e) => set("export_port", e.target.value)}
              placeholder="VD: Cát Lái"
            />
          </Field>
          <Field label="Bao bì / đóng gói" className="sm:col-span-2">
            <input
              className="input"
              value={v("packaging")}
              onChange={(e) => set("packaging", e.target.value)}
              placeholder="VD: Bao PP 25kg, thùng carton 5 lớp"
            />
          </Field>
          <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px] font-semibold text-ink-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#0f766e]"
                checked={Boolean(form.oem)}
                onChange={(e) => set("oem", e.target.checked)}
              />
              Nhận làm nhãn riêng / OEM
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px] font-semibold text-ink-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#0f766e]"
                checked={Boolean(form.samples)}
                onChange={(e) => set("samples", e.target.checked)}
              />
              Có thể gửi mẫu
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px] font-semibold text-ink-700">
              <input type="checkbox" className="h-4 w-4 accent-[#0f766e]" checked={Boolean(form.odm)} onChange={(e) => set("odm", e.target.checked)} /> Thiết kế & sản xuất theo yêu cầu / ODM
            </label>
            {mediaState && (
              <label
                className={cx(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold",
                  mediaState.ready
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "cursor-not-allowed border-amber-200 bg-amber-50 text-amber-900",
                )}
                title={
                  mediaState.ready
                    ? "Khách đã có ảnh/catalogue để xem"
                    : "Cần ít nhất 1 ảnh hoặc catalogue ở chế độ Chia sẻ buyer"
                }
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0f766e]"
                  disabled={!mediaState.ready && !form.ready_for_buyer}
                  checked={Boolean(form.ready_for_buyer)}
                  onChange={(e) => set("ready_for_buyer", e.target.checked)}
                />
                Sẵn sàng gửi buyer
                {!mediaState.ready && !form.ready_for_buyer && (
                  <span className="font-normal">(cần thêm ảnh/catalogue)</span>
                )}
              </label>
            )}
          </div>
          <Field label="Chứng nhận / tiêu chuẩn (tự khai; không tự tạo nhãn buyer)" hint="Nhãn chứng nhận chỉ lấy từ tệp NCC nộp, Vexim kiểm bản sao và quyết định công bố riêng tại hồ sơ NCC → Chứng nhận." className="sm:col-span-2 lg:col-span-3">
            <input
              className="input"
              value={v("certifications")}
              onChange={(e) => set("certifications", e.target.value)}
              placeholder="VD: HACCP, ISO 22000, BRC, EU code"
            />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-ink-900">3. Điều kiện thương mại tham khảo</h2>
        <p className="mt-0.5 mb-4 text-xs text-ink-500">
          Giá nhập cho chính sản phẩm này, không phải giá chung của NCC. Giá chỉ hiện khi tích công khai cho sản phẩm, NCC còn chấp thuận công khai giá (180 ngày), giá hợp lệ, và sản phẩm đã đủ điều kiện công bố; không phải báo giá RFQ.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Giá tham khảo">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={v("ref_price")}
              onChange={(e) => set("ref_price", e.target.value)}
              placeholder="620"
            />
          </Field>
          <Field label="Tiền tệ">
            <select className="input" value={v("currency")} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Giá hiệu lực đến">
            <input
              type="date"
              className="input"
              value={v("price_valid_until")}
              onChange={(e) => set("price_valid_until", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
            <label className="flex items-center gap-2 font-semibold text-ink-800"><input type="checkbox" checked={form.price_publicly_visible === true}
              onChange={(e) => set("price_publicly_visible", e.target.checked)} className="size-4 accent-brand-700" /> Cho phép công khai giá tham khảo của sản phẩm này khi đủ điều kiện</label>
            <p className="mt-2 text-xs text-ink-600">{!form.price_publicly_visible ? "Đang tắt: buyer thấy On request." : !v("ref_price") || Number(v("ref_price")) <= 0 ? "Chưa có giá lớn hơn 0." : v("price_valid_until") && v("price_valid_until") < new Date().toISOString().slice(0, 10) ? "Giá đã hết hạn." : !supplierPriceConsentCurrent(supplier) ? "NCC chưa chấp thuận hoặc chấp thuận đã quá 180 ngày: cập nhật ở hồ sơ NCC (cần xác nhận thực tế)." : !form.ready_for_buyer ? "Giá đã chọn công khai nhưng sản phẩm chưa sẵn sàng cho buyer; cần ảnh/catalogue được chia sẻ và duyệt đăng." : "Đã chọn công khai giá; còn phụ thuộc trạng thái duyệt, NCC và danh mục xuất bản."}</p>
          </div>
          <Field label="Incoterm">
            <select className="input" value={v("incoterm")} onChange={(e) => set("incoterm", e.target.value)}>
              {INCOTERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Địa điểm Incoterm" hint="VD: FOB Cát Lái, Incoterms 2020">
            <input
              className="input"
              value={v("incoterm_place")}
              onChange={(e) => set("incoterm_place", e.target.value)}
              placeholder="Cát Lái"
            />
          </Field>
          <Field label="Điều khoản thanh toán tham khảo">
            <input
              className="input"
              value={v("payment_terms")}
              onChange={(e) => set("payment_terms", e.target.value)}
              placeholder="30% cọc, 70% khi có B/L"
            />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-ink-200 bg-white/95 px-4 py-3 shadow-card backdrop-blur">
        {product && dirty && (
          <span className="mr-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Chưa lưu thay đổi
          </span>
        )}
        {product && (
          <Button type="button" variant="ghost" onClick={() => setForm(init(product))} disabled={!dirty || busy}>
            Hoàn tác
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {product ? "Lưu hồ sơ sản phẩm" : "Thêm sản phẩm"}
        </Button>
      </div>
    </form>
  );
}
