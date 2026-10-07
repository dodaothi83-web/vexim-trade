"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Save, ShieldCheck, Sparkles } from "lucide-react";

import { createBuyerAction, updateBuyerAction } from "@/app/actions";
import { STAGES } from "@/lib/pipeline";
import type { Buyer, Supplier } from "@/lib/types";
import { Button, Field, cx } from "@/components/ui";
import { useToast } from "@/components/toast";
import { StageDot } from "@/components/stage-select";

const INCOTERMS = ["EXW", "FOB", "CFR", "CIF", "DAP", "DDP", "FCA"];
const PAYMENT_METHODS = ["T/T", "L/C at sight", "L/C trả chậm", "D/P", "D/A", "CAD"];
const PRIORITIES = [
  { value: "high", label: "Cao" },
  { value: "normal", label: "Bình thường" },
  { value: "low", label: "Thấp" },
];

type FormState = Record<string, string | boolean | number | null>;

function init(b?: Buyer | null): FormState {
  return {
    company: b?.company ?? "",
    contact_name: b?.contact_name ?? "",
    email: b?.email ?? "",
    cc_emails: b?.cc_emails ?? "",
    phone: b?.phone ?? "",
    country: b?.country ?? "",
    website: b?.website ?? "",
    linkedin: b?.linkedin ?? "",
    instagram: b?.instagram ?? "",
    product: b?.product ?? "",
    spec: b?.spec ?? "",
    quantity: b?.quantity ?? "",
    target_price: b?.target_price ?? "",
    payment_method: b?.payment_method ?? "",
    payment_terms: b?.payment_terms ?? "",
    incoterm: b?.incoterm ?? "FOB",
    port: b?.port ?? "",
    expected_ship_date: b?.expected_ship_date ?? "",
    deal_value: b?.deal_value ?? "",
    supplier_id: b?.supplier_id ?? "",
    hide_buyer_from_supplier: b?.hide_buyer_from_supplier ?? true,
    stage: b?.stage ?? "lead",
    owner: b?.owner ?? "",
    source: b?.source ?? "",
    priority: b?.priority ?? "normal",
    next_action: b?.next_action ?? "",
    next_action_date: b?.next_action_date ?? "",
    notes: b?.notes ?? "",
  };
}

export function BuyerForm({
  buyer,
  suppliers,
}: {
  buyer?: Buyer | null;
  suppliers: Pick<Supplier, "id" | "name" | "status">[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => init(buyer));
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const v = (k: string) => String(form[k] ?? "");

  const dirty = buyer ? JSON.stringify(init(buyer)) !== JSON.stringify(form) : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v("company").trim()) {
      toast.push({ kind: "error", title: "Chưa nhập tên công ty / buyer." });
      return;
    }
    setBusy(true);
    const payload = {
      ...form,
      supplier_id: v("supplier_id") || null,
      deal_value: v("deal_value") ? Number(v("deal_value")) : null,
    };
    try {
      const res = buyer
        ? await updateBuyerAction(buyer.id, payload)
        : await createBuyerAction(payload);
      toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      if (res.ok) {
        if (buyer) {
          router.refresh();
        } else if (res.id) {
          router.push(`/buyers/${res.id}`);
        }
      }
    } catch (err) {
      toast.push({
        kind: "error",
        title: "Lỗi khi lưu",
        lines: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Panel
        title="1. Thông tin buyer"
        desc="Khách hàng nước ngoài. Email là bắt buộc để hệ thống gửi cập nhật tiến độ."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tên công ty" required className="sm:col-span-2">
            <input
              className="input"
              value={v("company")}
              onChange={(e) => set("company", e.target.value)}
              placeholder="VD: Al Noor Trading LLC"
              autoFocus
            />
          </Field>
          <Field label="Quốc gia">
            <input
              className="input"
              value={v("country")}
              onChange={(e) => set("country", e.target.value)}
              placeholder="VD: United Arab Emirates"
            />
          </Field>

          <Field label="Người liên hệ">
            <input
              className="input"
              value={v("contact_name")}
              onChange={(e) => set("contact_name", e.target.value)}
              placeholder="VD: Ahmed Al Mansouri"
            />
          </Field>
          <Field label="Email buyer" required hint="Email nhận thông báo tiến độ (tiếng Anh)">
            <input
              type="email"
              className="input"
              value={v("email")}
              onChange={(e) => set("email", e.target.value)}
              placeholder="buyer@company.com"
            />
          </Field>
          <Field label="CC" hint="Phân cách bằng dấu phẩy">
            <input
              className="input"
              value={v("cc_emails")}
              onChange={(e) => set("cc_emails", e.target.value)}
              placeholder="purchase@company.com"
            />
          </Field>

          <Field label="Điện thoại / WhatsApp">
            <input
              className="input"
              value={v("phone")}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+971 50 000 0000"
            />
          </Field>
          <Field label="Website">
            <input
              className="input"
              value={v("website")}
              onChange={(e) => set("website", e.target.value)}
              placeholder="company.com"
            />
          </Field>
          <Field label="LinkedIn">
            <input
              className="input"
              value={v("linkedin")}
              onChange={(e) => set("linkedin", e.target.value)}
              placeholder="linkedin.com/company/..."
            />
          </Field>
          <Field label="Instagram">
            <input
              className="input"
              value={v("instagram")}
              onChange={(e) => set("instagram", e.target.value)}
              placeholder="@company"
            />
          </Field>
          <Field label="Nguồn khách">
            <input
              className="input"
              value={v("source")}
              onChange={(e) => set("source", e.target.value)}
              placeholder="Hội chợ / Website / Giới thiệu..."
            />
          </Field>
        </div>
      </Panel>

      <Panel title="2. Đơn hàng" desc="Thông tin dùng trong nội dung email gửi buyer & NCC.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Mặt hàng" className="sm:col-span-2">
            <input
              className="input"
              value={v("product")}
              onChange={(e) => set("product", e.target.value)}
              placeholder="VD: Gạo Jasmine 5% tấm"
            />
          </Field>
          <Field label="Số lượng">
            <input
              className="input"
              value={v("quantity")}
              onChange={(e) => set("quantity", e.target.value)}
              placeholder="VD: 500 MT / tháng"
            />
          </Field>
          <Field label="Quy cách" className="sm:col-span-2">
            <input
              className="input"
              value={v("spec")}
              onChange={(e) => set("spec", e.target.value)}
              placeholder="VD: 25kg PP bag, moisture ≤ 14%"
            />
          </Field>
          <Field label="Giá mục tiêu">
            <input
              className="input"
              value={v("target_price")}
              onChange={(e) => set("target_price", e.target.value)}
              placeholder="VD: USD 640 / MT"
            />
          </Field>
          <Field label="Phương thức thanh toán">
            <select
              className="input"
              value={v("payment_method")}
              onChange={(e) => set("payment_method", e.target.value)}
            >
              <option value="">— Chưa chốt —</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Điều khoản thanh toán"
            hint="Tỷ lệ cọc và thời điểm trả phần còn lại"
            className="sm:col-span-2"
          >
            <input
              className="input"
              value={v("payment_terms")}
              onChange={(e) => set("payment_terms", e.target.value)}
              placeholder="VD: 30% cọc, 70% khi nhận copy B/L"
            />
          </Field>
          <Field label="Điều kiện giao">
            <select
              className="input"
              value={v("incoterm")}
              onChange={(e) => set("incoterm", e.target.value)}
            >
              {INCOTERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cảng đến">
            <input
              className="input"
              value={v("port")}
              onChange={(e) => set("port", e.target.value)}
              placeholder="VD: Jebel Ali"
            />
          </Field>
          <Field label="Ngày giao dự kiến">
            <input
              type="date"
              className="input"
              value={v("expected_ship_date")}
              onChange={(e) => set("expected_ship_date", e.target.value)}
            />
          </Field>
          <Field label="Giá trị đơn (USD)">
            <input
              type="number"
              min={0}
              step={100}
              className="input"
              value={v("deal_value")}
              onChange={(e) => set("deal_value", e.target.value)}
              placeholder="320000"
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="3. Nhà cung cấp"
        desc="Có thể để trống — giai đoạn hỏi hàng / báo giá thường chưa chốt NCC."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nhà cung cấp phụ trách đơn"
            hint="Chưa chọn thì email chỉ gửi tới buyer."
          >
            <select
              className="input"
              value={v("supplier_id")}
              onChange={(e) => set("supplier_id", e.target.value)}
            >
              <option value="">— Chưa chọn nhà cung cấp —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id} disabled={s.status === "paused"}>
                  {s.name}
                  {s.status === "paused" ? " (tạm ngưng)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <a
              href="/suppliers/new"
              className="btn btn-ghost w-full"
              target="_blank"
              rel="noreferrer"
            >
              <Sparkles className="h-4 w-4" />
              Thêm nhà cung cấp mới
            </a>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[#0f766e]"
            checked={Boolean(form.hide_buyer_from_supplier)}
            onChange={(e) => set("hide_buyer_from_supplier", e.target.checked)}
          />
          <span>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              Ẩn danh buyer khi email cho NCC
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500">
              Email gửi NCC sẽ chỉ nêu thị trường (quốc gia) + sản lượng, không nêu tên buyer.
              Bỏ tích nếu buyer cho phép công khai.
            </span>
          </span>
        </label>
      </Panel>

      <Panel title="4. Theo dõi" desc="Trạng thái pipeline và việc cần làm tiếp theo.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Trạng thái">
            <select
              className="input font-semibold"
              value={v("stage")}
              onChange={(e) => set("stage", e.target.value)}
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Người phụ trách">
            <input
              className="input"
              value={v("owner")}
              onChange={(e) => set("owner", e.target.value)}
              placeholder="Tên nhân viên sale"
            />
          </Field>
          <Field label="Độ ưu tiên">
            <select
              className="input"
              value={v("priority")}
              onChange={(e) => set("priority", e.target.value)}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hạn việc tiếp theo">
            <input
              type="date"
              className="input"
              value={v("next_action_date")}
              onChange={(e) => set("next_action_date", e.target.value)}
            />
          </Field>
          <Field label="Việc cần làm tiếp theo" className="sm:col-span-2 lg:col-span-4">
            <input
              className="input"
              value={v("next_action")}
              onChange={(e) => set("next_action", e.target.value)}
              placeholder="VD: Gửi PI sửa đổi + xác nhận lịch đóng cont"
            />
          </Field>
          <Field
            label="Ghi chú nội bộ"
            hint="Chỉ hiển thị trong hệ thống — KHÔNG bao giờ gửi ra ngoài."
            className="sm:col-span-2 lg:col-span-4"
          >
            <textarea
              rows={3}
              className="input resize-y"
              value={v("notes")}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Chiến lược giá, điểm yếu đối thủ, lịch sử trao đổi..."
            />
          </Field>
        </div>
      </Panel>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/95 px-4 py-3 shadow-card backdrop-blur">
        <p className="flex items-center gap-2 text-xs text-ink-500">
          {v("stage") && (
            <>
              <StageDot stage={v("stage")} />
              <span>
                Trạng thái hiện tại: <strong className="text-ink-800">{STAGES.find((s) => s.key === v("stage"))?.label}</strong>
              </span>
            </>
          )}
          {buyer && dirty && (
            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              Chưa lưu thay đổi
            </span>
          )}
        </p>
        <div className="flex gap-2">
          {buyer && (
            <Button type="button" variant="ghost" onClick={() => setForm(init(buyer))} disabled={!dirty || busy}>
              Hoàn tác
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {buyer ? "Lưu thay đổi" : "Tạo buyer"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Panel({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cx("card p-5")}>
      <div className="mb-4">
        <h2 className="text-sm font-bold text-ink-900">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-ink-500">{desc}</p>}
      </div>
      {children}
    </section>
  );
}
