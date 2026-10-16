"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Loader2,
  Lock,
  MapPin,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { createSupplierAction, updateSupplierAction } from "@/app/actions";
import {
  EXPORT_MARKETS,
  INCOTERM_OPTIONS,
  SUPPLIER_ROLES,
  SUPPLIER_STATUSES,
  SUPPLIER_TYPES,
  VIETNAM_PORTS,
  nextStatusOptions,
  statusMeta,
} from "@/lib/supplier";
import type { Supplier } from "@/lib/types";
import { Button, Field } from "@/components/ui";
import { useToast } from "@/components/toast";

type FormState = Record<string, unknown>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function init(s?: Supplier | null): FormState {
  return {
    name: s?.name ?? "",
    trade_name: s?.trade_name ?? "",
    display_name: s?.display_name ?? "",
    slug: s?.slug ?? "",
    role: s?.role ?? "manufacturer",
    supplier_type: s?.supplier_type ?? null,
    status: s?.status ?? "draft",
    country: s?.country ?? "Vietnam",
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
    founded_year: s?.founded_year ?? "",
    employees: s?.employees ?? "",
    summary_en: s?.summary_i18n?.en ?? "",
    moq_text: s?.moq_text ?? "",
    capacity_per_month: s?.capacity_per_month ?? "",
    ports: s?.ports ?? [],
    incoterms: s?.incoterms ?? [],
    export_markets: s?.export_markets ?? [],
    private_label: s?.private_label ?? false,
    verification_level: s?.verification_level ?? 0,
    fob_min: s?.fob_min ?? "",
    fob_max: s?.fob_max ?? "",
    fob_unit: s?.fob_unit ?? "USD/kg",
    fob_currency: s?.fob_currency ?? "USD",
    fob_publicly_visible: s?.fob_publicly_visible ?? false,
    rating: s?.rating ?? 4,
    notes: s?.notes ?? "",
  };
}

/** Toggle multi-select chip arrays (ports/incoterms/export_markets). */
function ChipGroup({
  options,
  value,
  onChange,
  otherPlaceholder,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  otherPlaceholder?: string;
}) {
  const [other, setOther] = useState(
    value.filter((v) => !options.includes(v)).join(", "),
  );
  function toggle(v: string) {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }
  function commitOther(next: string) {
    const extras = next.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const base = value.filter((v) => options.includes(v));
    onChange([...base, ...extras]);
    setOther(next);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={
              "rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition " +
              (active
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-400")
            }
          >
            {o}
          </button>
        );
      })}
      <input
        value={other}
        onChange={(e) => setOther(e.target.value)}
        onBlur={(e) => commitOther(e.target.value)}
        placeholder={otherPlaceholder ?? "Khác..."}
        className="min-w-[120px] flex-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] text-ink-700 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
      />
    </div>
  );
}

export function SupplierForm({ supplier }: { supplier?: Supplier | null }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => init(supplier));
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const str = (k: string) => String(form[k] ?? "");
  const arr = (k: string) => (Array.isArray(form[k]) ? (form[k] as string[]) : []);
  const dirty = supplier ? JSON.stringify(init(supplier)) !== JSON.stringify(form) : true;

  function autoSlugFrom(val: string) {
    const cur = str("slug");
    if (!supplier && (!cur || cur === slugify(str("name")))) {
      set("slug", slugify(val));
    }
    set("display_name", val);
  }

  async function transitionTo(next: string) {
    set("status", next);
    // Submit ẩn rồi refresh để hiển thị trạng thái mới (cùng submit)
    await submit(new Event("submit") as unknown as React.FormEvent, { silent: true });
  }

  async function submit(e: React.FormEvent, opts: { silent?: boolean } = {}) {
    e.preventDefault?.();
    if (!str("name").trim()) {
      toast.push({ kind: "error", title: "Chưa nhập tên pháp nhân nhà cung cấp." });
      return;
    }
    setBusy(true);
    const summary_en = str("summary_en").trim();
    const payload = {
      ...form,
      lead_time_days: str("lead_time_days") ? Number(str("lead_time_days")) : null,
      founded_year: str("founded_year") ? Number(str("founded_year")) : null,
      employees: str("employees") ? Number(str("employees")) : null,
      fob_min: str("fob_min") ? Number(str("fob_min")) : null,
      fob_max: str("fob_max") ? Number(str("fob_max")) : null,
      verification_level: Number(form.verification_level ?? 0),
      rating: Number(form.rating ?? 4),
      summary_i18n: summary_en ? ({ en: summary_en } as Record<string, string>) : undefined,
      slug: str("slug") || slugify(str("display_name") || str("name")),
    };
    try {
      const res = supplier
        ? await updateSupplierAction(supplier.id, payload)
        : await createSupplierAction(payload);
      if (!opts.silent) {
        toast.push({ kind: res.ok ? "success" : "error", title: res.message });
      }
      if (res.ok) {
        if (supplier) router.refresh();
        else if (res.id) router.push(`/crm/suppliers/${res.id}`);
      }
    } catch (err) {
      toast.push({ kind: "error", title: "Lỗi khi lưu", lines: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setBusy(false);
    }
  }

  const st = statusMeta(str("status"));
  const nextOptions = nextStatusOptions(str("status"));
  const verificationLevel = Number(form.verification_level ?? 0);

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        {/* 1. Doanh nghiệp */}
        <section className="card p-5">
          <h2 className="text-sm font-bold text-ink-900">1. Doanh nghiệp</h2>
          <p className="mt-0.5 mb-4 text-xs text-ink-500">
            Thông tin pháp lý cơ bản — hồ sơ công khai bổ sung ở mục 4.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tên pháp nhân" required className="sm:col-span-2">
              <input
                className="input"
                value={str("name")}
                onChange={(e) => set("name", e.target.value)}
                placeholder="VD: CTCP Nông sản Mekong Delta"
                autoFocus
              />
            </Field>
            <Field label="Tên thương mại">
              <input
                className="input"
                value={str("trade_name")}
                onChange={(e) => set("trade_name", e.target.value)}
                placeholder="Nếu khác tên pháp nhân"
              />
            </Field>
            <Field label="Tên hiển thị công khai" hint="Dùng trên trang catalog; nếu trống lấy từ tên thương mại">
              <input
                className="input"
                value={str("display_name")}
                onChange={(e) => autoSlugFrom(e.target.value)}
                placeholder="VD: Mekong Cashew Co."
              />
            </Field>
            <Field label="Slug URL" hint="Tự tạo từ tên hiển thị; chỉ đổi khi cần" className="sm:col-span-2">
              <input
                className="input font-mono text-[13px]"
                value={str("slug")}
                onChange={(e) => set("slug", slugify(e.target.value))}
                placeholder="mekong-cashew"
              />
            </Field>
            <Field label="Vai trò (legacy)">
              <select className="input" value={str("role")} onChange={(e) => set("role", e.target.value)}>
                {SUPPLIER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Loại hình" hint="Dùng cho catalog công khai">
              <select
                className="input"
                value={str("supplier_type") || ""}
                onChange={(e) => set("supplier_type", e.target.value || null)}
              >
                <option value="">— Chọn —</option>
                {SUPPLIER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Quốc gia">
              <input className="input" value={str("country")} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <Field label="Tỉnh / Thành">
              <input
                className="input"
                value={str("province")}
                onChange={(e) => set("province", e.target.value)}
                placeholder="VD: Bình Phước"
              />
            </Field>
            <Field label="Địa chỉ nhà máy / văn phòng">
              <input
                className="input"
                value={str("address")}
                onChange={(e) => set("address", e.target.value)}
                placeholder="KCN / xã / huyện"
              />
            </Field>
            <Field label="Website">
              <input
                className="input"
                value={str("website")}
                onChange={(e) => set("website", e.target.value)}
                placeholder="ten-mien.vn"
              />
            </Field>
            <Field label="Mã số thuế">
              <input className="input" value={str("tax_id")} onChange={(e) => set("tax_id", e.target.value)} />
            </Field>
            <Field label="Thị trường đã phục vụ (ghi text)" className="sm:col-span-2" hint="VD: EU, Nhật, Trung Đông">
              <input className="input" value={str("markets")} onChange={(e) => set("markets", e.target.value)} />
            </Field>
          </div>
        </section>

        {/* 2. Liên hệ */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-ink-900">2. Người liên hệ</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Người phụ trách">
              <input className="input" value={str("contact_name")} onChange={(e) => set("contact_name", e.target.value)} />
            </Field>
            <Field label="Chức vụ">
              <input className="input" value={str("contact_title")} onChange={(e) => set("contact_title", e.target.value)} />
            </Field>
            <Field label="Email công việc">
              <input type="email" className="input" value={str("email")} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Điện thoại / WhatsApp">
              <input className="input" value={str("phone")} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Zalo">
              <input className="input" value={str("zalo")} onChange={(e) => set("zalo", e.target.value)} />
            </Field>
          </div>
        </section>

        {/* 3. Năng lực cơ bản */}
        <section className="card p-5">
          <h2 className="text-sm font-bold text-ink-900">3. Năng lực &amp; điều kiện</h2>
          <p className="mt-0.5 mb-4 text-xs text-ink-500">
            Số liệu nhanh dùng ở trang công khai. Sản phẩm chi tiết tạo ở tab Sản phẩm.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Năm thành lập">
              <input
                type="number"
                className="input"
                min={1950}
                max={new Date().getFullYear()}
                value={str("founded_year")}
                onChange={(e) => set("founded_year", e.target.value)}
              />
            </Field>
            <Field label="Số nhân sự">
              <input
                type="number"
                className="input"
                min={0}
                value={str("employees")}
                onChange={(e) => set("employees", e.target.value)}
                placeholder="VD: 120"
              />
            </Field>
            <Field label="Thời gian giao (ngày)">
              <input
                type="number"
                min={0}
                className="input"
                value={str("lead_time_days")}
                onChange={(e) => set("lead_time_days", e.target.value)}
              />
            </Field>
            <Field label="MOQ mô tả" className="sm:col-span-2" hint="VD: 1×20' FCL (~18 MT) hoặc 500 kg sample order">
              <input className="input" value={str("moq_text")} onChange={(e) => set("moq_text", e.target.value)} />
            </Field>
            <Field label="Công suất / tháng">
              <input
                className="input"
                value={str("capacity_per_month")}
                onChange={(e) => set("capacity_per_month", e.target.value)}
                placeholder="VD: 200 MT"
              />
            </Field>
            <Field label="Điều khoản thanh toán" className="sm:col-span-2">
              <input
                className="input"
                value={str("payment_terms")}
                onChange={(e) => set("payment_terms", e.target.value)}
                placeholder="30% TT cọc, 70% theo copy B/L"
              />
            </Field>
            <label className="flex items-center gap-2 self-end rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-700">
              <input
                type="checkbox"
                checked={Boolean(form.private_label)}
                onChange={(e) => set("private_label", e.target.checked)}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              Nhận làm nhãn riêng / OEM
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Cảng xuất" className="sm:col-span-3">
              <ChipGroup options={VIETNAM_PORTS} value={arr("ports")} onChange={(v) => set("ports", v)} />
            </Field>
            <Field label="Incoterms hỗ trợ" className="sm:col-span-3">
              <ChipGroup options={INCOTERM_OPTIONS} value={arr("incoterms")} onChange={(v) => set("incoterms", v)} otherPlaceholder="VD: DAP..." />
            </Field>
            <Field label="Thị trường xuất khẩu" className="sm:col-span-3">
              <ChipGroup options={EXPORT_MARKETS} value={arr("export_markets")} onChange={(v) => set("export_markets", v)} otherPlaceholder="Khác..." />
            </Field>
          </div>
        </section>

        {/* 4. Hồ sơ công khai */}
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <Globe2 className="h-4 w-4 text-brand-700" />
            4. Hồ sơ hiển thị công khai
          </h2>
          <p className="mt-0.5 mb-4 text-xs text-ink-500">
            Chỉ hiện khi trạng thái <code className="rounded bg-ink-100 px-1">published</code>. FOB và video nhà máy chỉ công khai khi có chấp thuận bằng văn bản.
          </p>
          <div className="grid gap-4">
            <Field label="Tóm tắt giới thiệu (tiếng Anh)" hint="1–2 câu, hiện trên thẻ và hồ sơ NCC">
              <textarea
                rows={3}
                className="input resize-y"
                value={str("summary_en")}
                onChange={(e) => set("summary_en", e.target.value)}
                placeholder="VD: Mekong Cashew is a Binh Phuoc-based cashew kernel processor, exporting W240/W320 to the EU and US markets since 2014."
              />
            </Field>

            <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-700">
                <Lock className="h-3.5 w-3.5 text-amber-700" />
                FOB reference — chỉ hiện khi có chấp thuận bằng văn bản
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <Field label="FOB min">
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={str("fob_min")}
                    onChange={(e) => set("fob_min", e.target.value)}
                    placeholder="VD: 3.20"
                  />
                </Field>
                <Field label="FOB max">
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={str("fob_max")}
                    onChange={(e) => set("fob_max", e.target.value)}
                    placeholder="VD: 4.10"
                  />
                </Field>
                <Field label="Đơn vị">
                  <input className="input" value={str("fob_unit")} onChange={(e) => set("fob_unit", e.target.value)} placeholder="USD/lb" />
                </Field>
                <Field label="Tiền tệ">
                  <input className="input" value={str("fob_currency")} onChange={(e) => set("fob_currency", e.target.value.toUpperCase())} placeholder="USD" />
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.fob_publicly_visible)}
                  onChange={(e) => {
                    const v = e.target.checked;
                    set("fob_publicly_visible", v);
                    if (v) set("fob_updated_at", new Date().toISOString());
                  }}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Seller đã ký chấp thuận công bố FOB (sẽ ghi nhận ngày tại <code>fob_updated_at</code>)
              </label>
            </div>

            <Field label="Cấp xác minh">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set("verification_level", n)}
                    className={
                      "rounded-md border px-3 py-1.5 text-[12.5px] font-semibold transition " +
                      (verificationLevel >= n
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-ink-200 bg-white text-ink-500 hover:border-ink-300")
                    }
                  >
                    L{n}
                  </button>
                ))}
                <p className="ml-3 text-[12px] text-ink-500">
                  L0 = mới nhận hồ sơ, L1 = tài liệu, L2 = thăm nhà máy, L3 = mẫu/chứng chỉ.
                </p>
              </div>
            </Field>
          </div>
        </section>

        {/* 5. Ghi chú */}
        <section className="card p-5">
          <h2 className="text-sm font-bold text-ink-900">5. Ghi chú nội bộ</h2>
          <p className="mt-0.5 mb-4 text-xs text-ink-500">Không công khai.</p>
          <Field label="Ngành hàng chính (tóm tắt)" className="sm:col-span-2">
            <input className="input" value={str("products")} onChange={(e) => set("products", e.target.value)} placeholder="VD: hạt điều W320/W240" />
          </Field>
          <Field label="Ghi chú" className="mt-4">
            <textarea
              rows={3}
              className="input resize-y"
              value={str("notes")}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Chứng chỉ, điểm mạnh/yếu, lịch sử liên hệ..."
            />
          </Field>
        </section>
      </div>

      {/* SIDEBAR workflow */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Trạng thái hồ sơ
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " + st.badge}>
              <span className={"h-1.5 w-1.5 rounded-full " + st.dot} />
              {st.label}
            </span>
            <select
              className="input ml-auto text-[12.5px]"
              value={str("status")}
              onChange={(e) => set("status", e.target.value)}
            >
              {SUPPLIER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {supplier && nextOptions.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                Chuyển trạng thái
              </p>
              {nextOptions.map((nx) => {
                const meta = statusMeta(nx);
                return (
                  <button
                    key={nx}
                    type="button"
                    disabled={busy}
                    onClick={() => transitionTo(nx)}
                    className={"flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-[13px] font-semibold transition " +
                      (nx === "published"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : nx === "archived"
                          ? "border-ink-300 bg-white text-ink-600 hover:bg-ink-50"
                          : "border-ink-200 bg-white text-ink-700 hover:border-ink-400")}
                  >
                    <span className="flex items-center gap-2">
                      <span className={"h-2 w-2 rounded-full " + meta.dot} />
                      Đưa sang <em className="not-italic font-bold">{meta.label}</em>
                    </span>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-md bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Chỉ <strong>published</strong> mới hiện ở trang công khai. Chuyển published cần có cấp xác minh ≥ L1 (đã thăm nhà máy).
            </div>
          </div>
        </div>

        <div className="card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Xác minh nhanh
          </p>
          <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-700">
            <CheckRow ok={Boolean(str("tax_id"))} label="Đã có MST" />
            <CheckRow ok={Boolean(str("province") && str("address"))} label="Đã có địa chỉ" />
            <CheckRow ok={Boolean(arr("ports").length)} label="Đã chọn cảng" />
            <CheckRow ok={verificationLevel >= 1} label="Đã thăm nhà máy (L1+)" />
            <CheckRow ok={Boolean(str("summary_en"))} label="Đã có mô tả công khai" />
          </ul>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-2">
          {supplier && dirty && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-center text-[11px] font-semibold text-amber-700">
              Chưa lưu thay đổi
            </span>
          )}
          <div className="flex gap-2">
            {supplier && (
              <Button type="button" variant="ghost" onClick={() => setForm(init(supplier))} disabled={!dirty || busy}>
                Hoàn tác
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={busy} className="flex-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {supplier ? "Lưu thay đổi" : "Tạo nhà cung cấp"}
            </Button>
          </div>
        </div>
      </aside>
    </form>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={"flex items-center gap-2 " + (ok ? "text-emerald-800" : "text-ink-500")}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
      {label}
    </li>
  );
}

// Exports for future use (icon imports tree-shaken otherwise)
export const _supplierFormIcons = { ShieldCheck, Users, MapPin };
