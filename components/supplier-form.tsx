"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  Minus,
  Phone,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import { createSupplierAction, updateSupplierAction } from "@/app/actions";
import {
  EXPORT_MARKETS,
  INCOTERM_OPTIONS,
  SUPPLIER_ROLES,
  SUPPLIER_TYPES,
  VIETNAM_PORTS,
  statusMeta,
} from "@/lib/supplier";
import type { Category, Supplier, SupplierProduct, SupplierStatus } from "@/lib/types";
import { assignSupplierCategories } from "@/lib/public/category-assignment";
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
    intro_source: s?.intro_source ?? "",
    moq_text: s?.moq_text ?? "",
    capacity_per_month: s?.capacity_per_month ?? "",
    ports: s?.ports ?? [],
    incoterms: s?.incoterms ?? [],
    export_markets: s?.export_markets ?? [],
    private_label: s?.private_label ?? false,
    fob_publicly_visible: s?.fob_publicly_visible ?? false,
    fob_updated_at: s?.fob_updated_at ?? null,
    rating: s?.rating ?? null,
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

/** Tiêu đề mục thống nhất cho các thẻ trong form sửa NCC, giống trang sửa sản phẩm. */
function SectionHead({ icon: Icon, title, sub, action }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span>
          <h2 className="text-base font-bold leading-6 text-ink-900">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] leading-5 text-ink-500">{sub}</p>}
        </span>
      </div>
      {action}
    </div>
  );
}

export type ExistingSupplierHint = Pick<Supplier, "id" | "name" | "trade_name" | "display_name" | "tax_id" | "website" | "province">;

/** Bỏ dấu tiếng Việt để so tên NCC khi cảnh báo tạo trùng. */
function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quick entry first; the long-tail commercial fields stay available on demand. */
export function SupplierForm({ supplier, categories, products = [], aiEnabled = false, mode, existingSuppliers = [] }: {
  supplier?: Supplier | null;
  categories: Pick<Category, "id" | "slug" | "name_i18n">[];
  products?: Array<Pick<SupplierProduct, "name" | "category" | "spec" | "description">>;
  aiEnabled?: boolean;
  /** "create" = form tạo rút gọn (chỉ thông tin cần lúc tạo); mặc định suy ra từ việc có hồ sơ hay chưa. */
  mode?: "create" | "edit";
  /** Danh sách NCC hiện có (rút gọn) để cảnh báo tạo trùng ngay khi gõ tên. */
  existingSuppliers?: ExistingSupplierHint[];
}) {
  const isCreate = mode ? mode === "create" : !supplier;
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => init(supplier));
  const [saved, setSaved] = useState<FormState>(() => init(supplier));
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const str = (k: string) => String(form[k] ?? "");
  const arr = (k: string) => (Array.isArray(form[k]) ? (form[k] as string[]) : []);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string }>({});
  const autoIndustries = assignSupplierCategories(str("products"), products, categories);

  // Cảnh báo tạo trùng: tên gần giống hồ sơ đã có (không chặn cứng — có thể
  // là đơn vị khác; chỉ nhắc và cho đường tắt mở hồ sơ cũ).
  const duplicateHints = ((): ExistingSupplierHint[] => {
    if (!isCreate) return [];
    const needle = normText(str("name"));
    if (needle.length < 4) return [];
    return existingSuppliers
      .filter((s) => [s.name, s.trade_name, s.display_name].some((cand) => {
        const c = normText(cand ?? "");
        return c.length >= 4 && (c === needle || c.includes(needle) || needle.includes(c));
      }))
      .slice(0, 2);
  })();
  const dirty = supplier && JSON.stringify(saved) !== JSON.stringify(form);
  const current = statusMeta(String(saved.status ?? "draft"));
  const consentAge = Date.now() - new Date(String(form.fob_updated_at ?? "")).getTime();
  const consentExpired = Boolean(form.fob_publicly_visible) &&
    (!Number.isFinite(consentAge) || consentAge < 0 || consentAge > 180 * 86400_000);

  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy) return;
    if (!str("name").trim()) {
      setFieldErrors((e) => ({ ...e, name: "Hãy nhập tên nhà cung cấp." }));
      toast.push({ kind: "error", title: "Vui lòng nhập tên nhà cung cấp." });
      return;
    }
    if (str("email").trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str("email").trim())) {
      setFieldErrors((e) => ({ ...e, email: "Email chưa đúng định dạng." }));
      toast.push({ kind: "error", title: "Email nhà cung cấp không hợp lệ." });
      return;
    }
    const typeChanged = Boolean(supplier && (form.supplier_type ?? null) !== (saved.supplier_type ?? null));
    if (typeChanged && !window.confirm("Bạn đã đối chiếu loại hình của đúng doanh nghiệp? Hồ sơ và kết quả L2 cũ giữ nguyên phạm vi, không tự chuyển sang loại hình mới. Cần xem lại các hồ sơ đang mở.")) return;
    setBusy(true);
    const summary_en = str("summary_en").trim();
    const next = { ...form, status: (saved.status as SupplierStatus) ?? "draft" };
    const payload = {
      ...next,
      confirm_l2_scope_review: typeChanged,
      lead_time_days: str("lead_time_days") ? Number(str("lead_time_days")) : null,
      founded_year: str("founded_year") ? Number(str("founded_year")) : null,
      employees: str("employees") ? Number(str("employees")) : null,
      rating: typeof form.rating === "number" ? form.rating : null,
      summary_i18n: { ...(supplier?.summary_i18n ?? {}), en: summary_en },
      slug: str("slug") || slugify(str("display_name") || str("name")),
    };
    try {
      const res = supplier ? await updateSupplierAction(supplier.id, payload) : await createSupplierAction(payload);
      const translationWarning = res.translationStatus === "failed" || res.translationStatus === "unconfigured";
      toast.push({ kind: !res.ok ? "error" : translationWarning ? "info" : "success", title: res.message });
      if (res.ok) {
        // Server trả hồ sơ sau cả bước dịch. Không để state trước lưu ghi đè bản AI ở lần lưu tiếp theo.
        const persisted = supplier && res.supplier ? init(res.supplier) : next;
        setSaved(persisted);
        setForm(persisted);
        if (supplier) router.refresh();
        else if (res.id) router.push(`/crm/suppliers/${res.id}`);
      }
    } catch (err) {
      toast.push({ kind: "error", title: "Không lưu được", lines: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setBusy(false);
    }
  }

  async function writeIntroduction() {
    if (!str("name").trim()) {
      toast.push({ kind: "error", title: "Nhập tên nhà cung cấp trước khi soạn." });
      return;
    }
    if (str("summary_en").trim() && !window.confirm("Thay bản giới thiệu hiện tại bằng bản nháp AI?")) return;
    setDrafting(true);
    try {
      const response = await fetch("/api/ai/editor-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "supplier", name: str("name"), province: str("province"), products: str("products"), website: str("website") }),
      });
      const data = await response.json() as { text?: string; message?: string };
      if (!response.ok || !data.text) throw new Error(data.message ?? "AI chưa soạn được. Thử lại sau.");
      set("summary_en", data.text);
      toast.push({ kind: "success", title: "Đã điền bản nháp. Hãy kiểm tra trước khi lưu." });
    } catch (error) {
      toast.push({ kind: "error", title: error instanceof Error ? error.message : "Lỗi AI" });
    } finally { setDrafting(false); }
  }

  /* ------------------------- Tạo mới: form rút gọn -------------------------
   * Chỉ giữ thông tin cần lúc tạo; mọi trường nâng cao (giá, hiển thị công
   * khai, thương mại, ghi chú…) nằm ở trang Sửa sau khi hồ sơ đã tồn tại.
   * Khối "Quyền hiển thị giá" cố ý KHÔNG có ở đây: tránh xác nhận pháp lý
   * khi NCC chưa có sản phẩm/văn bản chấp thuận nào. */
  if (isCreate) {
    return (
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-200 bg-white/95 px-3.5 py-2.5 shadow-sm backdrop-blur">
          <Link href="/crm/suppliers" className="btn btn-ghost btn-sm px-2.5 py-1.5 text-[13px]">← Danh sách NCC</Link>
          <div className="flex items-center gap-2">
            <Link href="/crm/suppliers" className="btn btn-ghost">Huỷ</Link>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Tạo hồ sơ nháp <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="card p-5">
            <h2 className="text-base font-bold text-ink-900">Thông tin cần lúc tạo</h2>
            <p className="mb-2 mt-0.5 text-[13px] text-ink-500">Hồ sơ mới luôn ở trạng thái <b>Bản nháp</b> — chưa hiển thị cho buyer cho tới khi được duyệt và công khai.</p>

            <p className="mb-2.5 mt-5 text-[11px] font-extrabold uppercase tracking-widest text-brand-700">Doanh nghiệp</p>
            <div className="space-y-4">
              <Field label="Tên nhà cung cấp" required>
                <input
                  className={`input ${fieldErrors.name ? "border-rose-400 bg-rose-50/40" : ""}`}
                  autoFocus
                  value={str("name")}
                  aria-invalid={!!fieldErrors.name}
                  onChange={(e) => { set("name", e.target.value); setFieldErrors((err) => ({ ...err, name: undefined })); }}
                  placeholder="vd: Công ty TNHH Chế biến Hạt Điều Bình Phước"
                />
                {fieldErrors.name && <p className="mt-1 text-xs font-semibold text-rose-600">{fieldErrors.name}</p>}
                {duplicateHints.length > 0 && (
                  <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-800">
                    <p className="flex items-center gap-1.5 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" /> Có thể trùng với hồ sơ đã có:</p>
                    <ul className="mt-1 space-y-1">
                      {duplicateHints.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                          <span>“{s.display_name || s.name}”{s.province ? ` · ${s.province}` : ""}</span>
                          <Link href={`/crm/suppliers/${s.id}`} className="font-bold text-brand-700 hover:underline">Mở hồ sơ →</Link>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs">Vẫn tạo mới nếu đây là đơn vị khác — tạo trùng sẽ khiến sản phẩm và xác minh bị chia đôi.</p>
                  </div>
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Loại hình" hint="Một cách phân loại duy nhất cho hồ sơ mới.">
                  <select className="input" value={str("supplier_type")} onChange={(e) => set("supplier_type", e.target.value || null)}>
                    <option value="">Chưa chọn</option>
                    {SUPPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Tỉnh / Thành phố"><input className="input" value={str("province")} onChange={(e) => set("province", e.target.value)} placeholder="vd: Bình Phước" /></Field>
              </div>
              <Field label="Mặt hàng chính" hint="Ngành hàng sẽ tự gán từ mặt hàng và sản phẩm — không cần chọn tay.">
                <input className="input" value={str("products")} onChange={(e) => set("products", e.target.value)} placeholder="Ví dụ: hạt điều W320, gạo Jasmine" />
                {autoIndustries.slugs.length > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
                    Ngành hệ thống tự gán:
                    {autoIndustries.slugs.map((slug) => {
                      const category = categories.find((c) => c.slug === slug);
                      return <span key={slug} className="rounded-full bg-white px-2 py-0.5 text-xs font-bold ring-1 ring-brand-200">{category?.name_i18n.en || slug}{category?.id === autoIndustries.primaryId ? " · chính" : ""}</span>;
                    })}
                  </p>
                )}
              </Field>
            </div>

            <p className="mb-2.5 mt-7 text-[11px] font-extrabold uppercase tracking-widest text-brand-700">Liên hệ <span className="font-medium normal-case tracking-normal text-ink-400">(để đội sale liên lạc lại)</span></p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Người liên hệ"><input className="input" value={str("contact_name")} onChange={(e) => set("contact_name", e.target.value)} /></Field>
              <Field label="Chức vụ"><input className="input" value={str("contact_title")} onChange={(e) => set("contact_title", e.target.value)} placeholder="vd: Giám đốc kinh doanh" /></Field>
              <Field label="Điện thoại"><input className="input" value={str("phone")} onChange={(e) => set("phone", e.target.value)} placeholder="09xx xxx xxx" /></Field>
              <Field label="Zalo" hint="Kênh liên hệ chính với nhiều NCC Việt Nam."><input className="input" value={str("zalo")} onChange={(e) => set("zalo", e.target.value)} placeholder="Số Zalo (nếu khác điện thoại)" /></Field>
              <Field label="Email">
                <input
                  className={`input ${fieldErrors.email ? "border-rose-400 bg-rose-50/40" : ""}`}
                  type="email"
                  value={str("email")}
                  aria-invalid={!!fieldErrors.email}
                  onChange={(e) => { set("email", e.target.value); setFieldErrors((err) => ({ ...err, email: undefined })); }}
                  placeholder="ten@congty.vn"
                />
                {fieldErrors.email && <p className="mt-1 text-xs font-semibold text-rose-600">{fieldErrors.email}</p>}
              </Field>
              <Field label="Website"><input className="input" value={str("website")} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></Field>
            </div>

            <p className="mt-6 rounded-xl border border-dashed border-ink-200 bg-ink-50/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-500">
              Các thông tin còn lại — địa chỉ chi tiết, mã số thuế, điều kiện thương mại (MOQ, cảng, incoterm),
              giới thiệu cho buyer, chấp thuận hiển thị giá… — bổ sung ở <b>trang Sửa</b> sau khi tạo. Không cần điền ngay.
            </p>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-20">
            <div className="card p-4">
              <h3 className="mb-2 text-sm font-bold text-ink-900">Sau khi tạo sẽ làm gì</h3>
              <ol className="space-y-0.5">
                {[
                  { n: 1, title: "Tạo hồ sơ nháp", desc: "Trang này, chỉ cần tên.", now: true },
                  { n: 2, title: "Thêm sản phẩm", desc: "Mặt hàng, quy cách, ảnh/catalogue.", now: false },
                  { n: 3, title: "Kiểm giấy tờ & nhà máy", desc: "Đội Vexim xét duyệt riêng.", now: false },
                  { n: 4, title: "Nộp duyệt → Công khai", desc: "Buyer mới thấy hồ sơ.", now: false },
                ].map((s) => (
                  <li key={s.n} className="flex gap-2.5 py-1.5 text-[13px]">
                    <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold ${s.now ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500"}`}>{s.n}</span>
                    <span className={s.now ? "font-semibold text-ink-900" : "text-ink-500"}>{s.title} <span className="block text-xs font-normal text-ink-400">{s.desc}</span></span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="card p-4">
              <h3 className="mb-2 text-sm font-bold text-ink-900">Đã chuyển khỏi trang tạo</h3>
              <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-ink-500">
                <li><b className="text-ink-700">Chấp thuận công khai giá</b> → trang Sửa, cạnh ngữ cảnh sản phẩm.</li>
                <li><b className="text-ink-700">Tên hiển thị & đường dẫn web</b> → trang Sửa.</li>
                <li><b className="text-ink-700">MOQ, cảng, incoterm, thị trường</b> → trang Sửa.</li>
                <li><b className="text-ink-700">Ghi chú nội bộ</b> → trang Sửa.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[12.5px] leading-relaxed text-amber-800">
              <p className="font-bold">Thói quen tốt</p>
              <p className="mt-0.5">Tìm tên NCC trong danh sách trước khi tạo — tránh trùng hồ sơ khiến sản phẩm và xác minh bị chia đôi.</p>
            </div>
          </aside>
        </div>
      </form>
    );
  }

  const completeness = [
    { label: "Tên doanh nghiệp", done: Boolean(str("name").trim()) },
    { label: "Người liên hệ và điện thoại", done: Boolean(str("contact_name").trim() && str("phone").trim()) },
    { label: "Email liên hệ đúng định dạng", done: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str("email").trim()) },
    { label: "Mặt hàng chính", done: Boolean(str("products").trim()) },
    { label: "Mã số thuế", done: Boolean(str("tax_id").trim()) },
    { label: "Giới thiệu cho buyer", done: Boolean(str("intro_source").trim() || str("summary_en").trim()) },
    { label: "Điều kiện thương mại (MOQ hoặc thị trường xuất khẩu)", done: Boolean(str("moq_text").trim() || arr("export_markets").length > 0) },
    { label: "Ảnh đại diện", done: Boolean(supplier?.profile_image) },
  ];
  const doneCount = completeness.filter((item) => item.done).length;

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-200 bg-white/95 px-3.5 py-2.5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2.5">
          {supplier && <Link href={`/crm/suppliers/${supplier.id}`} className="btn btn-ghost btn-sm px-2.5 py-1.5 text-[13px]">← Xem hồ sơ</Link>}
          <span className={"rounded-full px-3 py-1 text-xs font-semibold " + current.badge}>{current.label}</span>
          <span className="hidden text-[13px] text-ink-500 md:inline">{dirty ? "Có thay đổi chưa lưu" : "Chưa có thay đổi"}</span>
        </div>
        <div className="flex items-center gap-2">
          {supplier && (
            <Button type="button" disabled={!dirty || busy} onClick={() => setForm(saved)}>
              <RotateCcw className="h-4 w-4" /> Hoàn tác
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu thay đổi
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <section className="card p-5">
            <SectionHead icon={Building2} title="Doanh nghiệp" sub="Thông tin pháp lý và năng lực cơ bản của nhà cung cấp." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên nhà cung cấp" required className="sm:col-span-2">
                <input className={`input ${fieldErrors.name ? "border-rose-400 bg-rose-50/40" : ""}`} autoFocus required value={str("name")} aria-invalid={!!fieldErrors.name} onChange={(e) => { set("name", e.target.value); setFieldErrors((err) => ({ ...err, name: undefined })); }} placeholder="Tên doanh nghiệp / nhà máy" />
                {fieldErrors.name && <p className="mt-1 text-xs font-semibold text-rose-600">{fieldErrors.name}</p>}
              </Field>
              <Field label="Tên thương mại"><input className="input" value={str("trade_name")} onChange={(e) => set("trade_name", e.target.value)} /></Field>
              <Field label="Loại hình" hint="Thay đổi cần đối chiếu; kết quả L2 cũ không tự chuyển phạm vi.">
                <select className="input" value={str("supplier_type")} onChange={(e) => set("supplier_type", e.target.value || null)}>
                  <option value="">Chưa chọn</option>{SUPPLIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Tỉnh / Thành phố"><input className="input" value={str("province")} onChange={(e) => set("province", e.target.value)} /></Field>
              <Field label="Quốc gia"><input className="input" value={str("country")} onChange={(e) => set("country", e.target.value)} /></Field>
              <Field label="Địa chỉ" className="sm:col-span-2"><input className="input" value={str("address")} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="Năm thành lập"><input type="number" className="input" value={str("founded_year")} onChange={(e) => set("founded_year", e.target.value)} /></Field>
              <Field label="Số nhân viên"><input type="number" className="input" value={str("employees")} onChange={(e) => set("employees", e.target.value)} /></Field>
              <Field label="Mặt hàng chính" className="sm:col-span-2"><input className="input" value={str("products")} onChange={(e) => set("products", e.target.value)} placeholder="Ví dụ: hạt điều W320, gạo Jasmine" /></Field>
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-sm sm:col-span-2">
                <p className="font-semibold text-ink-700">Ngành hệ thống tự gán từ sản phẩm và mặt hàng chính</p>
                <div className="mt-2 flex flex-wrap gap-2">{autoIndustries.slugs.length ? autoIndustries.slugs.map((slug) => {
                  const category = categories.find((c) => c.slug === slug);
                  return <span key={slug} className="rounded-full bg-white px-2.5 py-1 font-semibold text-brand-800 ring-1 ring-brand-200">{category?.name_i18n.en || slug}{category?.id === autoIndustries.primaryId ? " · chính" : ""}</span>;
                }) : <span className="text-ink-500">Chưa có dữ liệu mặt hàng, sẽ tự cập nhật khi thêm sản phẩm.</span>}</div>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <SectionHead icon={Phone} title="Liên hệ" sub="Đầu mối để đội Vexim và buyer liên lạc với nhà cung cấp." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Người liên hệ"><input className="input" value={str("contact_name")} onChange={(e) => set("contact_name", e.target.value)} /></Field>
              <Field label="Chức vụ người liên hệ"><input className="input" value={str("contact_title")} onChange={(e) => set("contact_title", e.target.value)} /></Field>
              <Field label="Điện thoại"><input className="input" value={str("phone")} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Zalo"><input className="input" value={str("zalo")} onChange={(e) => set("zalo", e.target.value)} /></Field>
              <Field label="Email">
                <input className={`input ${fieldErrors.email ? "border-rose-400 bg-rose-50/40" : ""}`} type="email" value={str("email")} aria-invalid={!!fieldErrors.email} onChange={(e) => { set("email", e.target.value); setFieldErrors((err) => ({ ...err, email: undefined })); }} />
                {fieldErrors.email && <p className="mt-1 text-xs font-semibold text-rose-600">{fieldErrors.email}</p>}
              </Field>
              <Field label="Website"><input className="input" value={str("website")} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></Field>
            </div>
          </section>

          <section className="card p-5">
            <SectionHead
              icon={Globe2}
              title="Hiển thị cho buyer"
              sub="Chỉ xuất hiện trên website khi hồ sơ được công khai."
              action={aiEnabled ? (
                <Button type="button" size="sm" disabled={drafting || busy} onClick={() => void writeIntroduction()}>
                  {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI soạn nháp
                </Button>
              ) : undefined}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên hiển thị"><input className="input" value={str("display_name")} onChange={(e) => set("display_name", e.target.value)} /></Field>
              <Field label="Đường dẫn (slug)"><input className="input" value={str("slug")} onChange={(e) => set("slug", slugify(e.target.value))} placeholder="Tự tạo nếu để trống" /></Field>
            </div>
            <div className="mt-4 space-y-4">
              <Field label="Giới thiệu về công ty do NCC tự viết (bản gốc)">
                <textarea rows={3} className="input" value={str("intro_source")} onChange={(e) => set("intro_source", e.target.value)} placeholder="Mô tả về điểm khác biệt của công ty hay sản phẩm của bạn." />
                <span className="mt-1 block text-xs leading-5 text-ink-500">Câu chuyện NCC kể trên form đăng ký. Khi lưu, AI dịch lại bản tiếng Anh bên dưới từ nội dung này.</span>
              </Field>
              <Field label="Giới thiệu ngắn (tiếng Anh)">
                <textarea rows={3} className="input" value={str("summary_en")} onChange={(e) => set("summary_en", e.target.value)} placeholder="A Vietnam-based supplier of..." />
              </Field>
            </div>
          </section>

          <section className="card p-5">
            <SectionHead icon={Truck} title="Điều kiện thương mại" sub="Điều kiện bán hàng hiển thị cho buyer khi hồ sơ công khai." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="MOQ"><input className="input" value={str("moq_text")} onChange={(e) => set("moq_text", e.target.value)} /></Field>
              <Field label="Công suất mỗi tháng"><input className="input" value={str("capacity_per_month")} onChange={(e) => set("capacity_per_month", e.target.value)} /></Field>
              <Field label="Thời gian giao hàng (ngày)"><input type="number" className="input" value={str("lead_time_days")} onChange={(e) => set("lead_time_days", e.target.value)} /></Field>
              <Field label="Điều khoản thanh toán"><input className="input" value={str("payment_terms")} onChange={(e) => set("payment_terms", e.target.value)} /></Field>
              <Field label="Thị trường đã phục vụ" className="sm:col-span-2"><input className="input" value={str("markets")} onChange={(e) => set("markets", e.target.value)} /></Field>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-3.5 py-3 text-sm font-medium text-ink-700 sm:col-span-2">
                Nhận làm nhãn riêng / OEM
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-700" checked={Boolean(form.private_label)} onChange={(e) => set("private_label", e.target.checked)} />
              </label>
              <Field label="Cảng xuất" className="sm:col-span-2"><ChipGroup options={VIETNAM_PORTS} value={arr("ports")} onChange={(v) => set("ports", v)} /></Field>
              <Field label="Điều kiện giao hàng" className="sm:col-span-2"><ChipGroup options={INCOTERM_OPTIONS} value={arr("incoterms")} onChange={(v) => set("incoterms", v)} /></Field>
              <Field label="Thị trường xuất khẩu" className="sm:col-span-2"><ChipGroup options={EXPORT_MARKETS} value={arr("export_markets")} onChange={(v) => set("export_markets", v)} /></Field>
            </div>
          </section>

          <section className="card p-5">
            <SectionHead icon={FileText} title="Pháp lý và ghi chú nội bộ" sub="Thông tin nội bộ, không hiển thị cho buyer." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mã số thuế"><input className="input" value={str("tax_id")} onChange={(e) => set("tax_id", e.target.value)} /></Field>
              <Field label="Vai trò"><select className="input" value={str("role")} onChange={(e) => set("role", e.target.value)}>{SUPPLIER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
              <Field label="Ghi chú nội bộ" className="sm:col-span-2"><textarea className="input" rows={3} value={str("notes")} onChange={(e) => set("notes", e.target.value)} /></Field>
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20">
          {supplier && (
            <section className="card p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><ShieldCheck className="h-[18px] w-[18px]" /></span>
                <span>
                  <h2 className="text-sm font-bold leading-6 text-ink-900">Trạng thái hồ sơ</h2>
                  <p className="mt-0.5 text-xs leading-5 text-ink-500">Lưu thay đổi không tự đổi trạng thái hay cấp xác minh.</p>
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className={"rounded-full px-3 py-1 text-xs font-semibold " + current.badge}>{current.label}</span>
                {dirty && <span className="text-xs font-medium text-amber-700">Có thay đổi chưa lưu</span>}
              </div>
              <a href={`/crm/suppliers/${supplier.id}?tab=review#supplier-review`} className="btn btn-ghost mt-3 w-full justify-center"><ExternalLink className="h-4 w-4" /> Mở trung tâm xét duyệt</a>
              <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-5 text-ink-500">Giấy tờ, nhà máy và lịch sử giao hàng được xét duyệt ở các trang kiểm toán riêng. Hồ sơ công khai chưa duyệt giấy tờ sẽ hiện “Chưa xác minh”.</p>
            </section>
          )}

          <section id="price-sharing" className="card scroll-mt-24 p-4">
            <h2 className="text-sm font-bold text-ink-900">Quyền hiển thị giá của sản phẩm</h2>
            <p className="mt-1 text-xs leading-5 text-ink-600">Không nhập giá ở hồ sơ NCC. Giá tham khảo, đơn vị và hạn giá được nhập riêng trong từng sản phẩm; chỉ hiện công khai khi NCC đã chấp thuận bằng văn bản.</p>
            <label className="mt-3 flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-700" checked={Boolean(form.fob_publicly_visible)} onChange={(e) => setForm((f) => ({ ...f, fob_publicly_visible: e.target.checked, fob_updated_at: e.target.checked ? new Date().toISOString() : f.fob_updated_at }))} /> NCC đã chấp thuận công khai giá sản phẩm</label>
            {Boolean(form.fob_publicly_visible) && (
              <p className="mt-2 text-xs leading-5 text-ink-600">
                {consentExpired ? "Lần xác nhận đã quá 180 ngày hoặc không hợp lệ — giá sản phẩm chưa được công khai. Kiểm tra lại chấp thuận bằng văn bản rồi xác nhận lại." : "Chấp thuận có hiệu lực tối đa 180 ngày từ lần xác nhận; giá từng sản phẩm cũng phải còn hạn."}
              </p>
            )}
            {consentExpired && <button type="button" className="mt-2 text-xs font-semibold text-brand-700 underline" onClick={() => set("fob_updated_at", new Date().toISOString())}>Đã kiểm tra văn bản, xác nhận lại quyền</button>}
          </section>

          <section className="card p-4" aria-label="Mức độ hoàn thiện hồ sơ">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-ink-900">Mức độ hoàn thiện</h2>
              <span className="text-xs font-semibold text-ink-500">{doneCount}/{completeness.length}</span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.round((doneCount / completeness.length) * 100)}%` }} />
            </div>
            <ul className="mt-3 space-y-2">
              {completeness.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-[13px] leading-snug">
                  {item.done
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-400 text-amber-500"><Minus className="h-3 w-3" /></span>}
                  <span className={item.done ? "text-ink-700" : "font-medium text-ink-800"}>{item.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-5 text-ink-500">Ảnh đại diện và ảnh bìa chỉnh ở mục Ảnh ngay dưới form này.</p>
          </section>
        </aside>
      </div>
    </form>
  );
}
