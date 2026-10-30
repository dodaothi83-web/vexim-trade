"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  EyeOff,
  FileText,
  ImageIcon,
  LockKeyhole,
  Pencil,
  Save,
  Send,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type { MediaAsset, SupplierProduct, Supplier } from "@/lib/types";
import { productPriceBlockers, supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { PRODUCT_STATUS, privateMediaUrl, productCanSubmit, productReview } from "@/lib/supplier-portal/product-view";
import { deleteSupplierDraftProductAction, pauseSupplierProductAction, saveSupplierProductAction, submitSupplierProductAction } from "../product-actions";
import { useToast } from "@/components/toast";
import { SupplierAttributeInputs } from "@/components/supplier-attribute-inputs";
import { RawMaterialRegionInput } from "@/components/raw-material-region-input";
import { ProductDescriptionEditor } from "@/components/products/product-description-editor";
import { ProductDescriptionPreview } from "@/components/products/product-description-preview";
import { QuantityPricingInline } from "@/components/products/quantity-pricing-inline";
import { QuantityBuyerPreview, QuantityPricingEditor } from "@/components/products/quantity-pricing-editor";
import { nameContainsGrade, validateQuantityPricing, type QuantityPricingInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import { displayUnitsForCategory } from "@/lib/public/price-units";
import type { QuantityEditorData } from "@/lib/products/quantity-editor-data";
import { productCompleteness } from "@/lib/products/completeness";
import {
  LEAD_TIME_UNIT_OPTIONS,
  categoryMarketPriceUnit,
  formatGradeRowPriceVi,
  formatLeadTimeVi,
  formatProductMoqVi,
  isGradeFieldKey,
  nonGradeProductFields,
  readProductLeadTime,
  standardGradesForCategory,
  type LeadTimeUnit,
} from "@/lib/products/grade-pricing";
import { effectiveFieldsFor, fieldsFor, supplierFieldsFor } from "@/lib/product-attributes";

type EditorProps = {
  product?: SupplierProduct;
  quantityEditor?: QuantityEditorData | null;
  quantityPolicies?: Record<string, QuantityPricingPolicy> | null;
  media?: MediaAsset[];
  userId?: string;
  categories: CategoryProposalOption[];
  /** Nhóm hàng đã đăng ký chỉ dùng để cảnh báo, không giới hạn lựa chọn. */
  categoryScope?: string[];
  supplier: Supplier;
  /** Trang có thể mở thẳng một bước bằng `?step=2` (sau khi tạo sản phẩm mới). */
  initialStep?: Step;
};

type Step = 1 | 2 | 3;

const STEPS: { step: Step; title: string; short: string; hint: string }[] = [
  { step: 1, title: "Thông tin sản phẩm", short: "Thông tin", hint: "Tên, quy cách, thương mại" },
  { step: 2, title: "Ảnh và catalogue", short: "Hình ảnh", hint: "Ảnh và tài liệu thật" },
  { step: 3, title: "Xem lại và gửi", short: "Xem lại", hint: "Đọc lại rồi gửi duyệt" },
];

const BASE_FIELDS = [
  ["monthly_capacity", "Năng lực mỗi tháng", "Ví dụ: 200 tấn/tháng", 180],
  ["packaging", "Bao bì / đóng gói", "Ví dụ: túi hút chân không 25 kg", 300],
] as const;

// Chứng nhận không khai ở đây: hồ sơ Giấy tờ L1 là nguồn duy nhất (AI quét đơn vị đứng tên
// và ngày hết hạn), nên sản phẩm không có ô tự khai để tránh tạo cảm giác được xác minh.
const EXPORT_FIELDS = [
  ["export_port", "Cảng xuất", "Ví dụ: Cát Lái", 120],
  ["incoterm_place", "Địa điểm Incoterm", "Ví dụ: Hồ Chí Minh", 100],
] as const;

/** Nhóm trường hiển thị ở bước 3 để NCC đọc lại đúng những gì đã nhập ở bước 1. */
const REVIEW_COMMERCIAL = [
  ["lead_time_days", "Thời gian giao hàng"],
  ["payment_terms", "Điều kiện thanh toán"],
  ["export_port", "Cảng xuất"],
  ["incoterm_place", "Địa điểm Incoterm"],
] as const;

const REVIEW_ORDER = [
  ["monthly_capacity", "Năng lực mỗi tháng"],
  ["packaging", "Bao bì / đóng gói"],
] as const;

/** Sản phẩm mới được chọn sẵn; sản phẩm đã lưu giữ nguyên lựa chọn hiện có, kể cả bản ghi cũ thiếu cờ. */
function priceOptInDefault(product?: SupplierProduct): boolean {
  return product ? product.price_publicly_visible === true : true;
}

/** Giá trị khởi tạo của bản xem lại: lấy từ bản đã lưu, rồi cập nhật theo từng lần nhập. */
function snapshotFrom(product?: SupplierProduct): Record<string, string> {
  const lt = product ? readProductLeadTime(product) : { value: null, unit: "days" as LeadTimeUnit, daysEquivalent: null };
  const seed: Record<string, string> = {
    name: product?.name ?? "",
    description: product?.description ?? "",
    spec: product?.spec ?? "",
    description_detail: product?.description_detail ?? "",
    raw_material_region: product?.raw_material_region ?? "",
    input_material_origin: product?.input_material_origin ?? "",
    lead_time_value: lt.value != null ? String(lt.value) : "",
    lead_time_unit: lt.unit,
  };
  for (const [key] of [...REVIEW_COMMERCIAL, ...REVIEW_ORDER]) {
    const value = product ? (product as unknown as Record<string, unknown>)[key] : "";
    seed[key] = value == null ? "" : String(value);
  }
  seed.lead_time_days = lt.daysEquivalent != null ? String(lt.daysEquivalent) : "";
  seed.oem = product?.oem ? "yes" : "";
  seed.odm = product?.odm ? "yes" : "";
  seed.samples = product?.samples ? "yes" : "";
  seed.price_publicly_visible = priceOptInDefault(product) ? "yes" : "";
  return seed;
}

const checkKeys = ["oem", "odm", "samples", "price_publicly_visible"] as const;

/**
 * So sánh hai bản nháp. Dirty được tính từ so sánh trực tiếp thay vì cờ setDirty
 * để event change ảo (tiptap, autofill, framework re-mount input) không kẹt cờ.
 */
function snapshotsEqual(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/**
 * Báo lỗi hành động ra console + toast. Trước đây mọi lỗi đều hiện chung
 * "Không kết nối được máy chủ" nên không phân biệt được: mất mạng, tab còn mở
 * từ trước bản cập nhật (action ID cũ → HTTP 400), hay lỗi máy chủ (HTTP 500).
 * Console giữ vết đầy đủ (kể cả digest) để chẩn đoán; toast nêu rõ hành động hỏng.
 */
function reportActionError(error: unknown, what: string) {
  console.error(`[supplier-product] ${what} thất bại:`, error);
  const detail = error instanceof Error && error.message ? error.message.trim() : "";
  if (detail && !/failed to fetch|fetch failed|networkerror/i.test(detail))
    return { ok: false, message: `${what} thất bại: ${detail}` };
  return { ok: false, message: `${what} thất bại - mất kết nối hoặc trang đã cũ sau bản cập nhật. Tải lại trang (F5) rồi thử lại.` };
}

/**
 * Đọc toàn bộ form thành bản nháp để bước 3 luôn khớp với những gì đang nhập.
 *
 * Luôn nhận phần tử form đã lấy sẵn: React dọn `event.currentTarget` về null ngay sau
 * khi handler chạy, nên không được đọc nó bên trong state updater hay sau `await`.
 */
export function snapshotFromForm(form: HTMLFormElement | null, previous: Record<string, string>): Record<string, string> {
  if (!form) return previous;
  const data = new FormData(form);
  const next: Record<string, string> = { ...previous };
  const present = new Set<string>();
  data.forEach((value, key) => {
    if (typeof value !== "string") return;
    next[key] = value;
    present.add(key);
  });
  for (const key of checkKeys) if (form.querySelector(`[name="${key}"]`) && !present.has(key)) next[key] = "";
  return next;
}

/** Ô bắt buộc đầu tiên còn trống/sai trong một bước (bỏ qua ô đã khoá và ô ẩn). */
function firstInvalidField(form: HTMLFormElement | null, step: Step): HTMLElement | null {
  const panel = form?.querySelector(`[data-step-panel="${step}"]`);
  if (!panel) return null;
  for (const element of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
    if (element.form !== form || element.disabled || (element instanceof HTMLInputElement && element.type === "hidden")) continue;
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
export function SupplierProductEditor({ product, quantityEditor, quantityPolicies, media = [], userId, categories, categoryScope = [], supplier, initialStep = 1 }: EditorProps) {
  const router = useRouter();
  const globalToast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  // Bước sẽ mở sau khi lưu thành công; null = chỉ lưu rồi ở lại.
  const advanceTo = useRef<Step | null>(null);
  const creationRequestId = useRef<string | null>(null);
  const [quantityConsent, setQuantityConsent] = useState(false);

  const [step, setStep] = useState<Step>(initialStep);
  const [busy, setBusy] = useState(false);
  const [quantityPreview, setQuantityPreview] = useState<QuantityPricingInput | null>(() => quantityEditor ? {
    grade: quantityEditor.grade, incoterm: quantityEditor.incoterm, currency: quantityEditor.currency,
    nameVi: quantityEditor.nameVi, nameEn: quantityEditor.nameEn, tiers: quantityEditor.tiers,
  } : !product ? { grade: "", incoterm: "", currency: "USD", nameVi: "", nameEn: "",
    tiers: [{ minKg: "", priceUsdPerKg: "", incoterm: "" }] } : null);
  const [selectedCategory, setSelectedCategory] = useState(product?.reviewed_category_slug ?? product?.supplier_category_proposal ?? product?.category ?? "");
  const initialLeadTime = product ? readProductLeadTime(product) : { value: null, unit: "days" as LeadTimeUnit, daysEquivalent: null };
  const [leadTimeValue, setLeadTimeValue] = useState<string>(() => (initialLeadTime.value != null ? String(initialLeadTime.value) : ""));
  const [leadTimeUnit, setLeadTimeUnit] = useState<LeadTimeUnit>(() => initialLeadTime.unit);
  const [showGradeErrors, setShowGradeErrors] = useState(false);
  // Thông báo nổi sau mỗi hành động (lưu, gửi duyệt, tải/xóa tệp) thay cho các dòng chữ tĩnh khó để ý.
  const [toast, setToast] = useState<{ ok: boolean; message: string; warning?: boolean } | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [coverHover, setCoverHover] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  // Bản nháp dùng cho bước 3: cập nhật theo từng lần nhập nên NCC đọc lại đúng nội dung
  // đang có, kể cả phần chưa lưu (kèm cảnh báo phải lưu trước khi gửi).
  const [snapshot, setSnapshot] = useState<Record<string, string>>(() =>
    snapshotFrom(product),
  );
  const [submitHint, setSubmitHint] = useState<string[] | null>(null);
  const [sent, setSent] = useState(false);
  // Mốc "đã lưu": gieo một lần sau khi mount, cập nhật sau mỗi lần lưu thành công.
  // dirty suy ra từ snapshot so với mốc nên sự kiện change ảo không thể làm cờ kẹt true.
  const [baseline, setBaseline] = useState<Record<string, string> | null>(null);
  const baselineSeeded = useRef(false);
  useEffect(() => {
    if (baselineSeeded.current) return;
    baselineSeeded.current = true;
    const initial = snapshotFromForm(formRef.current, snapshotFrom(product));
    setSnapshot(initial);
    setBaseline(initial);
  }, []);

  // Thông báo tự ẩn: thành công 4.5 giây, lỗi ở lại 8 giây để kịp đọc.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.ok && !toast.warning ? 4500 : 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const review = product ? productReview(product) : "draft";
  const live = review === "approved" && product?.ready_for_buyer === true;
  const legacyManaged = review === "approved" && !!product && !product.supplier_originated && !product.supplier_category_proposal;
  const locked = review === "pending" || legacyManaged;
  const dirty = baseline !== null && !snapshotsEqual(snapshot, baseline);
  const ownedCount = media.filter((m) => m.created_by === userId).length;
  const imageCount = media.filter((m) => m.kind === "image").length;
  const hasDetails = !!product && !!(product.spec?.trim() || product.description?.trim());
  const hasMedia = media.some((m) => m.kind === "image" && !!m.storage_path && m.supplier_id === product?.supplier_id);
  const canSubmit = !!product && productCanSubmit(product, media) && !dirty;
  const canUpload = !!product && !locked && !dirty &&
    (!["approved", "paused"].includes(review) || product.supplier_originated === true);
  const canDeleteAsset = (asset: MediaAsset) => canUpload && !!userId && asset.created_by === userId &&
    (asset.audience === "internal" || review === "approved" || review === "paused" || review === "changes_requested");
  const canDeleteDraft = !!product && review === "draft" && product.supplier_originated === true &&
    !product.ready_for_buyer && product.reviewed_category_slug == null;
  const categoryLocked = review === "approved" || (review === "paused" && !!product?.reviewed_category_slug);
  const activeCategorySlug = selectedCategory || product?.category || "";
  const activeCategory = categories.find((c) => c.slug === activeCategorySlug);
  const activeCategorySource = activeCategory ?? (activeCategorySlug ? { slug: activeCategorySlug } : null);
  const newPolicy = !product && activeCategory ? quantityPolicies?.[activeCategory.slug] : undefined;
  const newGrades = standardGradesForCategory(activeCategorySource);
  const newBuyerUnit = displayUnitsForCategory(activeCategorySlug, activeCategory?.price_unit).primary === "mt" ? "mt" : "kg";
  const newQuantity = !product && quantityPreview ? { ...quantityPreview, nameVi: snapshot.name ?? "" } : null;
  const nameGradeError = showGradeErrors && newQuantity
    ? newGrades.find((grade) => nameContainsGrade(snapshot.name ?? "", [grade])) : undefined;
  const unitMeta = categoryMarketPriceUnit(activeCategorySlug, activeCategory?.price_unit);
  const categoryLabel = activeCategory?.label ?? product?.category ?? "Chưa chọn danh mục";
  const officialAttributeFields = nonGradeProductFields(fieldsFor(activeCategory));
  const supplierAttributeFields = nonGradeProductFields(supplierFieldsFor(activeCategory));
  // Bước 3 đọc lại thông số bằng nhãn thật (kể cả thông số NCC tự thêm), bỏ qua trường grade đã nằm ở bảng Grade & giá.
  const attributeLabels = new Map(
    nonGradeProductFields(effectiveFieldsFor(activeCategory)).map((field) => [field.key, field.label]),
  );
  const attributeRows = (() => {
    const rows = new Map<string, string>();
    for (const [key, label] of attributeLabels) {
      const value = String(snapshot[`attribute:${key}`] ?? product?.specs?.[key] ?? "").trim();
      if (value) rows.set(label, value);
    }
    // Giá trị cũ chưa thuộc trường nào vẫn phải đọc lại được, không giấu khỏi NCC.
    for (const [key, value] of Object.entries(product?.specs ?? {})) {
      if (isGradeFieldKey(key) || key === "grade_rows" || attributeLabels.has(key) || typeof value !== "string" || !value.trim()) continue;
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

  /**
   * Ghi lại nội dung form mỗi khi NCC sửa để bước 3 phản chiếu ngay.
   *
   * Đọc form qua ref chứ không qua `event.currentTarget`: React dọn `currentTarget` về
   * null ngay sau handler, còn state updater chạy sau đó - đọc event trong updater sẽ
   * làm `new FormData(null)` ném lỗi mỗi lần gõ phím.
   */
  function onFormChange() {
    const form = formRef.current;
    setSnapshot((previous) => snapshotFromForm(form, previous));
  }

  function onDescriptionDetailChange(html: string) {
    setSnapshot((previous) => ({ ...previous, description_detail: html }));
  }

  /**
   * Ô ẩn attribute_pool và các ô attribute:* đổi giá trị DOM sau event change, và flow
   * "Thêm giá trị mới" chỉ là nút type="button" (không có event change của form) —
   * nên component thông số báo trực tiếp để snapshot luôn khớp form thật.
   */
  const onAttributesCommit = useCallback((poolJson: string, draft: Record<string, string>) => {
    setSnapshot((previous) => {
      const next: Record<string, string> = { ...previous, attribute_pool: poolJson };
      for (const [key, value] of Object.entries(draft)) next[`attribute:${key}`] = value;
      return next;
    });
  }, []);

  const computedLeadTimeDays = (() => {
    if (leadTimeUnit === "on_request") return "";
    const trimmed = leadTimeValue.trim();
    if (!/^\d+$/.test(trimmed)) return "";
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num <= 0) return "";
    return String(leadTimeUnit === "weeks" ? num * 7 : num);
  })();

  function updateLeadTime(nextValue: string, nextUnit: LeadTimeUnit) {
    const cleanValue = nextUnit === "on_request" ? "" : nextValue;
    const days = (() => {
      if (nextUnit === "on_request") return "";
      const trimmed = cleanValue.trim();
      if (!/^\d+$/.test(trimmed)) return "";
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num <= 0) return "";
      return String(nextUnit === "weeks" ? num * 7 : num);
    })();
    setLeadTimeValue(cleanValue);
    setLeadTimeUnit(nextUnit);
    setSnapshot((previous) => ({
      ...previous,
      lead_time_value: cleanValue,
      lead_time_unit: nextUnit,
      lead_time_days: days,
    }));
  }

  function onCategorySelect(nextSlug: string) {
    setSelectedCategory(nextSlug);
    if (!product) {
      setQuantityPreview((previous) => previous ? { ...previous, grade: "" } : previous);
      setQuantityConsent(false);
    }
    setSnapshot((previous) => ({ ...previous, supplier_category_proposal: nextSlug }));
  }

  function onNewQuantityChange(value: QuantityPricingInput) {
    setQuantityPreview(value);
    setQuantityConsent(false);
    setSnapshot((previous) => ({ ...previous, quantity_draft: JSON.stringify(value) }));
  }

  function validateCurrentGradeRows(): string | null {
    if (!product) {
      if (!newPolicy || !newQuantity) return "Chọn danh mục và kiểm tra kết nối cấu hình bảng giá mới.";
      const validation = validateQuantityPricing(newQuantity, newGrades, newPolicy);
      if (!validation.value) return validation.errors[0]?.message ?? "Kiểm tra bảng giá theo số lượng.";
      if (snapshot.price_publicly_visible === "yes" && !quantityConsent) return "Hãy xác nhận cam kết giá trước khi công khai.";
      return null;
    }
    return null;
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
    const formElement = event.currentTarget;
    const target = advanceTo.current;
    advanceTo.current = null;
    const gradeError = validateCurrentGradeRows();
    if (gradeError) {
      setShowGradeErrors(true);
      setStepError(gradeError);
      setToast({ ok: false, message: gradeError });
      if (typeof document !== "undefined") {
        document.getElementById("new-quantity-pricing")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    const precheckForm = new FormData(formElement);
    if (!supplierPriceConsentCurrent(supplier) && precheckForm.get("price_publicly_visible") === "yes" && precheckForm.get("confirm_supplier_price_consent") !== "yes") {
      const consentMsg = "Bật công khai giá cần tick đồng ý chia sẻ giá tham khảo.";
      setStepError(consentMsg);
      setToast({ ok: false, message: consentMsg });
      formElement.querySelector<HTMLInputElement>('input[name="confirm_supplier_price_consent"]')?.focus();
      return;
    }
    setBusy(true);
    setToast(null);
    setStepError(null);
    try {
      const form = new FormData(formElement);
      if (product) {
        form.set("product_id", product.id);
      } else if (newQuantity) {
        creationRequestId.current ??= crypto.randomUUID();
        form.set("quantity_creation_request_id", creationRequestId.current);
        form.set("quantity_grade", newQuantity.grade);
        form.set("quantity_incoterm", newQuantity.incoterm);
        form.set("quantity_currency", newQuantity.currency ?? "USD");
        form.set("quantity_tiers_json", JSON.stringify(newQuantity.tiers));
        if (quantityConsent) form.set("confirm_quantity_price_consent", "yes");
      }
      const response = await saveSupplierProductAction(form);
      setToast(response);
      if (!response.ok) return;
      setShowGradeErrors(false);
      setSubmitHint(null);
      const saved = snapshotFromForm(formElement, snapshot);
      setSnapshot(saved);
      setBaseline(saved);
      const id = response.id ?? product?.id;
      if (!product) {
        // Sản phẩm mới: đi tiếp sang trang chi tiết, mở đúng bước vừa chọn.
        router.push(`${detailUrl(id ?? "")}${target ? `?step=${target}` : ""}`);
        return;
      }
      router.refresh();
      if (target) goToStep(target);
    } catch (error) {
      setToast(reportActionError(error, "Lưu sản phẩm"));
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
    const gradeError = validateCurrentGradeRows();
    if (gradeError) {
      setShowGradeErrors(true);
      setStepError(gradeError);
      if (typeof document !== "undefined") {
        document.getElementById("new-quantity-pricing")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
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
      else { setStepError("Lưu thông tin sản phẩm trước khi gửi duyệt."); }
      return;
    }
    if (step === 1 && target > 1) { leaveInfoFor(target); return; }
    goToStep(target);
  }

  /** Danh sách việc còn thiếu trước khi gửi - dùng cho cả nút bấm và khối nhắc. */
  function submitBlockers(): string[] {
    const blockers: string[] = [];
    if (!product) blockers.push("Lưu sản phẩm ở bước 1 trước khi gửi.");
    if (!hasDetails) blockers.push("Bổ sung mô tả hoặc quy cách ở bước 1.");
    if (!hasMedia) blockers.push("Tải ít nhất một ảnh sản phẩm ở bước 2.");
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
      setToast(null);
      // Đưa tới đúng bước cần sửa; nếu đang ở đúng bước đó thì chỉ hiện lời nhắc.
      if (!product || !hasDetails || dirty) {
        if (step !== 1) goToStep(1);
        return;
      }
      if (!hasMedia && step !== 2) goToStep(2);
      return;
    }
    void submit();
  }

  async function submit() {
    if (!product || busy) return;
    setBusy(true);
    setSubmitHint(null);
    setToast(null);
    setStepError(null);
    try {
      const form = new FormData();
      form.set("product_id", product.id);
      const response = await submitSupplierProductAction(form);
      setToast(response);
      if (response.ok) {
        setSent(true);
        router.refresh();
      }
    } catch (error) {
      setToast(reportActionError(error, "Gửi duyệt"));
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
    if (imageCount + files.filter((file) => uploadKind(file) === "image").length > 8) {
      setToast({ ok: false, message: `Tối đa 8 ảnh sản phẩm; hiện có ${imageCount} ảnh.` });
      setSelected([]);
      return;
    }
    if (ownedCount + files.length > 12) {
      setToast({ ok: false, message: `Chỉ được tải tối đa 12 tệp; hiện bạn đã có ${ownedCount} tệp.` });
      setSelected([]);
      return;
    }
    const invalid = files.find((file) => !uploadKind(file) || file.size > (uploadKind(file) === "catalogue" ? 15 : 8) * 1024 * 1024);
    if (invalid) {
      setToast({ ok: false, message: `Tệp “${invalid.name}” không đúng định dạng hoặc quá dung lượng. Ảnh tối đa 8 MB, PDF tối đa 15 MB.` });
      setSelected([]);
      return;
    }
    setSelected(files);
  }
  async function upload() {
    if (!product || !canUpload || !selected.length) return;
    setBusy(true);
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
        // Trang lỗi (404/413/500...) trả HTML: đọc .json() sẽ ném — bắt lại để giữ mã HTTP thật.
        const data = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
        if (!response.ok || !data?.ok) throw Error(data?.message || `Không tải được tệp (HTTP ${response.status}).`);
        uploaded++;
      }
      setSelected([]);
      setToast({ ok: true, message: live
        ? `Đã tải ${uploaded} tệp lên sản phẩm đã đăng.`
        : `Đã tải ${uploaded} tệp. Tệp sẽ được kiểm tra khi duyệt.` });
    } catch (error) {
      if (uploaded) setSelected(selected.slice(uploaded));
      const failure = reportActionError(error, "Tải tệp");
      setToast({ ok: false, message: `${uploaded ? `Đã tải ${uploaded} tệp; chỉ còn tệp chưa hoàn tất trong danh sách chọn. ` : ""}${failure.message}` });
    } finally {
      setProgress("");
      setBusy(false);
      if (uploaded) router.refresh();
    }
  }
  /** Kéo ảnh khác vào ô ảnh đại diện (hoặc bấm nút sao) để thay; ảnh cũ tự về lại danh sách. */
  async function makeCover(mediaId: string) {
    if (!product || busy || mediaId === cover?.id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/supplier-portal/products/${product.id}/media`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ media_id: mediaId }),
      });
      // Ưu tiên lý do API trả về; proxy có thể trả HTML thay vì JSON.
      const data = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        setToast({ ok: false, message: data?.message || `Đặt ảnh đại diện thất bại (HTTP ${response.status}). Tải lại trang rồi thử lại.` });
        return;
      }
      setToast({ ok: true, message: data.message || "Đã cập nhật ảnh đại diện." });
      router.refresh();
    } catch (error) {
      setToast(reportActionError(error, "Đặt ảnh đại diện"));
    } finally {
      setBusy(false);
    }
  }
  async function removeMedia(mediaId: string) {
    if (!product || busy || !canUpload || !window.confirm(live
      ? "Xóa tệp này khỏi sản phẩm đang trên sàn? Không thể hoàn tác."
      : "Xóa tệp này khỏi sản phẩm? Không thể hoàn tác.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/supplier-portal/products/${product.id}/media?media_id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { ok?: boolean; message?: string; warning?: boolean } | null;
      if (!response.ok || !data?.ok) {
        setToast({ ok: false, message: data?.message || `Xóa tệp thất bại (HTTP ${response.status}). Tải lại trang rồi thử lại.` });
        return;
      }
      setToast({ ok: true, warning: data.warning, message: data.message || "Đã xóa tệp khỏi sản phẩm." });
      router.refresh();
    } catch (error) {
      setToast(reportActionError(error, "Xóa tệp"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!product || busy || dirty || !canDeleteDraft || !window.confirm(
      `Xóa vĩnh viễn bản nháp “${product.name}” và các tệp của sản phẩm? Không thể hoàn tác. Sản phẩm có dữ liệu liên quan sẽ không được xóa.`,
    )) return;
    setBusy(true);
    try {
      const response = await deleteSupplierDraftProductAction(product.id);
      if (!response.ok) { setToast(response); return; }
      globalToast.push({ kind: response.warning ? "info" : "success", title: response.message,
        ...(response.warning ? { lines: ["Tệp còn lại đã được ghi nhận để kiểm tra.", "Vui lòng liên hệ bộ phận hỗ trợ để hoàn tất."] } : {}) });
      router.push("/supplier/portal/products");
      router.refresh();
    } catch (error) {
      setToast(reportActionError(error, "Xóa bản nháp"));
    } finally { setBusy(false); }
  }

  async function pauseProduct() {
    if (!product || busy || dirty || review !== "approved" || !window.confirm(
      `Tạm ẩn “${product.name}” khỏi người mua? Sản phẩm và lịch sử được giữ. Khi muốn đăng lại, bạn cần gửi duyệt và chờ phê duyệt.`,
    )) return;
    setBusy(true);
    try {
      const response = await pauseSupplierProductAction(product.id);
      setToast(response);
      if (response.ok) router.refresh();
    } catch (error) {
      setToast(reportActionError(error, "Tạm ẩn sản phẩm"));
    } finally { setBusy(false); }
  }

  const status = PRODUCT_STATUS[review];
  const statusLabel = review === "approved" && !live ? "Đã duyệt, chờ đăng" : status.label;
  const cover = media.find((m) => m.id === product?.featured_media_id && m.kind === "image" && privateMediaUrl(m)) ??
    media.find((m) => m.kind === "image" && privateMediaUrl(m));
  const coverUrl = cover ? privateMediaUrl(cover) : null;
  /** Sáu ô ảnh như sàn TMĐT: ô đầu là ảnh chính, phần còn lại là ảnh chi tiết. */
  const imageSlots = [cover, ...media.filter((m) => m.kind === "image" && privateMediaUrl(m) && m.id !== cover?.id)].slice(0, 6);
  const savedPriceValue = product?.ref_price != null
    ? formatGradeRowPriceVi(
        product.ref_price,
        product.ref_price_max != null && product.ref_price_max >= product.ref_price ? product.ref_price_max : product.ref_price,
        unitMeta.unitLabel,
      )
    : product
      ? "Báo giá theo yêu cầu"
      : "-";
  /** Độ hoàn thiện chỉ đọc, tính từ bản đã lưu và tệp hiện có; không phải cổng chặn đăng. */
  const completeness = productCompleteness(product ?? {}, media);
  const commercial = [
    { label: "Giá tham khảo", value: savedPriceValue },
    { label: "MOQ", value: product ? formatProductMoqVi(product) : "-" },
    { label: "Năng lực / tháng", value: product?.monthly_capacity || "-" },
    { label: "Thời gian giao", value: product ? formatLeadTimeVi(product) : "-" },
    { label: "Cảng xuất", value: product?.export_port || "-" },
    { label: "Incoterm", value: [product?.incoterm, product?.incoterm_place].filter(Boolean).join(" / ") || "-" },
    { label: "Thanh toán", value: product?.payment_terms || "-" },
  ];

  return <div className="mt-3.5 space-y-3">
    {/* Thanh bước kiểu sàn TMĐT: luôn thấy mình đang ở đâu, bấm được để chuyển bước. */}
    <nav aria-label="Các bước hoàn thiện sản phẩm" className="rounded-xl border border-ink-200 bg-white p-1.5 shadow-sm">
      <ol className="grid gap-1 sm:grid-cols-3">
        {STEPS.map((item) => {
          const done = item.step === 1 ? !!product : item.step === 2 ? hasMedia : review === "pending" || review === "approved";
          const active = step === item.step;
          return <li key={item.step}>
            <button type="button" onClick={() => selectStep(item.step)}
              aria-current={active ? "step" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${active ? "bg-brand-50 ring-1 ring-brand-300" : "hover:bg-ink-50"}`}>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-black ${done ? "bg-brand-700 text-white" : active ? "bg-brand-100 text-brand-800 ring-1 ring-brand-400" : "bg-ink-100 text-ink-500"}`}>
                {done ? <Check className="size-3" aria-hidden="true" /> : item.step}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[12px] font-bold ${active ? "text-brand-900" : "text-ink-800"}`}>{item.title}</span>
                <span className="block truncate text-[10px] text-ink-500">{item.hint}</span>
              </span>
              <span className="shrink-0 text-[10px] font-bold tracking-wider text-ink-400 uppercase">{active ? "Đang mở" : `B${item.step}`}</span>
            </button>
          </li>;
        })}
      </ol>
    </nav>

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_312px]">
      <div className="min-w-0">
        {/* Chỉ trạng thái cần NCC hành động mới hiện thanh: "Đã đăng" đã có nhãn ở thanh đáy và panel bước 3,
            không lặp khối tĩnh sát thanh chọn bước. Kết quả mỗi hành động bắn qua thông báo nổi. */}
        {(review === "pending" || review === "changes_requested" || review === "paused") && <section aria-label="Trạng thái xét duyệt"
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-4 py-2.5 ${review === "changes_requested" ? "border-rose-200 bg-rose-50" : review === "paused" ? "border-slate-300 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>{statusLabel}</span>
          <p className="min-w-0 flex-1 text-[12px] leading-5 text-ink-700">
            {review === "pending"
              ? product?.reviewed_category_slug
                ? "Đang rà soát lại giá. Bạn xem được nhưng chưa sửa cho tới khi xong."
                : "Đã gửi duyệt. Bạn có thể xem nhưng chưa thể chỉnh sửa hoặc tải tệp."
              : review === "paused"
                ? "Sản phẩm đang ẩn khỏi người mua. Gửi duyệt ở bước 3 để đăng lại."
                : "Xem góp ý, chỉnh sửa, lưu lại rồi gửi duyệt lần nữa."}
          </p>
        </section>}

        {legacyManaged && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] leading-5 text-amber-900">
          Sản phẩm này được quản lý từ trước. Để cập nhật nội dung, hãy tạm ẩn rồi gửi duyệt lại, hoặc liên hệ bộ phận hỗ trợ.
        </p>}

        {product?.supplier_review_note && <p className="mt-2.5 whitespace-pre-wrap rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-rose-800">
          <AlertCircle className="mr-1 inline size-4" aria-hidden="true" /> Yêu cầu chỉnh sửa: {product.supplier_review_note}
        </p>}

        <form id="product-info" ref={formRef} onSubmit={save} onChange={onFormChange} noValidate>
          <section data-step-panel={1} className={step === 1 ? "space-y-4" : "hidden"} aria-label="Bước 1: Thông tin sản phẩm">
            <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
              <SectionHead index="01" title="Thông tin cơ bản" hint="Tên, danh mục và mô tả - phần người mua đọc đầu tiên." />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Tên sản phẩm" hint="Không ghi grade trong tên. Vexim dịch tên sang tiếng Anh khi duyệt." required>
                    <input name="name" className="input" required maxLength={180} minLength={3} placeholder="Nhập tên mặt hàng của bạn" defaultValue={product?.name ?? ""} disabled={locked}
                      aria-invalid={nameGradeError ? true : undefined} />
                    {nameGradeError && <span className="mt-1 block text-xs text-rose-700">{nameGradeError}</span>}
                  </Field>
                </div>
                <Field label="Danh mục sản phẩm" required className="md:col-span-2" hint="Chọn danh mục gần nhất. Danh mục được kiểm tra khi duyệt; đổi danh mục thì grade đổi theo.">
                  <select name="supplier_category_proposal" className="input" required value={selectedCategory} onChange={(e) => onCategorySelect(e.target.value)} disabled={locked || categoryLocked || !categories.length}>
                    <option value="" disabled>Chọn danh mục sản phẩm</option>
                    {categories.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} / ` : ""}{c.label}</option>)}
                  </select>
                  {categoryLocked && <input type="hidden" name="supplier_category_proposal" value={selectedCategory} />}
                  {categoryLocked && <p className="mt-1 text-[11.5px] text-ink-500">Danh mục đã được chốt khi duyệt.</p>}
                  {!categoryLocked && selectedCategory && categoryScope.length > 0 && !categoryScope.includes(selectedCategory) &&
                    <p className="mt-1 text-[11.5px] text-amber-800">Danh mục nằm ngoài nhóm hàng đã đăng ký. Bạn vẫn có thể gửi duyệt.</p>}
                </Field>
                {!categories.length && <p role="status" className="self-center rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 md:col-span-2">
                  Bạn chưa chọn danh mục kinh doanh đang mở. <Link href="/supplier/portal/categories" className="font-semibold underline">Chọn danh mục trước khi thêm sản phẩm</Link>
                </p>}
                <div className="md:col-span-2">
                  {product && <div className="mb-4 space-y-3 rounded-xl border border-brand-200 p-4">
                    {quantityEditor ? <QuantityPricingInline key={`${quantityEditor.productId}:${quantityEditor.updatedAt}`}
                      data={quantityEditor} actor="supplier" disabled={locked || busy} dirty={dirty} onPreviewChange={setQuantityPreview} />
                      : <p role="alert" className="text-xs text-rose-700">Chưa tải được bảng giá mới. Kiểm tra danh mục và kết nối; giá đang hiển thị không bị thay đổi.</p>}
                  </div>}
                  {!product && <div id="new-quantity-pricing" className="space-y-3 rounded-xl border border-brand-200 p-4">
                    {!activeCategory ? <p className="text-xs text-ink-600">Chọn danh mục để nhập grade và bảng giá.</p> : !newPolicy || !newQuantity ?
                      <p role="alert" className="text-xs text-rose-700">Chưa tải được cấu hình bảng giá. Vui lòng kiểm tra kết nối trước khi lưu.</p> : <>
                        <p className="text-xs text-ink-600">Không ghi grade trong tên sản phẩm. Tên tiếng Anh sẽ được dịch sau khi bạn gửi duyệt và được kiểm tra bởi quản trị viên.</p>
                        {newQuantity && <QuantityPricingEditor value={newQuantity} onChange={onNewQuantityChange} standardGrades={newGrades} policy={newPolicy}
                          buyerPriceUnit={newBuyerUnit} pricePubliclyVisible={snapshot.price_publicly_visible === "yes"}
                          isolated showPreview={false} showTitle={false} validateEnglishName={false} showErrors={showGradeErrors} consentChecked={quantityConsent} onConsentChange={setQuantityConsent} />}
                      </>}
                  </div>}
                  {review === "approved" && (
                    <p className="mt-1.5 text-[11.5px] leading-5 text-ink-600">
                      Lưu ý: Nếu bạn chỉnh sửa giá trên sản phẩm đã duyệt, sản phẩm sẽ được kiểm tra lại giá trước khi hiển thị công khai.
                    </p>
                  )}
                </div>
                {/* Chỉ hiện thêm khối thông số khi danh mục còn thông số khác ngoài Grade. */}
                {!!selectedCategory && (officialAttributeFields.length > 0 || supplierAttributeFields.length > 0) &&
                  <div className="md:col-span-2">
                    <SupplierAttributeInputs key={selectedCategory} disabled={locked}
                      officialFields={officialAttributeFields}
                      supplierFields={supplierAttributeFields}
                      values={product?.supplier_category_proposal === selectedCategory || product?.reviewed_category_slug === selectedCategory ? product?.specs ?? {} : {}}
                      onCommit={onAttributesCommit} />
                  </div>}
                <Field label="Mô tả ngắn" hint="Tóm tắt vài câu bên cạnh ảnh sản phẩm">
                  <textarea name="description" className="input min-h-28 resize-y" rows={4} maxLength={1500} placeholder="Giới thiệu ngắn gọn về sản phẩm..." defaultValue={product?.description ?? ""} disabled={locked} />
                </Field>
                <Field label="Quy cách / tiêu chuẩn" hint="Cần ít nhất một trong hai ô mô tả hoặc quy cách để gửi duyệt">
                  <textarea name="spec" className="input min-h-28 resize-y" rows={4} maxLength={800} placeholder="Ví dụ: Size W320, độ ẩm ≤ 5%, đóng gói 25 kg..." defaultValue={product?.spec ?? ""} disabled={locked} />
                </Field>
                <Field label="Vùng nguyên liệu" hint="Chọn tỉnh/thành hoặc nhập vùng cụ thể; có thể ghi nhiều vùng cho sản phẩm này.">
                  <RawMaterialRegionInput defaultValue={product?.raw_material_region ?? ""} disabled={locked} />
                </Field>
                <Field label="Xuất xứ nguyên liệu đầu vào" hint="Nguồn trong nước, nhập khẩu hoặc kết hợp của sản phẩm này.">
                  <input name="input_material_origin" className="input" maxLength={300} placeholder="Ví dụ: Việt Nam, Campuchia hoặc nguồn kết hợp" defaultValue={product?.input_material_origin ?? ""} disabled={locked} />
                </Field>
                <div className="md:col-span-2">
                  <div className="text-[12.5px]">
                    <span className="mb-1 block font-semibold text-ink-800">Mô tả chi tiết</span>
                    <ProductDescriptionEditor id="supplier-product-description-detail" name="description_detail"
                      value={snapshot.description_detail} onChange={onDescriptionDetailChange} disabled={locked || busy} />
                    <span className="mt-1 block text-[11px] leading-4 text-ink-500">Dùng tiêu đề, in đậm, danh sách cho dễ đọc. Không nhập thông tin liên hệ trực tiếp.</span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Field label="Từ khoá tìm kiếm" hint="1–3 từ tiếng Anh, cách nhau bằng dấu phẩy.">
                    <input name="keywords" className="input" maxLength={120} placeholder="cashew, w320, vietnam"
                      defaultValue={(product?.keywords ?? []).join(", ")} disabled={locked} />
                  </Field>
                </div>
              </div>
            </div>

            {/* Không còn mũi tên gập: thương mại & xuất khẩu hiện ngay từ bước 1. */}
            <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
              <SectionHead index="02" title="Thông tin thương mại & xuất khẩu" />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Thời gian giao hàng">
                  <div className="flex items-center gap-1.5">
                    <input
                      name="lead_time_value"
                      type="number"
                      min={1}
                      max={leadTimeUnit === "weeks" ? 52 : 365}
                      className="input w-24 shrink-0 font-mono tabular-nums disabled:bg-ink-50 disabled:text-ink-400"
                      placeholder={leadTimeUnit === "on_request" ? "-" : leadTimeUnit === "weeks" ? "VD: 2" : "VD: 15"}
                      value={leadTimeUnit === "on_request" ? "" : leadTimeValue}
                      onChange={(e) => updateLeadTime(e.target.value, leadTimeUnit)}
                      disabled={locked || leadTimeUnit === "on_request"}
                    />
                    <select
                      name="lead_time_unit"
                      aria-label="Đơn vị thời gian giao hàng"
                      className="input min-w-0 flex-1"
                      value={leadTimeUnit}
                      onChange={(e) => updateLeadTime(leadTimeValue, e.target.value as LeadTimeUnit)}
                      disabled={locked}
                    >
                      {LEAD_TIME_UNIT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.viLabel}</option>
                      ))}
                    </select>
                    <input type="hidden" name="lead_time_days" value={computedLeadTimeDays} readOnly />
                  </div>
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
                  <input type="checkbox" name="price_publicly_visible" value="yes" defaultChecked={priceOptInDefault(product)} disabled={locked} className="mt-0.5 size-4 accent-brand-700" />
                  Cho phép công khai giá tham khảo của sản phẩm này khi đủ điều kiện
                </label>
                {!product && <p className="mt-1 pl-6 text-[11px] leading-4 text-ink-500">Được chọn sẵn. Bỏ chọn nếu chưa muốn chia sẻ giá.</p>}
                {product && <div className="mt-2.5 rounded-md bg-white p-2.5 text-[11.5px] leading-5" role="status">
                  <strong>Tình trạng giá đã lưu:</strong> {productPriceBlockers(product, supplier).length === 0 ? "Sản phẩm và doanh nghiệp đã cho phép chia sẻ giá." : "Người mua vẫn thấy On request."}
                  <ul className="mt-1 list-disc pl-5">{productPriceBlockers(product, supplier).map((reason) => <li key={reason}>{reason}</li>)}
                    {(review !== "approved" || !product.ready_for_buyer || supplier.status !== "published") && <li>Sản phẩm chưa đủ điều kiện công khai hoặc hồ sơ doanh nghiệp chưa được xuất bản.</li>}
                  </ul>
                  {dirty && <p className="mt-1 font-semibold text-amber-800">Thay đổi ở form chưa lưu; dòng trên là tình trạng trước khi lưu.</p>}
                </div>}
                <p className="mt-2 text-[11.5px] leading-5">
                  Cần ảnh/catalogue, danh mục và hồ sơ doanh nghiệp được duyệt trước khi người mua thấy.
                  {supplierPriceConsentCurrent(supplier) ? " Xác nhận chia sẻ giá đang còn hiệu lực." : ""}
                </p>
                {!supplierPriceConsentCurrent(supplier) && <div className="mt-2.5 rounded-md bg-white p-2.5 ring-1 ring-brand-200">
                  <label className="flex items-start gap-2 text-[11.5px] font-medium text-brand-900">
                    <input
                      type="checkbox"
                      name="confirm_supplier_price_consent"
                      value="yes"
                      required={snapshot.price_publicly_visible === "yes"}
                      disabled={locked}
                      className="mt-0.5 size-4 shrink-0 accent-brand-700"
                    />
                    <span>
                      Tôi đồng ý chia sẻ giá tham khảo của những sản phẩm tôi chọn công khai.
                      {snapshot.price_publicly_visible === "yes" && <span className="ml-1 font-semibold text-rose-700">*</span>}
                    </span>
                  </label>
                  <p className="mt-1 pl-6 text-[10.5px] leading-4 text-ink-500">
                    Hiệu lực 180 ngày kể từ khi lưu; giá tham khảo không phải báo giá chính thức.{" "}
                    <Link href="/dieu-khoan-su-dung" className="font-semibold text-brand-800 underline">Điều khoản</Link>
                  </p>
                </div>}
              </div>

              <div className="mx-4 mb-4 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-ink-50 px-3.5 py-2.5 text-[12.5px] text-ink-700 sm:mx-5">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="oem" value="yes" defaultChecked={product?.oem ?? false} disabled={locked} className="size-4 accent-brand-700" /> Nhận gia công/OEM</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="odm" value="yes" defaultChecked={product?.odm ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có dịch vụ thiết kế & sản xuất ODM</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="samples" value="yes" defaultChecked={product?.samples ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có thể gửi mẫu</label>
              </div>
            </div>

            <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
              <SectionHead index="03" title="Đặt hàng & năng lực" />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2">
                {BASE_FIELDS.map(([key, label, placeholder, max]) => <Field key={key} label={label}>
                  <input className="input" name={key} maxLength={max} placeholder={placeholder} defaultValue={String(product?.[key] ?? "")} disabled={locked} />
                </Field>)}
                <Field label="Loại kiện" hint="Bao, thùng, hộp hoặc pallet.">
                  <input className="input" name="package_type" maxLength={40} placeholder="Ví dụ: bao" defaultValue={product?.package_type ?? ""} disabled={locked} />
                </Field>
                <Field label="Khối lượng mỗi kiện" hint="Tính bằng kg.">
                  <input className="input" name="package_weight_kg" inputMode="decimal" placeholder="Ví dụ: 25"
                    defaultValue={product?.package_weight_kg ?? ""} disabled={locked} />
                </Field>
                <Field label="Kích thước kiện" hint="Dài x rộng x cao, cm.">
                  <input className="input" name="package_size" maxLength={60} placeholder="60x40x40 cm" defaultValue={product?.package_size ?? ""} disabled={locked} />
                </Field>
                <Field label="Số đơn vị mỗi thùng">
                  <input className="input" name="units_per_carton" inputMode="numeric" placeholder="Ví dụ: 20"
                    defaultValue={product?.units_per_carton ?? ""} disabled={locked} />
                </Field>
                <Field label="Giá mẫu (USD)" hint="Bỏ trống nếu không bán mẫu.">
                  <input className="input" name="sample_price_usd" inputMode="decimal" placeholder="Ví dụ: 5"
                    defaultValue={product?.sample_price_usd ?? ""} disabled={locked} />
                </Field>
              </div>
            </div>

            {stepError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-900">{stepError}</p>}
          </section>
        </form>

        <section data-step-panel={2} className={step === 2 ? "space-y-3" : "hidden"} aria-label="Bước 2: Ảnh và catalogue" id="product-media">
          <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
            <SectionHead step="Bước 2" title="Ảnh và catalogue"
              hint={live
                ? "JPG, PNG, WebP ≤ 8 MB hoặc PDF ≤ 15 MB. Tệp hiện cho người mua khi sản phẩm đăng."
                : review === "approved"
                  ? "JPG, PNG, WebP ≤ 8 MB hoặc PDF ≤ 15 MB. Tệp ở chế độ nội bộ khi chờ đăng."
                  : "JPG, PNG, WebP tối đa 8 MB hoặc PDF tối đa 15 MB. Tệp được kiểm tra khi duyệt."} />
            <div className="space-y-3 px-3.5 py-3 sm:px-4">
              {/* Lưới 6 ô: nhìn một cái là biết còn thiếu ảnh nào. Kéo thả và đặt ảnh chính vẫn ở các ô bên dưới. */}
              <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-ink-700">6 ô ảnh sản phẩm</p>
                  <p className="text-[10.5px] tabular-nums text-ink-500">{imageSlots.length}/6 ảnh</p>
                </div>
                <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, index) => {
                    const asset = imageSlots[index];
                    const src = asset ? privateMediaUrl(asset) : null;
                    const isCover = !!asset && asset.id === cover?.id;
                    return <li key={asset?.id ?? `empty-${index}`} className={`relative aspect-square overflow-hidden rounded-md border ${asset ? "border-ink-200 bg-white" : "border-dashed border-ink-300 bg-white/60"}`}>
                      {src ? <img src={src} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-[10px] font-semibold text-ink-400">{index + 1}</span>}
                      {isCover && <span className="absolute top-1 left-1 rounded-full bg-brand-700 px-1.5 py-0.5 text-[9px] font-bold text-white">Ảnh chính</span>}
                    </li>;
                  })}
                </ul>
                <p className="mt-1.5 text-[10.5px] leading-4 text-ink-500">Ô đầu là ảnh chính — ảnh người mua thấy trong kết quả tìm kiếm.</p>
              </div>
              {/* Ô ảnh đại diện riêng: kéo một ảnh khác từ danh sách vào ô này là thay ngay, ảnh cũ tự về lại danh sách. */}
              <div
                onDragOver={(event) => { if (canUpload) { event.preventDefault(); setCoverHover(true); } }}
                onDragLeave={() => setCoverHover(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setCoverHover(false);
                  if (!canUpload || event.dataTransfer.files.length) return;
                  const dragged = event.dataTransfer.getData("text/plain");
                  if (dragged) void makeCover(dragged);
                }}
                className={`flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed p-4 transition ${coverHover ? "border-brand-500 bg-brand-50" : canUpload ? "border-brand-200 bg-brand-50/40" : "border-ink-200 bg-ink-50"}`}
              >
                <div className="size-24 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-white sm:size-28">
                  {coverUrl
                    ? <img src={coverUrl} alt="Ảnh đại diện" className="size-full object-cover" />
                    : <span className="flex size-full flex-col items-center justify-center gap-1 text-ink-400"><ImageIcon className="size-6" aria-hidden="true" /><span className="text-[10px] font-semibold">Chưa có ảnh</span></span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-ink-900">Ảnh đại diện</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-ink-600">{canUpload
                    ? "Ảnh hiện đầu tiên với người mua. Kéo ảnh khác vào đây hoặc bấm nút sao để thay."
                    : "Ảnh này hiện đầu tiên với người mua."}</p>
                </div>
                {cover && canDeleteAsset(cover) && <button type="button" disabled={busy} onClick={() => void removeMedia(cover.id)}
                  aria-label="Xóa ảnh đại diện" title="Xóa ảnh đại diện"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                  <Trash2 className="size-3.5" aria-hidden="true" /> Xóa ảnh
                </button>}
              </div>
              {media.filter((asset) => asset.id !== cover?.id).length > 0
                ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{media.filter((asset) => asset.id !== cover?.id).map((asset) => {
                  const url = privateMediaUrl(asset);
                  return <li key={asset.id} className="group relative overflow-hidden rounded-lg border border-ink-200 bg-white"
                    draggable={canUpload && asset.kind === "image"}
                    onDragStart={(event) => { event.dataTransfer.setData("text/plain", asset.id); event.dataTransfer.effectAllowed = "move"; }}>
                    <div className="relative block aspect-square overflow-hidden bg-gradient-to-br from-ink-100 via-brand-50 to-ink-100">
                      {asset.kind === "image" && url
                        ? <img src={url} alt={`Ảnh ${asset.caption || product?.name || "sản phẩm"}`} loading="lazy" className="size-full object-cover" />
                        : <span className="flex size-full items-center justify-center text-brand-700"><FileText className="size-8" aria-hidden="true" /></span>}
                      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
                        <span className={`truncate rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${asset.audience === "buyer" ? "bg-emerald-100 text-emerald-800" : "bg-white/95 text-ink-700"}`}>
                          {asset.audience === "buyer" ? "Chia sẻ cho người mua" : "Nội bộ"}
                        </span>
                        {(canUpload && asset.kind === "image" || canDeleteAsset(asset)) && (
                          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                            {canUpload && asset.kind === "image" &&
                              <button type="button" disabled={busy} onClick={() => void makeCover(asset.id)} aria-label={`Đặt ${asset.caption || "ảnh này"} làm ảnh đại diện`} title="Đặt làm ảnh đại diện"
                                className="rounded-full bg-white/95 p-1.5 text-brand-700 shadow-sm hover:bg-brand-50 disabled:opacity-50">
                                <Star className="size-3.5" aria-hidden="true" />
                              </button>}
                            {canDeleteAsset(asset) &&
                              <button type="button" disabled={busy} onClick={() => void removeMedia(asset.id)} aria-label={`Xóa ${asset.caption || "tệp"}`} title="Xóa tệp"
                                className="rounded-full bg-white/95 p-1.5 text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50">
                                <X className="size-3.5" aria-hidden="true" />
                              </button>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="truncate text-[12.5px] font-semibold text-ink-900">{asset.caption || (asset.kind === "image" ? "Ảnh sản phẩm" : "Catalogue")}</p>
                      {url && <a href={url} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-brand-700 underline">Xem tệp</a>}
                    </div>
                  </li>;
                })}</ul>
                : <p className="rounded-lg bg-ink-50 px-3.5 py-6 text-center text-[13px] text-ink-600">{media.length
                  ? "Ảnh đại diện đang là ảnh duy nhất của sản phẩm. Tải thêm ảnh hoặc catalogue nếu cần."
                  : "Chưa có tệp nào. Thêm ít nhất một ảnh hoặc catalogue thật để gửi duyệt."}</p>}

              {canUpload ? <>
                <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFiles(Array.from(e.dataTransfer.files)); }}
                  className="rounded-lg border-2 border-dashed border-brand-200 bg-brand-50/40 px-4 py-6 text-center transition hover:border-brand-400 focus-within:border-brand-600">
                  <UploadCloud className="mx-auto size-8 text-brand-700" aria-hidden="true" />
                  <p className="mt-1.5 text-[13px] font-semibold text-ink-800">Kéo thả ảnh hoặc catalogue vào đây</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-500">hoặc chọn tệp từ thiết bị. Đã tải {ownedCount}/12 tệp</p>
                  <label className="btn btn-soft relative mt-3 cursor-pointer">Chọn tệp
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" aria-label="Chọn ảnh sản phẩm hoặc catalogue"
                      onChange={(e) => { chooseFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
                </div>
                {selected.length > 0 && <div className="rounded-lg border border-brand-200 bg-brand-50 p-3.5">
                  <p className="text-[13px] font-semibold text-brand-900">Đã chọn {selected.length} tệp</p>
                  <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-auto text-[11.5px] text-brand-900">{selected.map((file, index) => <li key={`${file.name}-${index}`} className="truncate">{file.name} - {(file.size / 1024 / 1024).toFixed(1)} MB</li>)}</ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={upload} className="btn btn-primary btn-sm"><UploadCloud className="size-4" aria-hidden="true" /> Tải {selected.length} tệp</button>
                    <button type="button" disabled={busy} onClick={() => setSelected([])} className="btn btn-ghost btn-sm">Bỏ chọn</button>
                  </div>
                </div>}
              </> : <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-5 text-amber-900">
                {!product ? "Lưu thông tin sản phẩm ở bước 1 trước; sau đó quay lại đây để tải ảnh và catalogue."
                  : dirty ? "Bước 1 còn thay đổi chưa lưu. Bấm Lưu ở bước 1 rồi sang bước 2."
                  : legacyManaged ? "Sản phẩm do Vexim quản lý từ trước nên bạn chưa sửa được tệp. Liên hệ hỗ trợ khi cần thêm ảnh."
                  : locked ? "Đang chờ duyệt nên tạm khoá tải tệp. Duyệt xong hoặc bị trả về, bạn tải thêm được ngay."
                  : "Sản phẩm do Vexim quản lý từ trước nên bạn chưa sửa được tệp. Liên hệ hỗ trợ khi cần thêm ảnh."}
              </div>}
              {progress && <p role="status" className="text-[12.5px] font-semibold text-brand-800">{progress}</p>}
            </div>
          </div>
        </section>

        <section data-step-panel={3} className={step === 3 ? "space-y-3" : "hidden"} aria-label="Bước 3: Xem lại và gửi" id="product-review">
          <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
            <SectionHead step="Bước 3" title="Xem lại toàn bộ hồ sơ"
              hint="Đọc lại nội dung bước 1 và 2. Sửa tại đây, gửi xong hồ sơ mới sang bước duyệt." />
            <div className="space-y-3 px-4 py-4 sm:px-5">
              {dirty && <p className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900">
                Có thay đổi chưa lưu - nội dung dưới đây là bản đang nhập.
                <button type="button" onClick={() => leaveInfoFor(3)} className="underline">Lưu ngay</button>
                <button type="button" onClick={() => { if (window.confirm("Bỏ các thay đổi chưa lưu và tải lại nội dung đã lưu?")) window.location.reload(); }} className="underline">Bỏ thay đổi</button>
              </p>}

              <ul className="grid gap-2 sm:grid-cols-3">
                {([[!!product, "Đã lưu sản phẩm"], [hasDetails, "Có mô tả/quy cách"], [hasMedia, "Có ảnh/catalogue"]] as const).map(([ready, label]) =>
                  <li key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold ${ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                    {ready ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="size-4 shrink-0" aria-hidden="true" />}
                    {label}
                  </li>)}
              </ul>

              {/* Bước 1 - nội dung */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title="Thông tin sản phẩm" onEdit={() => goToStep(1)} />
                <dl className="grid gap-x-4 gap-y-2 px-3.5 py-3 text-[12.5px] sm:grid-cols-2">
                  <div className="sm:col-span-2"><ReviewField label="Tên sản phẩm" value={snapshot.name} strong /></div>
                  <div className="sm:col-span-2"><ReviewField label="Danh mục" value={categoryLabel} /></div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-semibold text-ink-500">Bảng giá</dt>
                    <dd className="mt-1 rounded-lg border border-ink-200 p-3">
                      {quantityEditor?.v2 ? <>
                        <p>Grade: <strong>{quantityEditor.grade}</strong> · Incoterm: <strong>{quantityEditor.incoterm}</strong></p>
                        <table className="mt-2 w-full text-left text-xs"><thead><tr><th>Số lượng ({quantityEditor.v2.unit === "mt" ? "MT" : "kg"})</th><th>Giá (USD/{quantityEditor.v2.unit === "mt" ? "MT" : "kg"})</th></tr></thead>
                          <tbody>{quantityEditor.v2.tiers.map((tier, index) => <tr key={index} className="border-t border-ink-100"><td className="py-1 tabular-nums">{tier.quantity}</td><td className="py-1 tabular-nums">{tier.price}</td></tr>)}</tbody>
                        </table>
                        <p className="mt-1 text-xs text-ink-500">{quantityEditor.pendingPriceId ? "Bảng giá đang chờ duyệt." : "Bảng giá đã duyệt."}</p>
                      </> : quantityEditor && quantityPreview ? <>
                        <p>Grade: <strong>{quantityPreview.grade || "Chưa chọn"}</strong> · Tiền tệ: <strong>{quantityPreview.currency ?? "USD"}</strong></p>
                        <table className="mt-2 w-full text-left text-xs"><thead><tr><th>Incoterm</th><th>Số lượng từ (kg)</th><th>Giá ({quantityPreview.currency ?? "USD"}/kg)</th></tr></thead>
                          <tbody>{quantityPreview.tiers.map((tier, index) => <tr key={index} className="border-t border-ink-100"><td className="py-1">{tier.incoterm || quantityPreview.incoterm || "—"}</td><td className="py-1 tabular-nums">{tier.minKg || "—"}</td><td className="py-1 tabular-nums">{tier.priceUsdPerKg || "—"}</td></tr>)}</tbody>
                        </table>
                        <p className="mt-1 text-xs text-ink-500">Bảng giá cần được duyệt.</p>
                      </> : <span>Chưa tải được bảng giá mới.</span>}
                    </dd>
                  </div>
                  {attributeRows.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold text-ink-500">Thông số theo nhóm hàng</dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">{attributeRows.map(([label, value]) =>
                        <span key={label} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11.5px] text-ink-800"><strong className="font-semibold">{label}:</strong> {value}</span>)}</dd>
                    </div>
                  )}
                  <div><ReviewField label="Mô tả ngắn" value={snapshot.description} /></div>
                  <div><ReviewField label="Quy cách / tiêu chuẩn" value={snapshot.spec} /></div>
                  <div><ReviewField label="Vùng nguyên liệu" value={snapshot.raw_material_region} /></div>
                  <div><ReviewField label="Xuất xứ nguyên liệu đầu vào" value={snapshot.input_material_origin} /></div>
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-[11px] font-semibold text-ink-500">Mô tả chi tiết</dt>
                    <dd className="mt-1 rounded-lg bg-ink-50 px-3 py-2"><ProductDescriptionPreview value={snapshot.description_detail} /></dd>
                  </div>
                </dl>
              </div>

              {/* Bước 1 - thương mại & xuất khẩu */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title="Thông tin thương mại & xuất khẩu" onEdit={() => goToStep(1)} />
                <dl className="grid gap-x-4 gap-y-2 px-3.5 py-3 text-[12.5px] sm:grid-cols-2">
                  {REVIEW_COMMERCIAL.map(([key, label]) => {
                    const displayValue = key === "lead_time_days"
                      ? (leadTimeUnit === "on_request" || !leadTimeValue.trim()
                          ? "Theo yêu cầu"
                          : leadTimeUnit === "weeks"
                            ? `${leadTimeValue.trim()} tuần`
                            : `${leadTimeValue.trim()} ngày`)
                      : snapshot[key];
                    return <div key={key}><ReviewField label={label} value={displayValue} /></div>;
                  })}
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

              {/* Bước 1 - đặt hàng & năng lực */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title="Đặt hàng & năng lực" onEdit={() => goToStep(1)} />
                <dl className="grid gap-x-4 gap-y-2 px-3.5 py-3 text-[12.5px] sm:grid-cols-3">
                  {REVIEW_ORDER.map(([key, label]) => <div key={key}><ReviewField label={label} value={snapshot[key]} /></div>)}
                </dl>
              </div>

              {/* Bước 2 - ảnh & catalogue */}
              <div className="rounded-lg border border-ink-200">
                <ReviewHead title={`Ảnh và catalogue (${media.length} tệp)`} onEdit={() => goToStep(2)} />
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
                            {asset.audience === "buyer" ? "Người mua" : "Nội bộ"}
                          </span>
                        </li>;
                      })}
                    </ul>
                    : <p className="rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">Chưa có tệp. Quay lại bước 2 để tải ảnh hoặc catalogue thật.</p>}
                  {media.length > 8 && <p className="mt-1.5 text-[11px] text-ink-500">và {media.length - 8} tệp khác - xem đủ ở bước 2.</p>}
                </div>
              </div>

              {sent || review === "pending"
                ? <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] font-semibold text-emerald-900">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">Đã gửi duyệt. Bạn sẽ nhận thông báo khi sản phẩm được đăng.</span>
                  <Link href="/supplier/portal/products" className="underline">Về danh sách</Link>
                </div>
                : review === "approved"
                  ? <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-800"><Check className="size-4" aria-hidden="true" /> {live ? "Sản phẩm đã đăng. Bạn có thể tiếp tục quản lý." : "Sản phẩm đã duyệt và đang chờ đăng."}</p>
                  : <div className="space-y-2">
                    <div id="submit-blockers" aria-live="polite">
                      {submitHint?.length
                        ? <ul role="alert" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
                          {submitHint.map((hint) => <li key={hint} className="flex gap-1.5"><AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{hint}</li>)}
                        </ul>
                        : canSubmit
                          ? <p className="text-[12px] text-ink-600">Hồ sơ đủ điều kiện để gửi duyệt - bấm Gửi duyệt ở thanh dưới cùng.</p>
                          : submitBlockers().length
                            ? <ul className="space-y-1 text-[12px] text-ink-600">
                              {submitBlockers().map((hint) => <li key={hint} className="flex gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />{hint}</li>)}
                            </ul>
                            : null}
                    </div>
                  </div>}
              <p className="text-[11.5px] leading-5 text-ink-500">{quantityEditor?.pendingNameId ? "Tên tiếng Anh đang chờ duyệt riêng." : quantityEditor?.hasApprovedName ? "Đã có tên tiếng Anh được duyệt riêng." : "Tên tiếng Anh được kiểm tra trong quá trình duyệt sản phẩm."}</p>
            </div>
          </div>
        </section>

        {step === 2 && stepError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-900">{stepError}</p>}

        {/* Thanh điều hướng dính đáy màn hình: luôn thấy nút Trở về / Tiếp tục. */}
        <div className="sticky bottom-0 z-20 mt-3 flex items-center gap-2 rounded-xl border border-ink-200 bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur">
          {step === 1
            ? <Link href="/supplier/portal/products" className="btn btn-ghost btn-sm"><ArrowLeft className="size-3.5" aria-hidden="true" /> Hủy</Link>
            : <button type="button" onClick={() => goToStep((step - 1) as Step)} className="btn btn-ghost btn-sm"><ArrowLeft className="size-3.5" aria-hidden="true" /> Trở về bước {step - 1}</button>}

          <span className="hidden min-w-0 flex-1 items-center gap-1.5 truncate px-1 text-[11.5px] text-ink-500 sm:flex">
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${step === 1 && dirty ? "bg-amber-500" : review === "changes_requested" ? "bg-rose-500" : "bg-emerald-500"}`} />
            <span className="truncate">
              {step === 1 ? (dirty ? "Có thay đổi chưa lưu" : product ? "Thông tin đã lưu" : "Chưa lưu sản phẩm")
                : step === 2 ? `${media.length} tệp đã tải`
                  : review === "pending" ? "Đang chờ duyệt" : "Xem lại rồi gửi duyệt"}
            </span>
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {step === 1 && !locked && product && dirty &&
              <button type="submit" form="product-info" onClick={() => { advanceTo.current = null; }} disabled={busy}
                className="btn btn-ghost btn-sm"><Save className="size-3.5" aria-hidden="true" /> {review === "approved" ? "Lưu thay đổi" : "Lưu nháp"}</button>}
            {step === 1 && (locked
              ? <button type="button" onClick={() => goToStep(2)} className="btn btn-primary btn-sm">Xem tệp <ArrowRight className="size-3.5" aria-hidden="true" /></button>
              : product && !dirty
                ? <button type="button" onClick={() => leaveInfoFor(2)} className="btn btn-primary btn-sm">Tiếp tục <ArrowRight className="size-3.5" aria-hidden="true" /></button>
                : <button type="submit" form="product-info" onClick={() => { advanceTo.current = 2; }} disabled={busy}
                  className="btn btn-primary btn-sm">{busy ? "Đang lưu..." : "Lưu và tiếp tục"} <ArrowRight className="size-3.5" aria-hidden="true" /></button>)}
            {step === 2 && <button type="button" onClick={() => goToStep(3)} className="btn btn-primary btn-sm">Sang bước 3 <ArrowRight className="size-3.5" aria-hidden="true" /></button>}
            {step === 3 && (review === "pending" || review === "approved" || sent
              ? <span className="text-[11.5px] font-semibold text-emerald-800">{review === "approved" ? (live ? "Đã đăng" : "Đã duyệt, chờ đăng") : "Đã gửi duyệt"}</span>
              : <button type="button" onClick={requestSubmit} disabled={busy} aria-describedby="submit-blockers" className="btn btn-primary btn-sm">
                {busy
                  ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> Đang gửi...</>
                  : <><Send className="size-3.5" aria-hidden="true" /> Gửi duyệt</>}
              </button>)}
          </div>
        </div>
      </div>

      {/* Cột phải: thẻ xem nhanh - thương mại & xuất khẩu đọc được ngay, kể cả khi cuộn. */}
      <aside className="space-y-3 lg:sticky lg:top-6">
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="relative aspect-square bg-gradient-to-br from-ink-100 via-brand-50 to-ink-100">
            {coverUrl
              ? <img src={coverUrl} alt="" className="size-full object-cover" />
              : <span className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-400"><ImageIcon className="size-8 stroke-1" aria-hidden="true" /><span className="text-[11px] font-semibold">Chưa có ảnh</span></span>}
            <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${status.tone}`}>{statusLabel}</span>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-[10.5px] font-bold tracking-wider text-brand-700 uppercase">{categoryLabel}</p>
            {newQuantity && newPolicy ? <div className="mt-2">
              <QuantityBuyerPreview value={newQuantity} standardGrades={newGrades} policy={newPolicy}
                buyerPriceUnit={newBuyerUnit} pricePubliclyVisible={snapshot.price_publicly_visible === "yes"} />
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-[10.5px] leading-4 text-amber-900">Bản xem trước, chưa phải nội dung người mua đang thấy. Bảng giá và tên cần được duyệt.</p>
            </div> : quantityEditor && quantityPreview ? <div className="mt-2">
              <QuantityBuyerPreview value={quantityPreview} standardGrades={quantityEditor.standardGrades} policy={quantityEditor.policy}
                buyerPriceUnit={quantityEditor.buyerPriceUnit} pricePubliclyVisible={quantityEditor.pricePubliclyVisible} />
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-[10.5px] leading-4 text-amber-900">Bản xem trước từ dữ liệu bạn đang nhập. Giá thật chỉ đổi sau khi bản giá được duyệt.</p>
            </div> : <h2 className="mt-0.5 line-clamp-2 text-[13.5px] font-black text-ink-900">{product?.name ?? "Sản phẩm mới"}</h2>}
            <dl className="mt-2.5 space-y-1 border-t border-ink-100 pt-2.5 text-[11.5px]">
              {commercial.filter((row) => !((quantityEditor && quantityPreview) || (newQuantity && newPolicy)) || !["Giá tham khảo", "MOQ", "Incoterm"].includes(row.label)).map((row) => <div key={row.label} className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-ink-500">{row.label}</dt>
                <dd className={`min-w-0 truncate text-right font-semibold text-ink-800 ${row.label === "Giá tham khảo" && row.value !== "-" ? "font-mono tabular-nums" : ""}`}>{row.value}</dd>
              </div>)}
            </dl>
            <p className="mt-2 text-[10.5px] leading-4 text-ink-500">{quantityEditor && quantityPreview ? "Các thông tin thương mại bên dưới bảng giá lấy từ bản đã lưu." : <>Số liệu lấy từ bản đã lưu{dirty ? "; thay đổi đang nhập chưa hiển thị ở đây." : "."}</>}</p>
          </div>
        </div>

        {product && <section aria-label="Độ hoàn thiện hồ sơ" className="rounded-xl border border-ink-200 bg-white p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Độ hoàn thiện</p>
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 36 36" className="size-8 shrink-0" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3.4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#0f766e" strokeWidth="3.4" strokeLinecap="round"
                  strokeDasharray="97.4" strokeDashoffset={97.4 - (Math.max(0, Math.min(100, completeness.score)) / 100) * 97.4}
                  transform="rotate(-90 18 18)" />
              </svg>
              <span className="font-mono text-[13px] font-black tabular-nums text-brand-800">{completeness.score}%</span>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${completeness.score}%` }} />
          </div>
          {completeness.next ? <>
            <ul className="mt-2 space-y-1 text-[11.5px] leading-4 text-ink-600">
              {completeness.missing.slice(0, 3).map((item) => <li key={item.key} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span><strong className="font-semibold text-ink-800">{item.label}</strong> · {item.hint}</span>
              </li>)}
            </ul>
            {completeness.missing.length > 3 && <p className="mt-1.5 text-[11px] text-ink-500">Còn {completeness.missing.length - 3} mục nữa.</p>}
            <button type="button" onClick={() => selectStep(completeness.next!.step)} className="btn btn-soft btn-sm mt-2">
              Bổ sung ở bước {completeness.next.step}
            </button>
          </> : <p className="mt-2 text-[11.5px] leading-4 text-emerald-700">Hồ sơ đã đủ các mục cần thiết.</p>}
          <p className="mt-2 text-[10.5px] leading-4 text-ink-500">{dirty ? "Lưu thay đổi để cập nhật số liệu." : "Số liệu tính từ bản đã lưu."}</p>
        </section>}

        {product && (canDeleteDraft || review === "approved") && <section aria-label="Quản lý sản phẩm" className="rounded-xl border border-ink-200 bg-white p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Quản lý sản phẩm</p>
          {canDeleteDraft ? <>
            <p className="mt-2 text-[11.5px] leading-5 text-ink-600">Xóa vĩnh viễn bản nháp chưa duyệt và tệp của sản phẩm. Không thể hoàn tác.</p>
            <button type="button" disabled={busy || dirty} onClick={() => void deleteDraft()} className="btn btn-ghost btn-sm mt-2 text-rose-700 disabled:opacity-50">
              <Trash2 className="size-3.5" aria-hidden="true" /> Xóa bản nháp
            </button>
          </> : <>
            <p className="mt-2 text-[11.5px] leading-5 text-ink-600">Ẩn khỏi người mua, giữ lịch sử. Muốn đăng lại cần gửi duyệt.</p>
            <button type="button" disabled={busy || dirty} onClick={() => void pauseProduct()} className="btn btn-ghost btn-sm mt-2 text-ink-700 disabled:opacity-50">
              <EyeOff className="size-3.5" aria-hidden="true" /> Tạm ẩn sản phẩm
            </button>
          </>}
          {dirty && <p className="mt-2 text-[11px] text-amber-800">Lưu hoặc bỏ thay đổi chưa lưu trước khi tiếp tục.</p>}
        </section>}

        <div className="rounded-xl border border-ink-200 bg-white p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Ví dụ điền</p>
          <ul className="mt-1.5 space-y-1 text-[11.5px] leading-4 text-ink-600">
            <li><strong className="font-semibold text-ink-800">Tên:</strong> Hạt điều nhân trắng (không ghi grade).</li>
            <li><strong className="font-semibold text-ink-800">MOQ:</strong> 1.000 kg dễ nhận hỏi giá hơn 5 tấn.</li>
            <li><strong className="font-semibold text-ink-800">Đóng gói:</strong> bao 25 kg, 20 đơn vị mỗi thùng.</li>
            <li><strong className="font-semibold text-ink-800">Từ khoá:</strong> cashew w320, vietnam cashew.</li>
          </ul>
          <p className="mt-1.5 text-[10.5px] leading-4 text-ink-500">Ví dụ minh hoạ, không phải số liệu của bạn.</p>
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Luồng duyệt</p>
          <ol className="mt-2 space-y-1.5 text-[11.5px] leading-4 text-ink-600">
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">1.</span>Bạn lưu thông tin và tải tệp thật.</li>
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">2.</span>Gửi duyệt nội dung.</li>
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">3.</span>Chọn tệp chia sẻ cho người mua và bật sẵn sàng.</li>
          </ol>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink-500"><LockKeyhole className="mt-0.5 size-3 shrink-0" aria-hidden="true" />Tệp ở chế độ nội bộ cho tới khi được chọn chia sẻ.</p>
        </div>

        <Link href="/supplier/portal/products" className="flex items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-800">
          Danh sách sản phẩm <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </aside>
    </div>

    {/* Thông báo kết quả mỗi hành động: nổi góc phải phía trên thanh đáy, tự ẩn sau vài giây. */}
    {toast && <div role="status" aria-live="polite"
      className={`fixed right-4 bottom-24 z-50 flex max-w-[min(24rem,calc(100vw-2rem))] items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-semibold shadow-lg sm:right-6 sm:bottom-28 ${toast.warning ? "border-amber-200 bg-amber-50 text-amber-900" : toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {toast.warning
        ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
        : toast.ok
          ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          : <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden="true" />}
      <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
      <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo"
        className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"><X className="size-4" aria-hidden="true" /></button>
    </div>}
  </div>;
}

/**
 * `step` chỉ truyền khi thẻ này CHÍNH LÀ nội dung của một bước (bước 2, bước 3).
 * Các thẻ con trong bước 1 để trống để không lặp lại chữ “Bước 1” ba lần trên cùng
 * một màn hình - bước đang mở đã hiện ở thanh bước phía trên.
 */
function SectionHead({ step, index, title, hint }: { step?: string; index?: string; title: string; hint?: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-1 border-b border-ink-100 px-3.5 py-2.5 sm:px-4">
    <div className="flex min-w-0 items-baseline gap-2">
      {index && <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-md bg-ink-100 text-[10px] font-black tabular-nums text-ink-600">{index}</span>}
      <div className="min-w-0">
        {step && <p className="text-[10px] font-bold tracking-[0.14em] text-brand-700 uppercase">{step}</p>}
        <h2 className="text-[15px] font-black text-ink-900">{title}</h2>
      </div>
    </div>
    {hint && <p className="max-w-md text-[11px] leading-4 text-ink-500">{hint}</p>}
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

function ReviewField({ label, value, strong, mono }: { label: string; value?: string; strong?: boolean; mono?: boolean }) {
  const shown = value?.trim();
  return <div className="min-w-0">
    <dt className="text-[11px] font-semibold text-ink-500">{label}</dt>
    <dd className={`mt-0.5 break-words whitespace-pre-wrap ${strong ? "text-[13px] font-bold text-ink-900" : "text-[12.5px] text-ink-800"} ${shown && mono ? "font-mono tabular-nums" : ""} ${shown ? "" : "text-ink-400"}`}>{shown || "Chưa nhập"}</dd>
  </div>;
}

function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={className ? `block text-[12.5px] ${className}` : "block text-[12.5px]"}>
    <span className="mb-1 block font-semibold text-ink-800">{label}{required && " *"}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] leading-4 text-ink-500">{hint}</span>}
  </label>;
}

function ClockIcon() { return <span className="size-2.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />; }
