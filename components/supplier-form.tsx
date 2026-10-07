"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { createSupplierAction, updateSupplierAction } from "@/app/actions";
import { SUPPLIER_ROLES, SUPPLIER_STATUSES } from "@/lib/supplier";
import type { Supplier } from "@/lib/types";
import { Button, Field } from "@/components/ui";
import { useToast } from "@/components/toast";

type FormState = Record<string, string | number>;

function init(s?: Supplier | null): FormState {
  return {
    name: s?.name ?? "",
    trade_name: s?.trade_name ?? "",
    role: s?.role ?? "manufacturer",
    status: s?.status ?? "new",
    country: s?.country ?? "Việt Nam",
    province: s?.province ?? "",
    address: s?.address ?? "",
    website: s?.website ?? "",
    tax_id: s?.tax_id ?? "",
    markets: s?.markets ?? "",
    products: s?.products ?? "",
    contact_name: s?.contact_name ?? "",
    contact_title: s?.contact_title ?? "",
    email: s?.email ?? "",
    phone: s?.phone ?? "",
    zalo: s?.zalo ?? "",
    payment_terms: s?.payment_terms ?? "",
    lead_time_days: s?.lead_time_days ?? "",
    rating: s?.rating ?? 4,
    notes: s?.notes ?? "",
  };
}

export function SupplierForm({ supplier }: { supplier?: Supplier | null }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => init(supplier));
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const v = (k: string) => String(form[k] ?? "");
  const dirty = supplier ? JSON.stringify(init(supplier)) !== JSON.stringify(form) : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v("name").trim()) {
      toast.push({ kind: "error", title: "Chưa nhập tên pháp nhân nhà cung cấp." });
      return;
    }
    setBusy(true);
    const payload = { ...form, lead_time_days: v("lead_time_days") ? Number(v("lead_time_days")) : null };
    try {
      const res = supplier
        ? await updateSupplierAction(supplier.id, payload)
        : await createSupplierAction(payload);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) {
        if (supplier) router.refresh();
        else if (res.id) router.push(`/suppliers/${res.id}`);
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
        <h2 className="text-sm font-bold text-ink-900">1. Doanh nghiệp</h2>
        <p className="mt-0.5 mb-4 text-xs text-ink-500">
          Hồ sơ gọn để NCC dễ tham gia — giấy tờ xác minh có thể bổ sung sau, trước khi đưa vào danh sách đề xuất.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tên pháp nhân" required className="sm:col-span-2">
            <input
              className="input"
              value={v("name")}
              onChange={(e) => set("name", e.target.value)}
              placeholder="VD: CTCP Nông sản Mekong Delta"
              autoFocus
            />
          </Field>
          <Field label="Tên thương mại">
            <input
              className="input"
              value={v("trade_name")}
              onChange={(e) => set("trade_name", e.target.value)}
              placeholder="Nếu khác tên pháp nhân"
            />
          </Field>
          <Field label="Vai trò">
            <select className="input" value={v("role")} onChange={(e) => set("role", e.target.value)}>
              {SUPPLIER_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái hồ sơ" hint="Xác minh sâu trước khi gửi cơ hội / đề xuất">
            <select className="input" value={v("status")} onChange={(e) => set("status", e.target.value)}>
              {SUPPLIER_STATUSES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quốc gia">
            <input
              className="input"
              value={v("country")}
              onChange={(e) => set("country", e.target.value)}
              placeholder="VD: Việt Nam"
            />
          </Field>
          <Field label="Tỉnh / Thành">
            <input
              className="input"
              value={v("province")}
              onChange={(e) => set("province", e.target.value)}
              placeholder="VD: Cần Thơ"
            />
          </Field>
          <Field label="Địa chỉ nhà máy / văn phòng">
            <input
              className="input"
              value={v("address")}
              onChange={(e) => set("address", e.target.value)}
              placeholder="KCN / xã / huyện"
            />
          </Field>
          <Field label="Website / hồ sơ giới thiệu">
            <input
              className="input"
              value={v("website")}
              onChange={(e) => set("website", e.target.value)}
              placeholder="ten-mien.vn"
            />
          </Field>
          <Field label="Mã số thuế">
            <input
              className="input"
              value={v("tax_id")}
              onChange={(e) => set("tax_id", e.target.value)}
              placeholder="1800123456"
            />
          </Field>
          <Field
            label="Thị trường phục vụ / muốn bán"
            className="sm:col-span-2"
            hint="VD: EU, Nhật Bản, Trung Đông"
          >
            <input
              className="input"
              value={v("markets")}
              onChange={(e) => set("markets", e.target.value)}
              placeholder="EU, Nhật Bản, Trung Đông..."
            />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-bold text-ink-900">2. Người liên hệ</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Người phụ trách">
            <input
              className="input"
              value={v("contact_name")}
              onChange={(e) => set("contact_name", e.target.value)}
              placeholder="VD: Trần Văn Hùng"
            />
          </Field>
          <Field label="Chức vụ">
            <input
              className="input"
              value={v("contact_title")}
              onChange={(e) => set("contact_title", e.target.value)}
              placeholder="VD: Giám đốc kinh doanh"
            />
          </Field>
          <Field label="Email công việc" hint="Email nhận thông báo đơn hàng (tiếng Việt)">
            <input
              type="email"
              className="input"
              value={v("email")}
              onChange={(e) => set("email", e.target.value)}
              placeholder="sales@xuong.vn"
            />
          </Field>
          <Field label="Điện thoại / WhatsApp">
            <input
              className="input"
              value={v("phone")}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+84 9xx xxx xxx"
            />
          </Field>
          <Field label="Zalo">
            <input
              className="input"
              value={v("zalo")}
              onChange={(e) => set("zalo", e.target.value)}
              placeholder="09xxxxxxxx"
            />
          </Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-ink-900">3. Năng lực &amp; điều kiện</h2>
        <p className="mt-0.5 mb-4 text-xs text-ink-500">
          Hồ sơ sản phẩm chi tiết (MOQ, chứng nhận, giá tham khảo...) tạo ở trang chi tiết NCC sau khi lưu.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Ngành hàng chính (tóm tắt)" className="sm:col-span-2 lg:col-span-3">
            <input
              className="input"
              value={v("products")}
              onChange={(e) => set("products", e.target.value)}
              placeholder="VD: Gạo 5% tấm, gạo Jasmine, gạo ST25"
            />
          </Field>
          <Field label="Điều khoản thanh toán">
            <input
              className="input"
              value={v("payment_terms")}
              onChange={(e) => set("payment_terms", e.target.value)}
              placeholder="30% cọc, 70% trước khi giao"
            />
          </Field>
          <Field label="Thời gian giao (ngày)">
            <input
              type="number"
              min={0}
              className="input"
              value={v("lead_time_days")}
              onChange={(e) => set("lead_time_days", e.target.value)}
              placeholder="21"
            />
          </Field>
          <Field label="Đánh giá (1–5 sao)">
            <div className="flex gap-1 pt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("rating", n)}
                  className="text-2xl leading-none transition hover:scale-110"
                  aria-label={`${n} sao`}
                  style={{ color: n <= Number(form.rating || 0) ? "#f59e0b" : "#cbd5e1" }}
                >
                  ★
                </button>
              ))}
            </div>
          </Field>
          <Field label="Ghi chú nội bộ" className="sm:col-span-2 lg:col-span-3">
            <textarea
              rows={3}
              className="input resize-y"
              value={v("notes")}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Chứng chỉ, điểm mạnh/yếu, lịch sử liên hệ, lưu ý khi làm việc..."
            />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-ink-200 bg-white/95 px-4 py-3 shadow-card backdrop-blur">
        {supplier && dirty && (
          <span className="mr-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Chưa lưu thay đổi
          </span>
        )}
        {supplier && (
          <Button type="button" variant="ghost" onClick={() => setForm(init(supplier))} disabled={!dirty || busy}>
            Hoàn tác
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {supplier ? "Lưu thay đổi" : "Tạo nhà cung cấp"}
        </Button>
      </div>
    </form>
  );
}
