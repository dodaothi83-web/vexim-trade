"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  ImageIcon,
  LockKeyhole,
  Pencil,
  Save,
  Send,
  UploadCloud,
  X,
} from "lucide-react";
import type { MediaAsset, SupplierProduct, Supplier } from "@/lib/types";
import { productPriceBlockers, supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { PRODUCT_STATUS, privateMediaUrl, productCanSubmit, productReview } from "@/lib/supplier-portal/product-view";
import { saveSupplierProductAction, submitSupplierProductAction } from "../product-actions";
import { SupplierAttributeInputs } from "@/components/supplier-attribute-inputs";
import { effectiveFieldsFor, fieldsFor, supplierFieldsFor } from "@/lib/product-attributes";

type EditorProps = {
  product?: SupplierProduct;
  media?: MediaAsset[];
  userId?: string;
  categories: CategoryProposalOption[];
  supplier: Supplier;
  /** Trang có thể mở thẳng một bước bằng `?step=2` (sau khi tạo sản phẩm mới). */
  initialStep?: Step;
};

type Step = 1 | 2 | 3;

const STEPS: { step: Step; title: string; short: string; hint: string }[] = [
  { step: 1, title: "Thông tin sản phẩm", short: "Thông tin", hint: "Tên, quy cách, thương mại" },
  { step: 2, title: "Ảnh & catalogue", short: "Hình ảnh", hint: "Tệp thực tế gửi Vexim" },
  { step: 3, title: "Xem lại & gửi", short: "Xem lại", hint: "Đọc lại toàn bộ rồi nộp" },
];

const BASE_FIELDS = [
  ["moq", "Số lượng đặt tối thiểu (MOQ)", "Ví dụ: 1 container", 180],
  ["monthly_capacity", "Năng lực mỗi tháng", "Ví dụ: 200 tấn/tháng", 180],
  ["packaging", "Bao bì / đóng gói", "Ví dụ: túi hút chân không 25 kg", 300],
] as const;

// Chứng nhận không khai ở đây: hồ sơ Giấy tờ L1 là nguồn duy nhất (AI quét đơn vị đứng tên
// và ngày hết hạn), nên sản phẩm không có ô tự khai để tránh tạo cảm giác được xác minh.
const EXPORT_FIELDS = [
  ["export_port", "Cảng xuất", "Ví dụ: Cát Lái", 120],
  ["incoterm", "Incoterm", "Ví dụ: FOB", 20],
  ["incoterm_place", "Địa điểm Incoterm", "Ví dụ: Hồ Chí Minh", 100],
] as const;

/** Nhóm trường hiển thị ở bước 3 để NCC đọc lại đúng những gì đã nhập ở bước 1. */
const REVIEW_BASICS = [
  ["name", "Tên sản phẩm"],
  ["description", "Mô tả ngắn"],
  ["spec", "Quy cách / tiêu chuẩn"],
  ["description_detail", "Mô tả chi tiết"],
] as const;

const REVIEW_COMMERCIAL = [
  ["ref_price", "Giá tham khảo từ"],
  ["ref_price_max", "Giá tham khảo đến"],
  ["currency", "Đơn vị tiền"],
  ["unit", "Đơn vị giá"],
  ["price_valid_until", "Giá có hiệu lực tới"],
  ["lead_time_days", "Thời gian giao hàng (ngày)"],
  ["payment_terms", "Điều kiện thanh toán"],
  ["export_port", "Cảng xuất"],
  ["incoterm", "Incoterm"],
  ["incoterm_place", "Địa điểm Incoterm"],
] as const;

const REVIEW_ORDER = [
  ["moq", "Số lượng đặt tối thiểu (MOQ)"],
  ["monthly_capacity", "Năng lực mỗi tháng"],
  ["packaging", "Bao bì / đóng gói"],
] as const;

/** Giá trị khởi tạo của bản xem lại: lấy từ bản đã lưu, rồi cập nhật theo từng lần nhập. */
function snapshotFrom(product?: SupplierProduct): Record<string, string> {
  const seed: Record<string, string> = {
    name: product?.name ?? "",
    description: product?.description ?? "",
    spec: product?.spec ?? "",
    description_detail: product?.description_detail ?? "",
  };
  for (const [key] of [...REVIEW_COMMERCIAL, ...REVIEW_ORDER]) {
    const value = product ? (product as unknown as Record<string, unknown>)[key] : "";
    seed[key] = value == null ? "" : String(value);
  }
  seed.oem = product?.oem ? "yes" : "";
  seed.odm = product?.odm ? "yes" : "";
  seed.samples = product?.samples ? "yes" : "";
  seed.price_publicly_visible = product?.price_publicly_visible ? "yes" : "";
  return seed;
}

const checkKeys = ["oem", "odm", "samples", "price_publicly_visible"] as const;

/** Đọc toàn bộ form thành bản nháp để bước 3 luôn khớp với những gì đang nhập. */
function snapshotFromForm(form: HTMLFormElement, previous: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = { ...previous };
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") next[key] = value;
  });
  for (const key of checkKeys) if (form.querySelector(`[name="${key}"]`) && !(key in Object.fromEntries(new FormData(form)))) next[key] = "";
  return next;
}

/** Ô bắt buộc đầu tiên còn trống/sai trong một bước (bỏ qua ô đã khoá và ô ẩn). */
function firstInvalidField(form: HTMLFormElement | null, step: Step): HTMLElement | null {
  const panel = form?.querySelector(`[data-step-panel="${step}"]`);
  if (!panel) return null;
  for (const element of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
    if (element.disabled || (element instanceof HTMLInputElement && element.type === "hidden")) continue;
    if (!element.checkValidity()) return element;
  }
  return null;
}

/**
 * Trang sản phẩm của NCC theo bố cục sàn TMĐT: thanh bước ở trên, mỗi lần chỉ mở MỘT
 * bước, thanh hành động dính ở đáy màn hình để đi tiếp/quay lại mà không phải cuộn.
 *
 * Bước 1 gộp toàn bộ nội dung và **thông tin thương mại & xuất khẩu hiện ngay**, không
 * giấu sau mũi tên gập, vì đó là phần Vexim và buyer cần thấy đầu tiên.
 *
 * Hành vi cũ giữ nguyên: lưu qua `saveSupplierProductAction`, cảnh báo thay đổi chưa lưu,
 * tải/xoá tệp qua API riêng, nộp qua `submitSupplierProductAction`, khoá khi Vexim đang duyệt.
 */
export function SupplierProductEditor({ product, media = [], userId, categories, supplier, initialStep = 1 }: EditorProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Bước sẽ mở sau khi lưu thành công; null = chỉ lưu rồi ở lại.
  const advanceTo = useRef<Step | null>(null);

  const [step, setStep] = useState<Step>(initialStep);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(product?.supplier_category_proposal ?? product?.reviewed_category_slug ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [resultAt, setResultAt] = useState<"info" | "review">("review");
  const [stepError, setStepError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState("");
  const [selected, setSelected] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  // Bản nháp dùng cho bước 3: cập nhật theo từng lần nhập nên NCC đọc lại đúng nội dung
  // đang có, kể cả phần chưa lưu (kèm cảnh báo phải lưu trước khi gửi).
  const [snapshot, setSnapshot] = useState<Record<string, string>>(() => snapshotFrom(product));
  const [submitHint, setSubmitHint] = useState<string[] | null>(null);
  const [sent, setSent] = useState(false);

  const review = product ? productReview(product) : "draft";
  const locked = review === "pending";
  const ownedCount = media.filter((m) => m.created_by === userId).length;
  const hasDetails = !!product && !!(product.spec?.trim() || product.description?.trim());
  const hasMedia = media.some((m) => (m.kind === "image" || m.kind === "catalogue") && !!m.storage_path);
  const canSubmit = !!product && productCanSubmit(product, media) && !dirty;
  const canUpload = !!product && !locked && review !== "approved" && !dirty;
  const activeCategory = categories.find((c) => c.slug === (selectedCategory || product?.category || ""));
  const categoryLabel = activeCategory?.label ?? product?.category ?? "Chưa chọn danh mục";
  // Bước 3 đọc lại thông số bằng nhãn thật (kể cả thông số NCC tự thêm), không phải khoá kỹ thuật.
  const attributeLabels = new Map(effectiveFieldsFor(activeCategory).map((field) => [field.key, field.label]));
  const attributeRows = (() => {
    const rows = new Map<string, string>();
    for (const [key, label] of attributeLabels) {
      const value = String(snapshot[`attribute:${key}`] ?? product?.specs?.[key] ?? "").trim();
      if (value) rows.set(label, value);
    }
    // Giá trị cũ chưa thuộc trường nào vẫn phải đọc lại được, không giấu khỏi NCC.
    for (const [key, value] of Object.entries(product?.specs ?? {})) {
      if (attributeLabels.has(key) || typeof value !== "string" || !value.trim()) continue;
      rows.set(key, value.trim());
    }
    return [...rows.entries()];
  })();

  // Cảnh báo rời trang khi còn thay đổi chưa lưu (đóng tab + bấm link nội bộ).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm("Bạn có thay đổi chưa lưu. Rời trang sẽ mất nội dung đang nhập. Vẫn rời trang?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  /** Ghi lại nội dung form mỗi khi NCC sửa để bước 3 phản chiếu ngay. */
  function onFormChange(event: React.FormEvent<HTMLFormElement>) {
    setDirty(true);
    setSnapshot((previous) => snapshotFromForm(event.currentTarget, previous));
  }

  function goToStep(next: Step) {
    setStep(next);
    setStepError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function detailUrl(id: string) {
    return `/supplier/portal/products/${id}`;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (product && review === "approved" &&
        !window.confirm("Lưu thay đổi sẽ rút sản phẩm khỏi trạng thái sẵn sàng cho buyer và đưa về bản nháp để Vexim duyệt lại. Tiếp tục?")) return;
    const target = advanceTo.current;
    advanceTo.current = null;
    setBusy(true);
    setResult(null);
    setStepError(null);
    try {
      const form = new FormData(event.currentTarget);
      if (product) form.set("product_id", product.id);
      const response = await saveSupplierProductAction(form);
      setResult(response);
      setResultAt("info");
      if (!response.ok) return;
      setDirty(false);
      setSubmitHint(null);
      setSnapshot(snapshotFromForm(event.currentTarget, snapshot));
      const id = response.id ?? product?.id;
      if (!product) {
        // Sản phẩm mới: đi tiếp sang trang chi tiết, mở đúng bước vừa chọn.
        router.push(`${detailUrl(id ?? "")}${target ? `?step=${target}` : ""}`);
        return;
      }
      router.refresh();
      if (target) goToStep(target);
    } catch {
      setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." });
      setResultAt("info");
    } finally {
      setBusy(false);
    }
  }

  /** Rời bước 1: kiểm tra trường bắt buộc, lưu nếu có thay đổi rồi mới mở bước sau. */
  function leaveInfoFor(target: Step) {
    if (locked) { goToStep(target); return; }
    const bad = firstInvalidField(formRef.current, 1);
    if (bad) {
      setStepError("Còn trường bắt buộc chưa điền hoặc chưa đúng định dạng ở bước này.");
      bad.focus();
      bad.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (product && !dirty) { goToStep(target); return; }
    advanceTo.current = target;
    formRef.current?.requestSubmit();
  }

  function selectStep(target: Step) {
    if (target === step) return;
    if (target > 1 && !product) {
      // Chưa lưu lần nào thì chưa có sản phẩm để tải tệp/nộp: lưu rồi đi tiếp.
      if (target === 2) leaveInfoFor(2);
      else { setStepError("Lưu thông tin sản phẩm trước khi gửi Vexim duyệt."); }
      return;
    }
    if (step === 1 && target > 1) { leaveInfoFor(target); return; }
    goToStep(target);
  }

  /** Danh sách việc còn thiếu trước khi gửi — dùng cho cả nút bấm và khối nhắc. */
  function submitBlockers(): string[] {
    const blockers: string[] = [];
    if (!product) blockers.push("Lưu sản phẩm ở bước 1 trước khi gửi.");
    if (!hasDetails) blockers.push("Bổ sung mô tả hoặc quy cách ở bước 1.");
    if (!hasMedia) blockers.push("Tải ít nhất một ảnh hoặc catalogue thật ở bước 2.");
    if (dirty) blockers.push("Lưu thay đổi ở bước 1 trước khi gửi.");
    return blockers;
  }

  /**
   * Nút gửi luôn bấm được: nếu còn thiếu thì nói rõ thiếu gì và đưa tới đúng bước,
   * thay vì để một nút xám không phản hồi.
   */
  function requestSubmit() {
    if (busy) return;
    const blockers = submitBlockers();
    if (blockers.length) {
      setSubmitHint(blockers);
      setResult(null);
      // Đưa tới đúng bước cần sửa; nếu đang ở đúng bước đó thì chỉ hiện lời nhắc.
      if (!product || !hasDetails || dirty) {
        if (step !== 1) goToStep(1);
        return;
      }
      if (!hasMedia && step !== 2) goToStep(2);
    }
    void submit();
  }

  async function submit() {
    if (!product || busy) return;
    setBusy(true);
    setSubmitHint(null);
    setResult(null);
    setStepError(null);
    try {
      const form = new FormData();
      form.set("product_id", product.id);
      const response = await submitSupplierProductAction(form);
      setResult(response);
      setResultAt("review");
      if (response.ok) {
        setSent(true);
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." });
      setResultAt("review");
    } finally {
      setBusy(false);
    }
  }

  function uploadKind(file: File): "image" | "catalogue" | null {
    if (/\.pdf$/i.test(file.name)) return "catalogue";
    if (/\.(jpg|jpeg|png|webp)$/i.test(file.name)) return "image";
    return null;
  }
  function chooseFiles(files: File[]) {
    if (ownedCount + files.length > 12) {
      setUploadResult(`Chỉ được tải tối đa 12 tệp; hiện bạn đã có ${ownedCount} tệp.`);
      setSelected([]);
      return;
    }
    const invalid = files.find((file) => !uploadKind(file) || file.size > (uploadKind(file) === "catalogue" ? 15 : 8) * 1024 * 1024);
    if (invalid) {
      setUploadResult(`Tệp “${invalid.name}” không đúng định dạng hoặc quá dung lượng. Ảnh tối đa 8 MB, PDF tối đa 15 MB.`);
      setSelected([]);
      return;
    }
    setUploadResult("");
    setSelected(files);
  }
  async function upload() {
    if (!product || !canUpload || !selected.length) return;
    setBusy(true);
    setUploadResult("");
    let uploaded = 0;
    try {
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index];
        const kind = uploadKind(file);
        if (!kind) throw Error("Tệp không đúng định dạng.");
        setProgress(`Đang tải ${index + 1}/${selected.length}: ${file.name}`);
        const body = new FormData();
        body.set("kind", kind);
        body.set("file", file);
        const response = await fetch(`/api/supplier-portal/products/${product.id}/media`, { method: "POST", body });
        const data = await response.json() as { ok: boolean; message: string };
        if (!response.ok || !data.ok) throw Error(data.message || "Không tải được tệp.");
        uploaded++;
      }
      setSelected([]);
      setUploadResult(`Đã tải ${uploaded} tệp nội bộ. Chỉ Vexim có thể chọn tệp chia sẻ buyer.`);
    } catch (error) {
      if (uploaded) setSelected(selected.slice(uploaded));
      setUploadResult(`${uploaded ? `Đã tải ${uploaded} tệp; chỉ còn tệp chưa hoàn tất trong danh sách chọn. ` : ""}${error instanceof Error ? error.message : "Không kết nối được máy chủ."}`);
    } finally {
      setProgress("");
      setBusy(false);
      if (uploaded) router.refresh();
    }
  }
  async function removeMedia(mediaId: string) {
    if (!product || dirty || !window.confirm("Xóa tệp nháp này?")) return;
    setBusy(true);
    setUploadResult("");
    try {
      const response = await fetch(`/api/supplier-portal/products/${product.id}/media?media_id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      const data = await response.json() as { ok: boolean; message: string };
      setUploadResult(data.message);
      if (data.ok) router.refresh();
    } catch {
      setUploadResult("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  }

  const status = PRODUCT_STATUS[review];
  const cover = media.find((m) => m.id === product?.featured_media_id && privateMediaUrl(m)) ??
    media.find((m) => m.kind === "image" && privateMediaUrl(m));
  const coverUrl = cover ? privateMediaUrl(cover) : null;
  const commercial = [
    { label: "Giá tham khảo", value: product?.ref_price != null ? `${product.ref_price}${product.ref_price_max != null ? `–${product.ref_price_max}` : ""} ${product.currency || "USD"}${product.unit ? ` / ${product.unit}` : ""}` : "—" },
    { label: "MOQ", value: product?.moq || "—" },
    { label: "Năng lực / tháng", value: product?.monthly_capacity || "—" },
    { label: "Thời gian giao", value: product?.lead_time_days != null ? `${product.lead_time_days} ngày` : "—" },
    { label: "Cảng xuất", value: product?.export_port || "—" },
    { label: "Incoterm", value: [product?.incoterm, product?.incoterm_place].filter(Boolean).join(" · ") || "—" },
    { label: "Thanh toán", value: product?.payment_terms || "—" },
  ];

  return <div className="mt-5 space-y-4">
    {/* Thanh bước kiểu sàn TMĐT: luôn thấy mình đang ở đâu, bấm được để chuyển bước. */}
    <nav aria-label="Các bước hoàn thiện sản phẩm" className="rounded-xl border border-ink-200 bg-white p-2 shadow-sm">
      <ol className="grid gap-1.5 sm:grid-cols-3">
        {STEPS.map((item) => {
          const done = item.step === 1 ? !!product : item.step === 2 ? hasMedia : review === "pending" || review === "approved";
          const active = step === item.step;
          return <li key={item.step}>
            <button type="button" onClick={() => selectStep(item.step)}
              aria-current={active ? "step" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition ${active ? "bg-brand-50 ring-1 ring-brand-300" : "hover:bg-ink-50"}`}>
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${done ? "bg-brand-700 text-white" : active ? "bg-brand-100 text-brand-800 ring-1 ring-brand-400" : "bg-ink-100 text-ink-500"}`}>
                {done ? <Check className="size-3.5" aria-hidden="true" /> : item.step}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[12.5px] font-bold ${active ? "text-brand-900" : "text-ink-800"}`}>{item.title}</span>
                <span className="block truncate text-[10.5px] text-ink-500">{item.hint}</span>
              </span>
              <span className="shrink-0 text-[10px] font-bold tracking-wider text-ink-400 uppercase">{active ? "Đang mở" : `B${item.step}`}</span>
            </button>
          </li>;
        })}
      </ol>
    </nav>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_312px]">
      <div className="min-w-0">
        {/* Trạng thái duyệt: một dòng, luôn hiện ở mọi bước. */}
        <section aria-label="Trạng thái xét duyệt"
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-4 py-2.5 ${review === "changes_requested" ? "border-rose-200 bg-rose-50" : review === "approved" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>{status.label}</span>
          <p className="min-w-0 flex-1 text-[12px] leading-5 text-ink-700">
            {review === "approved"
              ? "Nội dung đã được Vexim duyệt. Nếu sửa, sản phẩm quay về bản nháp và tạm ngừng sẵn sàng chia sẻ buyer."
              : review === "pending"
                ? "Vexim đang kiểm tra. Bạn xem được thông tin nhưng chưa thể chỉnh sửa hoặc tải thêm tệp."
                : review === "changes_requested"
                  ? "Xem phản hồi, chỉnh sửa, lưu lại rồi gửi Vexim kiểm tra lần nữa."
                  : "Sản phẩm còn riêng tư. Điền thông tin, thêm tệp thật rồi gửi Vexim duyệt."}
          </p>
          {product?.ready_for_buyer && review === "approved" && <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-brand-800">Sẵn sàng chia sẻ buyer</span>}
        </section>

        {product?.supplier_review_note && <p className="mt-2.5 whitespace-pre-wrap rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-rose-800">
          <AlertCircle className="mr-1 inline size-4" aria-hidden="true" /> Vexim yêu cầu: {product.supplier_review_note}
        </p>}

        <form id="product-info" ref={formRef} onSubmit={save} onChange={onFormChange} noValidate>
          <section data-step-panel={1} className={step === 1 ? "space-y-4" : "hidden"} aria-label="Bước 1 · Thông tin sản phẩm">
            <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
              <SectionHead step="Bước 1" title="Thông tin cơ bản" hint="Tên, danh mục và mô tả — phần buyer đọc đầu tiên." />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Tên sản phẩm" hint="Ví dụ: Hạt điều nhân trắng W320" required>
                    <input name="name" className="input" required maxLength={180} minLength={3} placeholder="Nhập tên mặt hàng của bạn" defaultValue={product?.name ?? ""} disabled={locked} />
                  </Field>
                </div>
                <Field label="Danh mục sản phẩm" required hint="Chỉ chọn trong danh mục kinh doanh của bạn. Chọn danh mục không tự duyệt sản phẩm.">
                  <select name="supplier_category_proposal" className="input" required value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} disabled={locked || !categories.length}>
                    <option value="" disabled>Chọn danh mục sản phẩm</option>
                    {categories.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} · ` : ""}{c.label}</option>)}
                  </select>
                </Field>
                {!categories.length && <p role="status" className="self-center rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                  Bạn chưa chọn danh mục kinh doanh đang mở. <Link href="/supplier/portal/categories" className="font-semibold underline">Chọn danh mục trước khi thêm sản phẩm</Link>
                </p>}
                <div className="md:col-span-2">
                  {selectedCategory
                    ? <SupplierAttributeInputs key={selectedCategory} disabled={locked}
                      officialFields={fieldsFor(categories.find((c) => c.slug === selectedCategory))}
                      supplierFields={supplierFieldsFor(categories.find((c) => c.slug === selectedCategory))}
                      values={product?.supplier_category_proposal === selectedCategory || product?.reviewed_category_slug === selectedCategory ? product?.specs ?? {} : {}} />
                    : <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-4 py-3 text-[12px] leading-5 text-ink-600">
                      Chọn danh mục sản phẩm ở trên để khai thông số của nhóm hàng. Thông số chưa có trong danh sách thì thêm ngay tại đó.
                    </p>}
                </div>
                <Field label="Mô tả ngắn" hint="Tóm tắt vài câu bên cạnh ảnh sản phẩm">
                  <textarea name="description" className="input min-h-28 resize-y" rows={4} maxLength={1500} placeholder="Giới thiệu ngắn gọn cho Vexim..." defaultValue={product?.description ?? ""} disabled={locked} />
                </Field>
                <Field label="Quy cách / tiêu chuẩn" hint="Cần ít nhất một trong hai ô mô tả hoặc quy cách để gửi duyệt">
                  <textarea name="spec" className="input min-h-28 resize-y" rows={4} maxLength={800} placeholder="Ví dụ: Size W320, độ ẩm ≤ 5%, đóng gói 25 kg..." defaultValue={product?.spec ?? ""} disabled={locked} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Mô tả chi tiết" hint="Hiển thị dưới phần tổng quan của trang sản phẩm; không nhập số điện thoại, email hoặc HTML.">
                    <textarea name="description_detail" className="input min-h-32 resize-y" rows={6} maxLength={6000} placeholder="Nguồn gốc, ứng dụng, đặc điểm, đóng gói, lưu ý..." defaultValue={product?.description_detail ?? ""} disabled={locked} />
                  </Field>
                </div>
              </div>
            </div>

            {/* Không còn mũi tên gập: thương mại & xuất khẩu hiện ngay từ bước 1. */}
            <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
              <SectionHead step="Bước 1" title="Thông tin thương mại & xuất khẩu" />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Giá tham khảo từ" hint="Để trống nếu chưa muốn công bố giá">
                  <input name="ref_price" type="number" min={0} max={999999999999} step="0.01" className="input" placeholder="Ví dụ: 5000" defaultValue={product?.ref_price ?? ""} disabled={locked} />
                </Field>
                <Field label="Giá tham khảo đến" hint="Tùy chọn; phải lớn hơn hoặc bằng giá từ">
                  <input name="ref_price_max" type="number" min={0} max={999999999999} step="0.01" className="input" placeholder="Ví dụ: 5500" defaultValue={product?.ref_price_max ?? ""} disabled={locked} />
                </Field>
                <Field label="Đơn vị tiền / đơn vị giá" hint="Ví dụ: USD / MT">
                  <div className="flex gap-2">
                    <input name="currency" className="input" maxLength={10} placeholder="USD" defaultValue={product?.currency ?? ""} disabled={locked} aria-label="Đơn vị tiền" />
                    <input name="unit" className="input" maxLength={40} placeholder="MT, kg, thùng" defaultValue={product?.unit ?? ""} disabled={locked} aria-label="Đơn vị giá" />
                  </div>
                </Field>
                <Field label="Giá có hiệu lực tới">
                  <input name="price_valid_until" type="date" className="input" defaultValue={product?.price_valid_until ?? ""} disabled={locked} />
                </Field>
                <Field label="Thời gian giao hàng (ngày)">
                  <input name="lead_time_days" type="number" min={0} max={3650} className="input" placeholder="Ví dụ: 21" defaultValue={product?.lead_time_days ?? ""} disabled={locked} />
                </Field>
                <Field label="Điều kiện thanh toán">
                  <input name="payment_terms" className="input" maxLength={200} placeholder="Ví dụ: T/T 30% cọc" defaultValue={product?.payment_terms ?? ""} disabled={locked} />
                </Field>
                {EXPORT_FIELDS.map(([key, label, placeholder, max]) => <Field key={key} label={label}>
                  <input name={key} className="input" maxLength={max} placeholder={placeholder} defaultValue={String(product?.[key] ?? "")} disabled={locked} />
                </Field>)}
              </div>

              <div className="mx-4 mb-4 rounded-lg border border-brand-200 bg-brand-50/50 p-3.5 text-[12.5px] text-ink-700 sm:mx-5">
                <label className="flex items-start gap-2 font-semibold">
                  <input type="checkbox" name="price_publicly_visible" value="yes" defaultChecked={product?.price_publicly_visible ?? false} disabled={locked} className="mt-0.5 size-4 accent-brand-700" />
                  Cho phép công khai giá tham khảo của sản phẩm này khi đủ điều kiện
                </label>
                {product && <div className="mt-2.5 rounded-md bg-white p-2.5 text-[11.5px] leading-5" role="status">
                  <strong>Tình trạng giá đã lưu:</strong> {productPriceBlockers(product, supplier).length === 0 ? "Sản phẩm và NCC đã cho phép chia sẻ giá." : "Buyer vẫn thấy On request."}
                  <ul className="mt-1 list-disc pl-5">{productPriceBlockers(product, supplier).map((reason) => <li key={reason}>{reason}</li>)}
                    {(review !== "approved" || !product.ready_for_buyer || supplier.status !== "published") && <li>Vexim còn phải duyệt sản phẩm, chọn danh mục/ảnh buyer và bật sẵn sàng, đồng thời công bố hồ sơ NCC.</li>}
                  </ul>
                  {dirty && <p className="mt-1 font-semibold text-amber-800">Thay đổi ở form chưa lưu; dòng trên là tình trạng trước khi lưu.</p>}
                </div>}
                <p className="mt-2 text-[11.5px] leading-5">
                  {supplierPriceConsentCurrent(supplier) ? "NCC đã xác nhận chia sẻ giá trong 180 ngày gần đây. Không tự gia hạn khi lưu sản phẩm." : "Chưa có xác nhận chia sẻ giá còn hiệu lực. Tích xác nhận riêng bên dưới khi muốn công khai giá."} Giá phải lớn hơn 0, chưa hết hạn; ảnh/catalogue, danh mục và hồ sơ NCC phải được Vexim duyệt, xuất bản. Nếu không, buyer sẽ thấy On request.
                </p>
                {!supplierPriceConsentCurrent(supplier) && <label className="mt-2.5 flex items-start gap-2 rounded-md bg-white p-2.5 text-[11.5px] font-medium text-brand-900 ring-1 ring-brand-200">
                  <input type="checkbox" name="confirm_supplier_price_consent" value="yes" disabled={locked} className="mt-0.5 size-4 shrink-0 accent-brand-700" />
                  Tôi đại diện NCC xác nhận đồng ý cho Vexim hiển thị công khai giá tham khảo của các sản phẩm tôi chọn công khai. Xác nhận có hiệu lực 180 ngày kể từ khi lưu; không phải báo giá chính thức. Chỉ ghi nhận khi tôi đồng thời chọn công khai giá cho sản phẩm này.
                </label>}
              </div>

              <div className="mx-4 mb-4 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-ink-50 px-3.5 py-2.5 text-[12.5px] text-ink-700 sm:mx-5">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="oem" value="yes" defaultChecked={product?.oem ?? false} disabled={locked} className="size-4 accent-brand-700" /> Nhận gia công/OEM</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="odm" value="yes" defaultChecked={product?.odm ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có dịch vụ thiết kế & sản xuất ODM</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="samples" value="yes" defaultChecked={product?.samples ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có thể gửi mẫu</label>
              </div>
            </div>

            <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
              <SectionHead step="Bước 1" title="Đặt hàng & năng lực" />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-3">
                {BASE_FIELDS.map(([key, label, placeholder, max]) => <Field key={key} label={label}>
                  <input className="input" name={key} maxLength={max} placeholder={placeholder} defaultValue={String(product?.[key] ?? "")} disabled={locked} />
                </Field>)}
              </div>
            </div>

            {stepError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-900">{stepError}</p>}
            {result && resultAt === "info" && <p role="status" className={`rounded-lg px-3.5 py-2.5 text-[13px] font-semibold ${result.ok ? "bg-brand-50 text-brand-900" : "bg-rose-50 text-rose-800"}`}>{result.message}</p>}
          </section>
        </form>

        <section data-step-panel={2} className={step === 2 ? "space-y-3" : "hidden"} aria-label="Bước 2 · Ảnh và catalogue" id="product-media">
          <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
            <SectionHead step="Bước 2" title="Ảnh & catalogue thực tế"
              hint="JPG, PNG, WebP tối đa 8 MB hoặc PDF tối đa 15 MB. Tệp chỉ để Vexim kiểm tra, không tự hiện trên trang buyer." />
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {media.length > 0
                ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{media.map((asset) => {
                  const url = privateMediaUrl(asset);
                  return <li key={asset.id} className="group relative overflow-hidden rounded-lg border border-ink-200 bg-white">
                    <div className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-ink-100 via-brand-50 to-ink-100">
                      {asset.kind === "image" && url
                        ? <img src={url} alt={`Ảnh ${asset.caption || product?.name || "sản phẩm"}`} loading="lazy" className="size-full object-cover" />
                        : <span className="flex size-full items-center justify-center text-brand-700"><FileText className="size-8" aria-hidden="true" /></span>}
                      <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${asset.audience === "buyer" ? "bg-emerald-100 text-emerald-800" : "bg-white/95 text-ink-700"}`}>
                        {asset.audience === "buyer" ? "Chia sẻ buyer" : "Nội bộ"}
                      </span>
                      {canUpload && asset.audience === "internal" && asset.created_by === userId &&
                        <button type="button" disabled={busy} onClick={() => void removeMedia(asset.id)} aria-label={`Xóa ${asset.caption || "tệp nháp"}`}
                          className="absolute top-2 right-2 rounded-full bg-white/95 p-1.5 text-rose-700 shadow-sm hover:bg-rose-50">
                          <X className="size-3.5" aria-hidden="true" />
                        </button>}
                    </div>
                    <div className="px-3 py-2">
                      <p className="truncate text-[12.5px] font-semibold text-ink-900">{asset.caption || (asset.kind === "image" ? "Ảnh sản phẩm" : "Catalogue")}</p>
                      {url && <a href={url} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-brand-700 underline">Xem tệp</a>}
                    </div>
                  </li>;
                })}</ul>
                : <p className="rounded-lg bg-ink-50 px-3.5 py-6 text-center text-[13px] text-ink-600">Chưa có tệp nào. Thêm ít nhất một ảnh hoặc catalogue thật để gửi Vexim duyệt.</p>}

              {canUpload ? <>
                <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFiles(Array.from(e.dataTransfer.files)); }}
                  className="rounded-lg border-2 border-dashed border-brand-200 bg-brand-50/40 px-4 py-6 text-center transition hover:border-brand-400 focus-within:border-brand-600">
                  <UploadCloud className="mx-auto size-8 text-brand-700" aria-hidden="true" />
                  <p className="mt-1.5 text-[13px] font-semibold text-ink-800">Kéo thả ảnh hoặc catalogue vào đây</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-500">hoặc chọn tệp từ thiết bị · {ownedCount}/12 tệp của bạn</p>
                  <label className="btn btn-soft relative mt-3 cursor-pointer">Chọn tệp
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" aria-label="Chọn ảnh sản phẩm hoặc catalogue"
                      onChange={(e) => { chooseFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
                </div>
                {selected.length > 0 && <div className="rounded-lg border border-brand-200 bg-brand-50 p-3.5">
                  <p className="text-[13px] font-semibold text-brand-900">Đã chọn {selected.length} tệp</p>
                  <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-auto text-[11.5px] text-brand-900">{selected.map((file, index) => <li key={`${file.name}-${index}`} className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</li>)}</ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={upload} className="btn btn-primary btn-sm"><UploadCloud className="size-4" aria-hidden="true" /> Tải {selected.length} tệp</button>
                    <button type="button" disabled={busy} onClick={() => setSelected([])} className="btn btn-ghost btn-sm">Bỏ chọn</button>
                  </div>
                </div>}
              </> : <p className="rounded-lg bg-ink-50 px-3.5 py-3 text-[12.5px] text-ink-600">
                {!product ? "Lưu thông tin sản phẩm trước để mở chức năng tải tệp." : dirty ? "Lưu thay đổi nội dung trước khi tải tệp để không mất phần đang nhập." : review === "approved" ? "Sản phẩm đã duyệt. Nếu cần thêm tệp, hãy lưu thay đổi nội dung trước; sản phẩm sẽ quay lại bản nháp." : "Tạm khóa tải tệp khi Vexim đang kiểm tra."}
              </p>}
              {(progress || uploadResult) && <p role="status" className={`text-[12.5px] font-semibold ${uploadResult && /không|quá|lỗi|tối đa/i.test(uploadResult) ? "text-rose-700" : "text-brand-800"}`}>{progress || uploadResult}</p>}
            </div>
          </div>
        </section>

        <section data-step-panel={3} className={step === 3 ? "space-y-3" : "hidden"} aria-label="Bước 3 · Xem lại và gửi" id="product-review">
          <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
            <SectionHead step="Bước 3" title="Xem lại toàn bộ hồ sơ"
              hint="Đọc lại đúng nội dung ở bước 1 và 2. Sửa được ngay tại đây, gửi xong mới chuyển cho Vexim." />
            <div className="space-y-3 px-4 py-4 sm:px-5">
              {dirty && <p className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900">
                Có thay đổi chưa lưu — nội dung dưới đây là bản đang nhập.
                <button type="button" onClick={() => leaveInfoFor(1)} className="underline">Lưu thay đổi</button>
              </p>}

              <ul className="grid gap-2 sm:grid-cols-3">
                {([[!!product, "Đã lưu sản phẩm"], [hasDetails, "Có mô tả/quy cách"], [hasMedia, "Có ảnh/catalogue"]] as const).map(([ready, label]) =>
                  <li key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold ${ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                    {ready ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="size-4 shrink-0" aria-hidden="true" />}
                    {label}
                  </li>)}
              </ul>

              {/* Bước 1 — nội dung */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title="Thông tin sản phẩm" onEdit={() => goToStep(1)} />
                <dl className="grid gap-x-4 gap-y-2 px-3.5 py-3 text-[12.5px] sm:grid-cols-2">
                  <div className="sm:col-span-2"><ReviewField label="Tên sản phẩm" value={snapshot.name} strong /></div>
                  <div><ReviewField label="Danh mục" value={categoryLabel} /></div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-semibold text-ink-500">Thông số theo nhóm hàng</dt>
                    {attributeRows.length
                      ? <dd className="mt-1 flex flex-wrap gap-1.5">{attributeRows.map(([label, value]) =>
                        <span key={label} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11.5px] text-ink-800"><strong className="font-semibold">{label}:</strong> {value}</span>)}</dd>
                      : <dd className="mt-0.5 text-[12.5px] text-ink-400">Chưa khai thông số</dd>}
                  </div>
                  <div className="sm:col-span-2"><ReviewField label="Mô tả ngắn" value={snapshot.description} /></div>
                  <div className="sm:col-span-2"><ReviewField label="Quy cách / tiêu chuẩn" value={snapshot.spec} /></div>
                  <div className="sm:col-span-2"><ReviewField label="Mô tả chi tiết" value={snapshot.description_detail} /></div>
                </dl>
              </div>

              {/* Bước 1 — thương mại & xuất khẩu */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title="Thông tin thương mại & xuất khẩu" onEdit={() => goToStep(1)} />
                <dl className="grid gap-x-4 gap-y-2 px-3.5 py-3 text-[12.5px] sm:grid-cols-2">
                  {REVIEW_COMMERCIAL.map(([key, label]) => <div key={key}><ReviewField label={label} value={snapshot[key]} /></div>)}
                </dl>
                <div className="flex flex-wrap gap-1.5 border-t border-ink-100 px-3.5 py-2.5">
                  {([
                    [snapshot.price_publicly_visible === "yes", "Công khai giá khi đủ điều kiện"],
                    [snapshot.oem === "yes", "Nhận gia công/OEM"],
                    [snapshot.odm === "yes", "Thiết kế & sản xuất ODM"],
                    [snapshot.samples === "yes", "Có thể gửi mẫu"],
                  ] as const).map(([on, label]) => <span key={label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-brand-50 text-brand-900 ring-1 ring-brand-200" : "bg-ink-100 text-ink-500 line-through"}`}>{label}</span>)}
                </div>
              </div>

              {/* Bước 1 — đặt hàng & năng lực */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title="Đặt hàng & năng lực" onEdit={() => goToStep(1)} />
                <dl className="grid gap-x-4 gap-y-2 px-3.5 py-3 text-[12.5px] sm:grid-cols-3">
                  {REVIEW_ORDER.map(([key, label]) => <div key={key}><ReviewField label={label} value={snapshot[key]} /></div>)}
                </dl>
              </div>

              {/* Bước 2 — ảnh & catalogue */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title={`Ảnh & catalogue (${media.length} tệp)`} onEdit={() => goToStep(2)} />
                <div className="px-3.5 py-3">
                  {media.length
                    ? <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {media.slice(0, 8).map((asset) => {
                        const url = privateMediaUrl(asset);
                        return <li key={asset.id} className="relative overflow-hidden rounded-md border border-ink-200 bg-ink-50">
                          <span className="block aspect-square">
                            {asset.kind === "image" && url
                              ? <img src={url} alt={asset.caption || "Ảnh sản phẩm"} className="size-full object-cover" />
                              : <span className="flex size-full items-center justify-center text-brand-700"><FileText className="size-6" aria-hidden="true" /></span>}
                          </span>
                          <span className={`absolute bottom-1 left-1 rounded px-1 py-0.5 text-[9.5px] font-bold ${asset.audience === "buyer" ? "bg-emerald-100 text-emerald-800" : "bg-white/95 text-ink-600"}`}>
                            {asset.audience === "buyer" ? "Buyer" : "Nội bộ"}
                          </span>
                        </li>;
                      })}
                    </ul>
                    : <p className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">Chưa có tệp. Quay lại bước 2 để tải ảnh hoặc catalogue thật.</p>}
                  {media.length > 8 && <p className="mt-1.5 text-[11px] text-ink-500">và {media.length - 8} tệp khác — xem đủ ở bước 2.</p>}
                </div>
              </div>

              {sent || review === "pending"
                ? <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] font-semibold text-emerald-900">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">Đã gửi hồ sơ. Vexim sẽ kiểm tra và phản hồi; sản phẩm chưa tự công khai.</span>
                  <Link href="/supplier/portal/products" className="underline">Về danh sách</Link>
                </div>
                : review === "approved"
                  ? <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-800"><Check className="size-4" aria-hidden="true" /> Nội dung đã được Vexim duyệt</p>
                  : <div className="space-y-2">
                    <button type="button" onClick={requestSubmit} disabled={busy}
                      aria-describedby="submit-blockers"
                      className="btn btn-primary w-full justify-center sm:w-auto">
                      {busy
                        ? <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> Đang gửi hồ sơ…</>
                        : <><Send className="size-4" aria-hidden="true" /> Gửi hồ sơ cho Vexim kiểm tra</>}
                    </button>
                    <div id="submit-blockers" aria-live="polite">
                      {submitHint?.length
                        ? <ul role="alert" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
                          {submitHint.map((hint) => <li key={hint} className="flex gap-1.5"><AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{hint}</li>)}
                        </ul>
                        : canSubmit
                          ? <p className="text-[12px] text-ink-600">Hồ sơ đủ điều kiện. Gửi không tự duyệt, không tự chia sẻ buyer.</p>
                          : submitBlockers().length
                            ? <ul className="space-y-1 text-[12px] text-ink-600">
                              {submitBlockers().map((hint) => <li key={hint} className="flex gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />{hint}</li>)}
                            </ul>
                            : null}
                    </div>
                  </div>}
              {result && resultAt === "review" && !result.ok && <p role="status" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-800">{result.message}</p>}
              <p className="text-[11.5px] leading-5 text-ink-500">Bản dịch tiếng Anh cho trang buyer: {product?.name_i18n?.en?.trim() ? "đã có bản dịch do AI soạn và Vexim kiểm tra." : "Vexim sẽ dịch tự động bằng AI khi kiểm tra sản phẩm này."} Bạn cứ nhập nội dung bằng tiếng Việt.</p>
            </div>
          </div>
        </section>

        {step === 2 && stepError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-900">{stepError}</p>}

        {/* Thanh điều hướng dính đáy màn hình: luôn thấy nút Trở về / Tiếp tục. */}
        <div className="sticky bottom-0 z-20 mt-3 flex items-center gap-2 rounded-xl border border-ink-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
          {step === 1
            ? <Link href="/supplier/portal/products" className="btn btn-ghost btn-sm"><ArrowLeft className="size-3.5" aria-hidden="true" /> Hủy</Link>
            : <button type="button" onClick={() => goToStep((step - 1) as Step)} className="btn btn-ghost btn-sm"><ArrowLeft className="size-3.5" aria-hidden="true" /> Trở về bước {step - 1}</button>}

          <span className="hidden min-w-0 flex-1 truncate px-1 text-[11.5px] text-ink-500 sm:block">
            {step === 1 ? (dirty ? "Có thay đổi chưa lưu" : product ? "Thông tin đã lưu" : "Chưa lưu sản phẩm")
              : step === 2 ? `${media.length} tệp đã tải`
                : review === "pending" ? "Đang chờ Vexim kiểm tra" : "Kiểm tra lần cuối rồi gửi"}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {step === 1 && !locked && product && dirty &&
              <button type="submit" form="product-info" onClick={() => { advanceTo.current = null; }} disabled={busy}
                className="btn btn-ghost btn-sm"><Save className="size-3.5" aria-hidden="true" /> Lưu nháp</button>}
            {step === 1 && (locked
              ? <button type="button" onClick={() => goToStep(2)} className="btn btn-primary btn-sm">Xem tệp <ArrowRight className="size-3.5" aria-hidden="true" /></button>
              : product && !dirty
                ? <button type="button" onClick={() => leaveInfoFor(2)} className="btn btn-primary btn-sm">Tiếp tục <ArrowRight className="size-3.5" aria-hidden="true" /></button>
                : <button type="submit" form="product-info" onClick={() => { advanceTo.current = 2; }} disabled={busy}
                  className="btn btn-primary btn-sm">{busy ? "Đang lưu..." : "Lưu & tiếp tục"} <ArrowRight className="size-3.5" aria-hidden="true" /></button>)}
            {step === 2 && <button type="button" onClick={() => goToStep(3)} className="btn btn-primary btn-sm">Sang bước 3 <ArrowRight className="size-3.5" aria-hidden="true" /></button>}
            {step === 3 && (review === "pending" || review === "approved" || sent
              ? <span className="text-[11.5px] font-semibold text-emerald-800">{review === "approved" ? "Đã duyệt" : "Đã gửi · chờ Vexim"}</span>
              : <button type="button" onClick={requestSubmit} disabled={busy} className="btn btn-primary btn-sm">
                {busy
                  ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> Đang gửi…</>
                  : <><Send className="size-3.5" aria-hidden="true" /> Gửi hồ sơ</>}
              </button>)}
          </div>
        </div>
      </div>

      {/* Cột phải: thẻ xem nhanh — thương mại & xuất khẩu đọc được ngay, kể cả khi cuộn. */}
      <aside className="space-y-3 lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="relative aspect-[16/9] bg-gradient-to-br from-ink-100 via-brand-50 to-ink-100">
            {coverUrl
              ? <img src={coverUrl} alt="" className="size-full object-cover" />
              : <span className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-400"><ImageIcon className="size-8 stroke-1" aria-hidden="true" /><span className="text-[11px] font-semibold">Chưa có ảnh</span></span>}
            <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${status.tone}`}>{status.label}</span>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-[10.5px] font-bold tracking-wider text-brand-700 uppercase">{categoryLabel}</p>
            <h2 className="mt-0.5 line-clamp-2 text-[13.5px] font-black text-ink-900">{product?.name ?? "Sản phẩm mới"}</h2>
            <dl className="mt-2.5 space-y-1 border-t border-ink-100 pt-2.5 text-[11.5px]">
              {commercial.map((row) => <div key={row.label} className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-ink-500">{row.label}</dt>
                <dd className="min-w-0 truncate text-right font-semibold text-ink-800">{row.value}</dd>
              </div>)}
            </dl>
            <p className="mt-2 text-[10.5px] leading-4 text-ink-500">Số liệu lấy từ bản đã lưu{dirty ? "; thay đổi đang nhập chưa hiển thị ở đây." : "."}</p>
          </div>
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Luồng duyệt</p>
          <ol className="mt-2 space-y-1.5 text-[11.5px] leading-4 text-ink-600">
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">1.</span>Bạn lưu thông tin và tải tệp thật.</li>
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">2.</span>Gửi Vexim kiểm tra nội dung.</li>
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">3.</span>Vexim chọn tệp chia sẻ buyer và bật sẵn sàng.</li>
          </ol>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-500"><LockKeyhole className="mt-0.5 size-3 shrink-0" aria-hidden="true" />Tệp của bạn ở chế độ nội bộ cho tới khi Vexim chọn chia sẻ.</p>
        </div>

        <Link href="/supplier/portal/products" className="flex items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-800">
          Danh sách sản phẩm <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </aside>
    </div>
  </div>;
}

function SectionHead({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-1 border-b border-ink-100 px-4 py-3 sm:px-5">
    <div className="min-w-0">
      <p className="text-[10px] font-bold tracking-[0.14em] text-brand-700 uppercase">{step}</p>
      <h2 className="text-[15px] font-black text-ink-900">{title}</h2>
    </div>
    {hint && <p className="max-w-md text-[11.5px] leading-4 text-ink-500">{hint}</p>}
  </div>;
}

function ReviewHead({ title, onEdit }: { title: string; onEdit: () => void }) {
  return <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3.5 py-2">
    <h3 className="text-[12px] font-bold tracking-wide text-ink-800 uppercase">{title}</h3>
    <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold text-brand-800 hover:bg-brand-50">
      <Pencil className="size-3" aria-hidden="true" /> Sửa
    </button>
  </div>;
}

function ReviewField({ label, value, strong }: { label: string; value?: string; strong?: boolean }) {
  const shown = value?.trim();
  return <div className="min-w-0">
    <dt className="text-[11px] font-semibold text-ink-500">{label}</dt>
    <dd className={`mt-0.5 break-words whitespace-pre-wrap ${strong ? "text-[13px] font-bold text-ink-900" : "text-[12.5px] text-ink-800"} ${shown ? "" : "text-ink-400"}`}>{shown || "Chưa nhập"}</dd>
  </div>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-[12.5px]">
    <span className="mb-1 block font-semibold text-ink-800">{label}{required && " *"}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] leading-4 text-ink-500">{hint}</span>}
  </label>;
}

function ClockIcon() { return <span className="size-2.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />; }
