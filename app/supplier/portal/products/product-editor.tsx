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
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Pencil,
  Plus,
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
import { BuyerPreviewDialog } from "@/components/products/buyer-preview-dialog";
import { draftPublicQuantityOffer, nameContainsGrade, validateQuantityPricing, type QuantityPricingInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
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
  /** Ảnh trong kho riêng của nhà cung cấp, chưa gắn sản phẩm nào. */
  bankMedia?: MediaAsset[];
  userId?: string;
  categories: CategoryProposalOption[];
  /** Nhóm hàng đã đăng ký chỉ dùng để cảnh báo, không giới hạn lựa chọn. */
  categoryScope?: string[];
  /** Giấy chất lượng mà từng danh mục đang thừa hưởng (khoá = slug danh mục). */
  certificateInheritance?: Record<string, Array<{ id: string; name: string; scheme: string | null; validUntil: string | null }>>;
  supplier: Supplier;
  /** Chứng nhận Vexim đã duyệt gắn cho sản phẩm — bản xem trước hiện đúng những gì người mua thấy. */
  certificates?: Array<{ id: string; name: string; valid_until?: string | null }>;
  /** Trang có thể mở thẳng một bước bằng `?step=2` (sau khi tạo sản phẩm mới). */
  initialStep?: Step;
};

type Step = 1 | 2 | 3;

/**
 * Tám khối của một trang duy nhất, xếp theo mạch người bán điền hồ sơ: chọn ngành hàng,
 * đặt tên, đưa ảnh lên, khai quy cách, giá, đóng gói, viết mô tả, rồi xem lại và gửi.
 * `id` cũng là đích neo cho mục lục trái và các nút "Sửa" ở khối xem lại.
 */
const FORM_SECTIONS = [
  { id: "sec-category", label: "Ngành hàng", hint: "Chọn đúng nhóm hàng" },
  { id: "sec-basic", label: "Tên & từ khoá", hint: "Người mua gõ gì để thấy" },
  { id: "sec-media", label: "Ảnh & tệp", hint: "Ảnh thật, catalogue" },
  { id: "sec-spec", label: "Quy cách & năng lực", hint: "Thông số, OEM, mẫu" },
  { id: "sec-price", label: "Giá & điều kiện bán", hint: "Bảng giá, MOQ, Incoterm" },
  { id: "sec-shipping", label: "Đóng gói & giao hàng", hint: "Kiện, thời gian, cảng" },
  { id: "sec-detail", label: "Nội dung chi tiết", hint: "Bài mô tả cho người mua" },
  { id: "sec-review", label: "Xem lại & gửi", hint: "Kiểm rồi gửi duyệt" },
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

/** Ô bắt buộc đầu tiên còn trống/sai trên trang (bỏ qua ô đã khoá và ô ẩn). */
function firstInvalidField(form: HTMLFormElement | null): HTMLElement | null {
  if (!form) return null;
  for (const element of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
    if (element.form !== form || element.disabled || (element instanceof HTMLInputElement && element.type === "hidden")) continue;
    if (!element.checkValidity()) return element;
  }
  return null;
}

/**
 * Trang sản phẩm của NCC theo bố cục Seller Center của Alibaba: **một trang dài** với
 * mục lục neo bên trái, không chia bước. Người bán đi theo mạch ngành hàng → tên & từ khoá
 * → ảnh → quy cách → giá → đóng gói → mô tả → xem lại, rồi bấm Gửi duyệt ở thanh dính đáy.
 *
 * Lý do bỏ wizard: bản thân Alibaba không có bước 2/3 — ảnh là trường của khối thông tin
 * cơ bản, còn "xem lại" chỉ là thanh xác nhận trước khi gửi. Wizard cũ bắt người bán bấm
 * ba lần cho một sản phẩm và giấu mất yêu cầu ảnh cho tới khi nhập xong phần chữ.
 *
 * Hành vi giữ nguyên: lưu qua `saveSupplierProductAction`, cảnh báo thay đổi chưa lưu,
 * tải/xoá tệp qua API riêng, nộp qua `submitSupplierProductAction`, khoá khi Vexim đang duyệt.
 */
export function SupplierProductEditor({ product, quantityEditor, quantityPolicies, media = [], bankMedia = [], userId, categories, categoryScope = [], supplier, certificates = [], certificateInheritance = {}, initialStep = 1 }: EditorProps) {
  const router = useRouter();
  const globalToast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const creationRequestId = useRef<string | null>(null);
  const [quantityConsent, setQuantityConsent] = useState(false);

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
  const [formError, setFormError] = useState<string | null>(null);
  const [coverHover, setCoverHover] = useState(false);
  const [selected, setSelected] = useState<File[]>([]);
  // Kho ảnh: ảnh đã tải lên nhưng chưa thuộc sản phẩm nào. Ảnh được gắn vào sản phẩm
  // đúng lúc bấm Lưu, nên người bán không phải lưu nháp trước mới tải được ảnh.
  const [pickedBank, setPickedBank] = useState<string[]>([]);
  // Điều kiện thanh toán: ô nhập và các chip gợi ý phải dùng chung một giá trị.
  const [paymentTerm, setPaymentTerm] = useState(product?.payment_terms ?? "");
  const [progress, setProgress] = useState("");
  // Bản nháp dùng cho bước 3: cập nhật theo từng lần nhập nên NCC đọc lại đúng nội dung
  // đang có, kể cả phần chưa lưu (kèm cảnh báo phải lưu trước khi gửi).
  const [snapshot, setSnapshot] = useState<Record<string, string>>(() =>
    snapshotFrom(product),
  );
  const [submitHint, setSubmitHint] = useState<string[] | null>(null);
  const [sent, setSent] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
  // Tải ảnh không cần sản phẩm đã tồn tại: ảnh vào kho ảnh của nhà cung cấp trước,
  // rồi gắn vào sản phẩm đúng lúc bấm Lưu (xem upload + pickedBank).
  const canUpload = !locked && (!["approved", "paused"].includes(review) || product?.supplier_originated === true);
  // Ảnh tải lên đã chia sẻ cho người mua ngay, nên người tải lên luôn xoá được tệp của mình.
  const canDeleteAsset = (asset: MediaAsset) => canUpload && !!userId && asset.created_by === userId;
  const canDeleteDraft = !!product && review === "draft" && product.supplier_originated === true &&
    !product.ready_for_buyer && product.reviewed_category_slug == null;
  const categoryLocked = review === "approved" || (review === "paused" && !!product?.reviewed_category_slug);
  const activeCategorySlug = selectedCategory || product?.category || "";
  const activeCategory = categories.find((c) => c.slug === activeCategorySlug);
  const activeCategorySource = activeCategory ?? (activeCategorySlug ? { slug: activeCategorySlug } : null);
  const newPolicy = !product && activeCategory ? quantityPolicies?.[activeCategory.slug] : undefined;
  // Số lỗi giá: thiếu grade và thiếu đơn giá dòng đầu là hai lỗi chặn gửi duyệt.
  const priceIssueCount = (quantityPreview ? (quantityPreview.grade.trim() ? 0 : 1) : 0) +
    (quantityPreview && quantityPreview.tiers.every((tier) => !tier.priceUsdPerKg.trim()) ? 1 : 0);
  const catalogueAssets = media.filter((asset) => asset.kind !== "image");
  const basicFilled = [snapshot.name, snapshot.keywords, snapshot.description].filter((value) => (value ?? "").trim()).length;
  const specFilled = [snapshot.spec, snapshot.monthly_capacity, snapshot.raw_material_region, snapshot.input_material_origin]
    .filter((value) => (value ?? "").trim()).length;
  const shippingFilled = [snapshot.packaging, snapshot.package_type, snapshot.package_weight_kg, snapshot.package_size,
    snapshot.units_per_carton, snapshot.export_port, snapshot.lead_time_value, snapshot.incoterm_place, snapshot.payment_terms]
    .filter((value) => (value ?? "").trim()).length;
  const sectionPill = (id: string) => {
    switch (id) {
      case "sec-category": return selectedCategory ? { text: "Hoàn tất", tone: "ok" as const } : { text: "Chưa chọn", tone: "muted" as const };
      case "sec-basic": return { text: `${basicFilled}/3 trường`, tone: "muted" as const };
      case "sec-media": return { text: `${imageCount}/6 ảnh`, tone: "muted" as const };
      case "sec-spec": return { text: `${specFilled}/4 trường`, tone: "muted" as const };
      case "sec-price": return priceIssueCount > 0 ? { text: `${priceIssueCount} lỗi`, tone: "error" as const } : { text: "Hoàn tất", tone: "ok" as const };
      case "sec-shipping": return { text: `${shippingFilled}/9 trường`, tone: "muted" as const };
      case "sec-detail": return { text: (snapshot.description_detail ?? "").replace(/<[^>]*>/g, "").trim() ? "Đã có nội dung" : "Trống", tone: "muted" as const };
      default: return undefined;
    }
  };
  const sectionBlocked = (id: string) => {
    switch (id) {
      case "sec-category": return !selectedCategory;
      case "sec-basic": return !(snapshot.name ?? "").trim();
      case "sec-media": return !hasMedia;
      case "sec-price": return priceIssueCount > 0;
      default: return false;
    }
  };
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

  /** Nhảy tới một khối trên trang; mục lục và các nút "Sửa" dùng chung hàm này. */
  function scrollToSection(id: string) {
    setFormError(null);
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // `?step=2` sau khi tạo sản phẩm mới: cuộn thẳng tới khối ảnh thay vì mở một bước riêng.
  useEffect(() => {
    if (initialStep === 2 && typeof document !== "undefined") {
      document.getElementById("sec-media")?.scrollIntoView({ block: "start" });
    }
  }, [initialStep]);

  function detailUrl(id: string) {
    return `/supplier/portal/products/${id}`;
  }

  /**
   * Lưu form hiện tại thành bản nháp và trả về id sản phẩm.
   * Dùng cho cả nút "Lưu nháp" lẫn lúc tải tệp: tải ảnh cần một sản phẩm đã có, nên form
   * được lưu ngầm ngay tại chỗ thay vì bắt người bán đi lưu trước rồi quay lại.
   */
  async function persist(): Promise<string | null> {
    const formElement = formRef.current;
    if (!formElement) return product?.id ?? null;
    const invalid = firstInvalidField(formElement);
    if (invalid) {
      setFormError("Còn trường bắt buộc chưa điền hoặc chưa đúng định dạng. Trang đã cuộn tới ô đó.");
      invalid.focus();
      invalid.scrollIntoView({ block: "center", behavior: "smooth" });
      return null;
    }
    const gradeError = validateCurrentGradeRows();
    if (gradeError) {
      setShowGradeErrors(true);
      setFormError(gradeError);
      setToast({ ok: false, message: gradeError });
      if (typeof document !== "undefined") {
        document.getElementById("new-quantity-pricing")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return null;
    }
    const precheckForm = new FormData(formElement);
    if (!supplierPriceConsentCurrent(supplier) && precheckForm.get("price_publicly_visible") === "yes" && precheckForm.get("confirm_supplier_price_consent") !== "yes") {
      const consentMsg = "Bật công khai giá cần tick đồng ý chia sẻ giá tham khảo.";
      setFormError(consentMsg);
      setToast({ ok: false, message: consentMsg });
      formElement.querySelector<HTMLInputElement>('input[name="confirm_supplier_price_consent"]')?.focus();
      return null;
    }
    setBusy(true);
    setToast(null);
    setFormError(null);
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
        if (pickedBank.length) form.set("bank_media_ids", JSON.stringify(pickedBank.slice(0, 8)));
      }
      const response = await saveSupplierProductAction(form);
      setToast(response);
      if (!response.ok) return null;
      setShowGradeErrors(false);
      setSubmitHint(null);
      const saved = snapshotFromForm(formElement, snapshot);
      setSnapshot(saved);
      setBaseline(saved);
      if (product) router.refresh();
      return response.id ?? product?.id ?? null;
    } catch (error) {
      setToast(reportActionError(error, "Lưu sản phẩm"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = await persist();
    if (!id) return;
    // Sản phẩm mới: sang trang chi tiết để tiếp tục tải ảnh và gửi duyệt.
    if (!product) router.push(detailUrl(id));
  }

  /** Danh sách việc còn thiếu trước khi gửi - dùng cho cả nút bấm và khối nhắc. */
  function submitBlockers(): string[] {
    const blockers: string[] = [];
    if (!product) blockers.push("Lưu thông tin sản phẩm trước khi gửi.");
    if (!hasDetails) blockers.push("Bổ sung mô tả hoặc quy cách ở mục Tên & từ khoá.");
    if (!hasMedia) blockers.push("Tải ít nhất một ảnh sản phẩm ở mục Ảnh & tệp.");
    if (priceIssueCount > 0 && !quantityPreview?.grade.trim()) blockers.push("Chọn grade chuẩn của danh mục.");
    if (priceIssueCount > 0 && quantityPreview && quantityPreview.tiers.every((tier) => !tier.priceUsdPerKg.trim()))
      blockers.push("Nhập đơn giá cho dòng giá đầu tiên.");
    if (dirty) blockers.push("Lưu thay đổi trước khi gửi.");
    return blockers;
  }

  /**
   * Nút gửi luôn bấm được: nếu còn thiếu thì nói rõ thiếu gì và cuộn tới đúng khối,
   * thay vì để một nút xám không phản hồi.
   */
  function requestSubmit() {
    if (busy) return;
    const blockers = submitBlockers();
    if (blockers.length) {
      setSubmitHint(blockers);
      setToast(null);
      if (!hasMedia) { scrollToSection("sec-media"); return; }
      if (!hasDetails) { scrollToSection("sec-basic"); return; }
      if (!product || dirty) { scrollToSection("sec-basic"); return; }
      return;
    }
    void submit();
  }

  async function submit() {
    if (!product || busy) return;
    setBusy(true);
    setSubmitHint(null);
    setToast(null);
    setFormError(null);
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
    if (!product) {
      // Chưa có sản phẩm: tệp đi vào kho ảnh, nên chỉ nhận ảnh và đếm theo kho.
      const bankCount = bankMedia.filter((asset) => !userId || asset.created_by === userId).length;
      if (files.some((file) => uploadKind(file) !== "image")) {
        setToast({ ok: false, message: "Kho ảnh chỉ nhận ảnh JPG, PNG hoặc WebP. Catalogue tải được sau khi lưu sản phẩm." });
        setSelected([]);
        return;
      }
      if (bankCount + files.length > 12) {
        setToast({ ok: false, message: `Kho ảnh tối đa 12 ảnh; hiện bạn đã có ${bankCount} ảnh.` });
        setSelected([]);
        return;
      }
      const tooBig = files.find((file) => file.size > 8 * 1024 * 1024);
      if (tooBig) {
        setToast({ ok: false, message: `Ảnh “${tooBig.name}” quá 8 MB. Chọn ảnh nhẹ hơn.` });
        setSelected([]);
        return;
      }
      setSelected(files);
      return;
    }
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
    if (!canUpload || !selected.length) return;
    setBusy(true);
    let uploaded = 0;
    try {
      // Chưa có sản phẩm: ảnh vào kho ảnh riêng, gắn vào sản phẩm ngay khi bấm Lưu.
      if (!product) {
        const added: string[] = [];
        for (let index = 0; index < selected.length; index++) {
          const file = selected[index];
          if (uploadKind(file) !== "image") throw Error("Kho ảnh chỉ nhận ảnh JPG, PNG hoặc WebP.");
          setProgress(`Đang tải ${index + 1}/${selected.length}: ${file.name}`);
          const body = new FormData();
          body.set("file", file);
          const response = await fetch("/api/supplier-portal/media", { method: "POST", body });
          // Trang lỗi (404/413/500...) trả HTML: đọc .json() sẽ ném — bắt lại để giữ mã HTTP thật.
          const data = await response.json().catch(() => null) as
            { ok?: boolean; message?: string; image?: { id?: string } } | null;
          if (!response.ok || !data?.ok) throw Error(data?.message || `Không tải được ảnh (HTTP ${response.status}).`);
          if (data.image?.id) added.push(data.image.id);
          uploaded++;
        }
        // Ảnh vừa tải được chọn sẵn cho sản phẩm đang tạo để bấm Lưu là xong.
        if (added.length) setPickedBank((current) => Array.from(new Set([...current, ...added])).slice(0, 8));
        setSelected([]);
        setToast({ ok: true, message: `Đã thêm ${uploaded} ảnh vào kho ảnh. Ảnh được gắn vào sản phẩm khi bạn bấm Lưu.` });
        router.refresh();
        return;
      }
      const productId = product.id;
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index];
        const kind = uploadKind(file);
        if (!kind) throw Error("Tệp không đúng định dạng.");
        setProgress(`Đang tải ${index + 1}/${selected.length}: ${file.name}`);
        const body = new FormData();
        body.set("kind", kind);
        body.set("file", file);
        const response = await fetch(`/api/supplier-portal/products/${productId}/media`, { method: "POST", body });
        const data = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
        if (!response.ok || !data?.ok) throw Error(data?.message || `Không tải được tệp (HTTP ${response.status}).`);
        uploaded++;
      }
      setSelected([]);
      setToast({ ok: true, message: live
        ? `Đã tải ${uploaded} tệp lên sản phẩm đã đăng.`
        : `Đã tải ${uploaded} tệp. Tệp sẽ được kiểm tra khi duyệt.` });
      router.refresh();
    } catch (error) {
      if (uploaded) setSelected(selected.slice(uploaded));
      const failure = reportActionError(error, "Tải tệp");
      setToast({ ok: false, message: `${uploaded ? `Đã tải ${uploaded} tệp; chỉ còn tệp chưa hoàn tất trong danh sách chọn. ` : ""}${failure.message}` });
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  /** Bật/tắt một ảnh trong kho ảnh cho lần lưu này. */
  function toggleBank(mediaId: string) {
    setPickedBank((current) => current.includes(mediaId)
      ? current.filter((id) => id !== mediaId)
      : current.length >= 8 ? current : [...current, mediaId]);
  }

  /** Xóa ảnh khỏi kho khi nó chưa gắn vào sản phẩm nào. */
  async function removeBank(mediaId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/supplier-portal/media?media_id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) throw Error(data?.message || `Không xóa được ảnh (HTTP ${response.status}).`);
      setPickedBank((current) => current.filter((id) => id !== mediaId));
      setToast({ ok: true, message: "Đã xóa ảnh khỏi kho ảnh." });
      router.refresh();
    } catch (failure) {
      setToast(reportActionError(failure, "Xóa ảnh"));
    } finally {
      setBusy(false);
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

  /** Mục đích của từng khối: dùng cho mục lục bên trái và nút "Sửa" ở phần xem lại. */
  function sectionDone(id: string): boolean {
    switch (id) {
      case "sec-category": return !!selectedCategory;
      case "sec-basic": return !!(snapshot.name ?? "").trim();
      case "sec-media": return hasMedia;
      case "sec-spec": return !!((snapshot.spec ?? "").trim() || (snapshot.description ?? "").trim());
      case "sec-price": return product
        ? product.ref_price != null || !!quantityEditor
        : !!newQuantity?.tiers.some((tier) => tier.priceUsdPerKg.trim());
      case "sec-shipping": return !!((snapshot.packaging ?? "") || (snapshot.package_type ?? "") || (snapshot.payment_terms ?? ""));
      case "sec-detail": return (snapshot.description_detail ?? "").replace(/<[^>]*>/g, "").trim().length > 0;
      default: return false;
    }
  }

  /**
   * Nội dung của bản xem trước: đúng thứ người mua thấy trên trang công khai.
   * Nhãn tiếng Anh vì trang sản phẩm công khai viết cho người mua nước ngoài; giá trị
   * là nội dung nhà cung cấp đang nhập, không suy đoán thêm gì.
   */
  const buyerPreviewNameEn = (quantityPreview?.nameEn ?? "").trim();
  const buyerPreviewLeadTime = leadTimeUnit === "on_request" || !leadTimeValue.trim()
    ? "On request"
    : leadTimeUnit === "weeks" ? `${leadTimeValue.trim()} weeks` : `${leadTimeValue.trim()} days`;
  const packageWeight = (snapshot.package_weight_kg ?? "").trim();
  const buyerPreviewDetails = [
    { label: "Specification", value: (snapshot.spec ?? "").trim() },
    // Trang công khai chỉ đọc thông số của danh mục, không hiện thông số nhà cung cấp tự thêm.
    ...nonGradeProductFields(fieldsFor(activeCategory)).map((field) => ({
      label: field.label,
      value: String(snapshot[`attribute:${field.key}`] ?? product?.specs?.[field.key] ?? "").trim(),
    })),
    { label: "Monthly capacity", value: (snapshot.monthly_capacity ?? "").trim() },
    { label: "Payment terms", value: (snapshot.payment_terms ?? "").trim() },
  ].filter((row) => row.value);
  const buyerPreviewShipping = [
    { label: "Packaging", value: (snapshot.packaging ?? "").trim() },
    { label: "Package type", value: (snapshot.package_type ?? "").trim() },
    { label: "Weight per package", value: packageWeight ? `${packageWeight} kg` : "" },
    { label: "Package size", value: (snapshot.package_size ?? "").trim() },
    { label: "Units per carton", value: (snapshot.units_per_carton ?? "").trim() },
    { label: "Lead time", value: buyerPreviewLeadTime === "On request" ? "" : buyerPreviewLeadTime },
    { label: "Export port", value: (snapshot.export_port ?? "").trim() },
  ].filter((row) => row.value);
  const buyerPreviewPriceVisible = (snapshot.price_publicly_visible ?? "") === "yes";

  return <div className="mt-3 rounded-xl bg-[#f6f7f9] p-3 sm:p-4">
    <div className="mx-auto grid max-w-[1240px] items-start gap-3.5 lg:grid-cols-[216px_minmax(0,1fr)_304px]">
      {/* Mục lục neo: giống Seller Center, không chặn đường đi, bấm là nhảy tới khối. */}
      <nav aria-label="Mục lục hồ sơ sản phẩm" className="hidden lg:sticky lg:top-4 lg:block">
        <div className="rounded-lg border border-ink-200 bg-white p-2">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.14em] text-ink-500 uppercase">Hồ sơ sản phẩm</p>
          <ol className="space-y-0.5">
            {FORM_SECTIONS.map((item, index) => {
              const done = sectionDone(item.id);
              const blocked = sectionBlocked(item.id);
              return <li key={item.id}>
                <a href={`#${item.id}`} className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-ink-50">
                  <span aria-hidden="true" className={`mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${done
                    ? "bg-emerald-600 text-white"
                    : blocked ? "border border-rose-500 bg-white text-[10px] font-black text-rose-600" : "border border-ink-300 bg-white text-ink-500"}`}>
                    {done ? <Check className="size-3" aria-hidden="true" /> : blocked ? "!" : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-4.5 font-bold text-ink-800 group-hover:text-brand-800">{item.label}</span>
                    <span className="block text-[11px] leading-4 text-ink-500">{item.hint}</span>
                  </span>
                </a>
              </li>;
            })}
          </ol>
        </div>
        <p className="mt-2 px-2 text-[11px] leading-4 text-ink-500">Bấm một mục để nhảy tới. Mọi khối nằm trên cùng một trang.</p>
      </nav>

      <div className="min-w-0 space-y-3 [&_.input]:rounded-md [&_.input]:py-1.5 [&_.input]:text-[12.5px] [&_.input]:leading-5">
        {(review === "pending" || review === "changes_requested" || review === "paused") && <section aria-label="Trạng thái xét duyệt"
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 ${review === "changes_requested" ? "border-rose-200 bg-rose-50" : review === "paused" ? "border-slate-300 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>{statusLabel}</span>
          <p className="min-w-0 flex-1 text-[12px] leading-5 text-ink-700">
            {review === "pending"
              ? product?.reviewed_category_slug
                ? "Đang rà soát lại giá. Bạn xem được nhưng chưa sửa cho tới khi xong."
                : "Đã gửi duyệt. Bạn có thể xem nhưng chưa thể chỉnh sửa hoặc tải tệp."
              : review === "paused"
                ? "Sản phẩm đang ẩn khỏi người mua. Gửi duyệt lại khi muốn đăng."
                : "Xem góp ý, chỉnh sửa, lưu lại rồi gửi duyệt lần nữa."}
          </p>
        </section>}

        {legacyManaged && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900">
          Sản phẩm này được quản lý từ trước. Để cập nhật nội dung, hãy tạm ẩn rồi gửi duyệt lại, hoặc liên hệ bộ phận hỗ trợ.
        </p>}

        {product?.supplier_review_note && <p className="whitespace-pre-wrap rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-rose-800">
          <AlertCircle className="mr-1 inline size-4" aria-hidden="true" /> Yêu cầu chỉnh sửa: {product.supplier_review_note}
        </p>}

        {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12.5px] font-semibold text-rose-900">{formError}</p>}

        <form id="product-info" ref={formRef} onSubmit={save} onChange={onFormChange} noValidate>
          {/* 01 — Ngành hàng */}
          <section id="sec-category" data-form-section="sec-category" aria-label="Ngành hàng"
            className="scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="1" title="Ngành hàng" pill={sectionPill("sec-category")}
              hint="Quyết định grade, bảng giá và thông số" />
            <div>
              <Row label="Danh mục sản phẩm" required error={!selectedCategory}
                hint={selectedCategory
                  ? "Chọn danh mục phù hợp với sản phẩm. Danh mục được kiểm tra khi duyệt; đổi danh mục thì grade đổi theo."
                  : "Chọn danh mục phù hợp với sản phẩm để mở grade và bảng giá."}>
                <div className="flex flex-wrap items-center gap-2">
                  <select name="supplier_category_proposal" className="input min-w-0 flex-1" required value={selectedCategory}
                    onChange={(e) => onCategorySelect(e.target.value)} disabled={locked || categoryLocked || !categories.length}>
                    <option value="" disabled>Chọn danh mục sản phẩm</option>
                    {categories.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} / ` : ""}{c.label}</option>)}
                  </select>
                  {categoryLocked && <input type="hidden" name="supplier_category_proposal" value={selectedCategory} />}
                  <Link href="/supplier/portal/categories" className="btn btn-ghost btn-sm">Gợi ý theo tên</Link>
                </div>
                {categoryLocked && <p className="mt-1 text-[11.5px] text-ink-500">Danh mục đã được chốt khi duyệt.</p>}
                {selectedCategory && (certificateInheritance[selectedCategory] ?? []).length > 0 && <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
                  <p className="text-[11px] font-bold tracking-wider text-teal-900 uppercase">Chứng nhận áp dụng</p>
                  <ul className="mt-1 space-y-0.5">
                    {(certificateInheritance[selectedCategory] ?? []).map((certificate) => (
                      <li key={certificate.id} className="flex items-start gap-1.5 text-[12px] text-ink-800">
                        <span aria-hidden="true" className="mt-0.5 text-emerald-700">✓</span>
                        <span>
                          {certificate.name}
                          {certificate.scheme ? ` · ${certificate.scheme}` : ""}
                          {certificate.validUntil ? ` · hạn ${certificate.validUntil}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] leading-4 text-ink-600">
                    Danh mục này đã có giấy được duyệt nên sản phẩm tự nhận.
                    Bỏ tick giấy không đúng ở trang sản phẩm sau khi lưu nháp.
                  </p>
                </div>}
                {!categoryLocked && selectedCategory && categoryScope.length > 0 && !categoryScope.includes(selectedCategory) &&
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-4 text-amber-900">
                    Danh mục nằm ngoài nhóm hàng đã đăng ký. Bạn vẫn có thể gửi duyệt.
                  </p>}
              </Row>
              {!categories.length && <div className="px-4 py-2 sm:px-5"><p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                Bạn chưa chọn danh mục kinh doanh đang mở. <Link href="/supplier/portal/categories" className="font-semibold underline">Chọn danh mục trước khi thêm sản phẩm</Link>
              </p></div>}
            </div>
          </section>

          {/* 02 — Tên & từ khoá */}
          <section id="sec-basic" data-form-section="sec-basic" aria-label="Tên và từ khoá"
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="2" title="Tên &amp; từ khoá" pill={sectionPill("sec-basic")}
              hint="Người mua gõ gì để thấy sản phẩm này" />
            <div>
              <Row label="Tên sản phẩm" required hint="Không ghi grade trong tên. Tên tiếng Anh do Vexim dịch khi duyệt.">
                <div className="flex items-start gap-2">
                  <input name="name" className="input" required maxLength={180} minLength={3} placeholder="Nhập tên mặt hàng của bạn"
                    defaultValue={product?.name ?? ""} disabled={locked} aria-invalid={nameGradeError ? true : undefined} />
                  <span className="shrink-0 pt-2 font-mono text-[11px] tabular-nums text-ink-400">
                    {(snapshot.name ?? "").length}/180
                  </span>
                </div>
                {nameGradeError && <span className="mt-1 block text-[11.5px] text-rose-700">{nameGradeError}</span>}
              </Row>
              <Row label="Từ khoá tìm kiếm" hint="1–3 từ tiếng Anh, cách nhau bằng dấu phẩy.">
                <input name="keywords" className="input" maxLength={120} placeholder="cashew, w320, vietnam"
                  defaultValue={(product?.keywords ?? []).join(", ")} disabled={locked} />
              </Row>
              <Row label="Mô tả ngắn" hint="Một tới hai câu, hiện cạnh ảnh sản phẩm.">
                <textarea name="description" className="input min-h-[76px] resize-y" rows={3} maxLength={1500}
                  placeholder="Giới thiệu ngắn gọn về sản phẩm..." defaultValue={product?.description ?? ""} disabled={locked} />
              </Row>
            </div>
          </section>

          {/* 03 — Ảnh & tệp */}
          <section id="sec-media" data-form-section="sec-media" aria-label="Ảnh và tệp"
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="3" title="Ảnh &amp; tệp" pill={sectionPill("sec-media")}
              hint={live
                ? "JPG, PNG, WebP ≤ 8 MB hoặc PDF ≤ 15 MB. Tệp hiện cho người mua khi sản phẩm đăng."
                : review === "approved"
                  ? "JPG, PNG, WebP ≤ 8 MB hoặc PDF ≤ 15 MB. Tệp ở chế độ nội bộ khi chờ đăng."
                  : "JPG, PNG, WebP tối đa 8 MB hoặc PDF tối đa 15 MB. Tệp được kiểm tra khi duyệt."} />
            <div>
              {/* Sản phẩm chưa tồn tại thì ảnh nằm trong kho riêng của nhà cung cấp.
                  Tải ảnh không cần lưu nháp trước; chọn ảnh nào là gắn ảnh đó khi bấm Lưu. */}
              {!product && <Row label="Kho ảnh" hint="Bấm vào ảnh để chọn hoặc bỏ chọn. Ảnh không chọn vẫn nằm trong kho cho sản phẩm khác.">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[12px] font-semibold text-ink-700">Kho ảnh của bạn</p>
                  <p className="text-[11.5px] font-semibold tabular-nums text-brand-800">Đã chọn {pickedBank.length}/8</p>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-4 text-ink-500">Tải ảnh lên trước rồi chọn ảnh cần dùng. Ảnh được gắn vào sản phẩm khi bạn bấm Lưu.</p>
                {bankMedia.length ? <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {bankMedia.map((asset) => {
                    const url = privateMediaUrl(asset);
                    const picked = pickedBank.includes(asset.id);
                    return <li key={asset.id} className="relative">
                      <button type="button" disabled={busy} onClick={() => toggleBank(asset.id)} aria-pressed={picked}
                        aria-label={picked ? "Bỏ chọn ảnh này" : "Chọn ảnh này cho sản phẩm"}
                        className={`block w-full overflow-hidden rounded-md border transition ${picked ? "border-brand-600 ring-2 ring-brand-200" : "border-ink-200 hover:border-brand-300"}`}>
                        <span className="block aspect-square overflow-hidden bg-ink-100">
                          {url
                            ? <img src={url} alt="" className="size-full object-cover" />
                            : <span className="flex size-full items-center justify-center text-ink-400"><ImageIcon className="size-4" aria-hidden="true" /></span>}
                        </span>
                      </button>
                      {picked && <span className="pointer-events-none absolute top-1 left-1 rounded-full bg-brand-700 px-1.5 py-0.5 text-[9px] font-bold text-white">Gắn</span>}
                      <button type="button" disabled={busy} onClick={() => void removeBank(asset.id)}
                        aria-label="Xóa ảnh khỏi kho" title="Xóa ảnh khỏi kho"
                        className="absolute top-1 right-1 rounded-full bg-white/95 p-1 text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50">
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </li>;
                  })}
                </ul> : <p className="mt-2 rounded-md border border-dashed border-ink-300 bg-white px-3 py-3 text-center text-[11.5px] text-ink-600">Kho đang trống. Tải ảnh ở ô bên dưới, không cần lưu sản phẩm trước.</p>}
              </Row>}

              {/* Ảnh đại diện đứng trước: người mua thấy ảnh này đầu tiên trong kết quả tìm kiếm. */}
              <Row label="Ảnh đại diện" hint="Người mua thấy ảnh này đầu tiên · nên dùng nền trắng, ≥ 800×800 px.">
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
                  className="flex flex-wrap items-center gap-3"
                >
                  <div className={`size-[92px] shrink-0 overflow-hidden rounded-md border transition ${coverHover ? "border-brand-500 ring-2 ring-brand-200" : "border-dashed border-ink-300"} bg-white`}>
                    {coverUrl
                      ? <img src={coverUrl} alt="Ảnh đại diện" className="size-full object-cover" />
                      : <span className="flex size-full items-center justify-center text-ink-400"><ImageIcon className="size-6" aria-hidden="true" /></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-5 text-ink-600">{coverUrl
                      ? "Ảnh này hiện đầu tiên với người mua. Bấm ngôi sao ở ô ảnh bên dưới để đổi ảnh đại diện."
                      : "Tự lấy ảnh chính. Tải ảnh ở mục Ảnh sản phẩm bên dưới."}</p>
                    {cover && canDeleteAsset(cover) && <button type="button" disabled={busy} onClick={() => void removeMedia(cover.id)}
                      aria-label="Xóa ảnh đại diện" title="Xóa ảnh đại diện"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                      <Trash2 className="size-3" aria-hidden="true" /> Xóa ảnh
                    </button>}
                  </div>
                </div>
              </Row>

              {/* Sáu ô ảnh sản phẩm: ô đầu là ảnh chính. */}
              <Row label="Ảnh sản phẩm" required error={!hasMedia}>
                <ul aria-label="6 ô ảnh sản phẩm" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, index) => {
                    const asset = imageSlots[index];
                    const src = asset ? privateMediaUrl(asset) : null;
                    const isCover = !!asset && asset.id === cover?.id;
                    return <li key={asset?.id ?? `empty-${index}`} className="relative">
                      <div className={`relative aspect-square overflow-hidden rounded-md border ${asset ? "border-ink-200 bg-white" : "border-dashed border-ink-300 bg-white"}`}>
                        {src
                          ? <img src={src} alt="" className="size-full object-cover" />
                          : <span className="flex size-full flex-col items-center justify-center gap-0.5 text-ink-400">
                            <Plus className="size-5" aria-hidden="true" />
                            <span className="text-[10px] font-semibold">{index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`}</span>
                          </span>}
                        {asset && (isCover || canUpload || canDeleteAsset(asset)) && <div className="absolute inset-x-1 top-1 flex items-start justify-between gap-1">
                          <span>{isCover && <span role="img" aria-label="Ảnh chính" title="Ảnh chính"
                            className="flex size-[18px] items-center justify-center rounded-full bg-brand-700 text-white shadow-sm">
                            <Star className="size-[11px] fill-current" aria-hidden="true" />
                          </span>}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {canUpload && !isCover && <button type="button" disabled={busy} onClick={() => void makeCover(asset.id)}
                              aria-label={`Đặt ${index === 0 ? "ảnh này" : `ảnh ${index + 1}`} làm ảnh đại diện`} title="Đặt làm ảnh đại diện"
                              className="rounded-full bg-white/95 p-1 text-brand-700 shadow-sm hover:bg-brand-50 disabled:opacity-50">
                              <Star className="size-3" aria-hidden="true" />
                            </button>}
                            {canDeleteAsset(asset) && <button type="button" disabled={busy} onClick={() => void removeMedia(asset.id)}
                              aria-label={`Xóa ảnh ${index + 1}`} title="Xóa ảnh"
                              className="rounded-full bg-white/95 p-1 text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50">
                              <X className="size-3" aria-hidden="true" />
                            </button>}
                          </span>
                        </div>}
                      </div>
                    </li>;
                  })}
                </ul>
                {imageCount >= 6 && <p className="mt-1.5 text-[11.5px] text-ink-500">Đã đủ 6 ô. Xóa bớt ảnh nếu muốn thay ảnh khác.</p>}

                {/* Một chỗ tải tệp duy nhất: ngay dưới 6 ô ảnh. */}
                {canUpload ? <>
                  <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFiles(Array.from(e.dataTransfer.files)); }}
                    className="mt-2 rounded-md border border-dashed border-ink-300 bg-white px-4 py-3 text-center transition hover:border-brand-400 focus-within:border-brand-600">
                    <p className="text-[12px] text-ink-600">Kéo thả hoặc{" "}
                      <label className="cursor-pointer font-semibold text-brand-700 underline">{product ? "chọn ảnh hoặc PDF" : "chọn ảnh"}
                        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" aria-label="Chọn ảnh sản phẩm hoặc catalogue"
                          onChange={(e) => { chooseFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                      </label>
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-500">{product
                      ? `Đã tải ${ownedCount}/12 tệp. Ảnh vào 6 ô, PDF vào mục catalogue.`
                      : `Kho có ${bankMedia.length}/12 ảnh. Ảnh vào kho ảnh trước, gắn vào sản phẩm khi bạn bấm Lưu.`}</p>
                  </div>
                  {selected.length > 0 && <div className="mt-2 rounded-md border border-brand-200 bg-brand-50 p-2.5">
                    <p className="text-[12px] font-semibold text-brand-900">Đã chọn {selected.length} tệp</p>
                    <ul className="mt-1 max-h-24 space-y-0.5 overflow-auto text-[11px] text-brand-900">{selected.map((file, index) => <li key={`${file.name}-${index}`} className="truncate">{file.name} - {(file.size / 1024 / 1024).toFixed(1)} MB</li>)}</ul>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={upload} className="btn btn-primary btn-sm"><UploadCloud className="size-4" aria-hidden="true" /> {product ? `Tải ${selected.length} tệp` : `Thêm ${selected.length} ảnh vào kho`}</button>
                      <button type="button" disabled={busy} onClick={() => setSelected([])} className="btn btn-ghost btn-sm">Bỏ chọn</button>
                    </div>
                  </div>}
                </> : <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900">
                  {locked ? "Đang chờ duyệt nên tạm khoá tải tệp. Duyệt xong hoặc bị trả về, bạn tải thêm được ngay."
                    : "Sản phẩm do Vexim quản lý từ trước nên bạn chưa sửa được tệp. Liên hệ hỗ trợ khi cần thêm ảnh."}
                </div>}
                {progress && <p role="status" className="mt-1.5 text-[12px] font-semibold text-brand-800">{progress}</p>}
              </Row>

              {/* Chỉ còn một chỗ tải ảnh: 6 ô ở trên. Danh sách dưới đây chỉ để xem lại
                  catalogue PDF đã tải, không lặp lại ảnh. */}
              {catalogueAssets.length > 0 && <Row label="Catalogue PDF">
                <ul className="space-y-1.5">
                  {catalogueAssets.map((asset) => {
                    const url = privateMediaUrl(asset);
                    return <li key={asset.id} className="flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-2">
                      <FileText className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink-900">{asset.caption || "Catalogue"}</span>
                      {url && <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-[11.5px] font-semibold text-brand-700 underline">Xem tệp</a>}
                      {canDeleteAsset(asset) && <button type="button" disabled={busy} onClick={() => void removeMedia(asset.id)}
                        aria-label={`Xóa ${asset.caption || "tệp"}`} title="Xóa tệp"
                        className="shrink-0 rounded-md border border-rose-200 bg-white p-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                        <X className="size-3" aria-hidden="true" />
                      </button>}
                    </li>;
                  })}
                </ul>
                <p className="mt-1.5 text-[11.5px] leading-4 text-ink-500">Catalogue chỉ là tệp đính kèm; ảnh sản phẩm vẫn nằm ở 6 ô phía trên.</p>
              </Row>}
            </div>
          </section>

          {/* 04 — Quy cách & năng lực */}
          <section id="sec-spec" data-form-section="sec-spec" aria-label="Quy cách và năng lực"
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="4" title="Quy cách &amp; năng lực" pill={sectionPill("sec-spec")}
              hint="Thông số người mua so sánh" />
            <div>
              <Row label="Quy cách / tiêu chuẩn" hint="Cần ít nhất một trong hai: mô tả ngắn hoặc quy cách.">
                <textarea name="spec" className="input min-h-[76px] resize-y" rows={3} maxLength={800}
                  placeholder="Ví dụ: Size W320, độ ẩm ≤ 5%, đóng gói 25 kg..." defaultValue={product?.spec ?? ""} disabled={locked} />
              </Row>
              <Row label="Năng lực mỗi tháng">
                <input className="input max-w-[280px]" name="monthly_capacity" maxLength={180} placeholder="Ví dụ: 200 tấn/tháng"
                  defaultValue={product?.monthly_capacity ?? ""} disabled={locked} />
              </Row>
              <Row label="Vùng nguyên liệu" hint="Có thể ghi nhiều vùng cho sản phẩm này.">
                <RawMaterialRegionInput defaultValue={product?.raw_material_region ?? ""} disabled={locked} />
              </Row>
              <Row label="Xuất xứ nguyên liệu đầu vào" hint="Nguồn trong nước, nhập khẩu hoặc kết hợp.">
                <input name="input_material_origin" className="input" maxLength={300}
                  placeholder="Ví dụ: Việt Nam, Campuchia hoặc nguồn kết hợp" defaultValue={product?.input_material_origin ?? ""} disabled={locked} />
              </Row>
              {!!selectedCategory && (officialAttributeFields.length > 0 || supplierAttributeFields.length > 0) &&
                <Row label="Thông số riêng ngành hàng">
                  {/* Chỉ hiện thêm khối thông số khi danh mục còn thông số khác ngoài Grade. */}
                  <SupplierAttributeInputs key={selectedCategory} disabled={locked}
                    officialFields={officialAttributeFields}
                    supplierFields={supplierAttributeFields}
                    values={product?.supplier_category_proposal === selectedCategory || product?.reviewed_category_slug === selectedCategory ? product?.specs ?? {} : {}}
                    onCommit={onAttributesCommit} />
                </Row>}
              <Row label="Dịch vụ">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-ink-700">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" name="oem" value="yes" defaultChecked={product?.oem ?? false} disabled={locked} className="size-4 accent-brand-700" /> Nhận gia công OEM</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" name="odm" value="yes" defaultChecked={product?.odm ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có dịch vụ thiết kế &amp; sản xuất ODM</label>
                  <label className="inline-flex w-full items-center gap-2"><input type="checkbox" name="samples" value="yes" defaultChecked={product?.samples ?? false} disabled={locked} className="size-4 accent-brand-700" /> Có thể gửi mẫu</label>
                </div>
              </Row>
            </div>
          </section>

          {/* 05 — Giá & điều kiện bán */}
          <section id="sec-price" data-form-section="sec-price" aria-label="Giá và điều kiện bán"
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="5" title="Giá &amp; điều kiện bán" pill={sectionPill("sec-price")}
              hint="Bảng giá bậc, MOQ, Incoterm, giá mẫu" />
            <div>
              <Row label="Giá theo số lượng" required error={priceIssueCount > 0}
                hint={priceIssueCount > 0 ? "Chọn grade và nhập đơn giá để tiếp tục." : "Số lượng dòng đầu là MOQ (đơn hàng tối thiểu)."}>
              {product ? <div className="rounded-md border border-ink-200 p-3">
                {quantityEditor ? <QuantityPricingInline key={`${quantityEditor.productId}:${quantityEditor.updatedAt}`}
                  data={quantityEditor} actor="supplier" disabled={locked || busy} dirty={dirty} onPreviewChange={setQuantityPreview} />
                  : <p role="alert" className="text-xs text-rose-700">Chưa tải được bảng giá mới. Kiểm tra danh mục và kết nối; giá đang hiển thị không bị thay đổi.</p>}
              </div> : <div id="new-quantity-pricing" className="space-y-3 rounded-md border border-ink-200 p-3">
                {!activeCategory ? <p className="text-xs text-ink-600">Chọn danh mục để nhập grade và bảng giá.</p> : !newPolicy || !newQuantity ?
                  <p role="alert" className="text-xs text-rose-700">Chưa tải được cấu hình bảng giá. Vui lòng kiểm tra kết nối trước khi lưu.</p> : <>
                    <p className="text-xs text-ink-600">Không ghi grade trong tên sản phẩm. Tên tiếng Anh sẽ được dịch sau khi bạn gửi duyệt và được kiểm tra bởi quản trị viên.</p>
                    {newQuantity && <QuantityPricingEditor value={newQuantity} onChange={onNewQuantityChange} standardGrades={newGrades} policy={newPolicy}
                      buyerPriceUnit={newBuyerUnit} pricePubliclyVisible={snapshot.price_publicly_visible === "yes"}
                      isolated showPreview={false} showTitle={false} validateEnglishName={false} showErrors={showGradeErrors} consentChecked={quantityConsent} onConsentChange={setQuantityConsent} />}
                  </>}
              </div>}
              </Row>

              <Row label="Giá mẫu (USD)" hint="Bỏ trống nếu không bán mẫu.">
                <input className="input max-w-[200px]" name="sample_price_usd" inputMode="decimal" placeholder="Ví dụ: 5"
                  defaultValue={product?.sample_price_usd ?? ""} disabled={locked} />
              </Row>

              <Row label="Hiển thị giá">
                <div className="text-[12px] text-ink-700">
                <label className="flex items-start gap-2 font-semibold">
                  <input type="checkbox" name="price_publicly_visible" value="yes" defaultChecked={priceOptInDefault(product)} disabled={locked} className="mt-0.5 size-4 accent-brand-700" />
                  Cho phép công khai giá tham khảo khi đủ điều kiện
                </label>
                {!product && <p className="mt-1 pl-6 text-[11px] leading-4 text-ink-500">Được chọn sẵn. Bỏ chọn nếu chưa muốn chia sẻ giá.</p>}
                {product && <div className="mt-2 rounded-md bg-white p-2.5 text-[11px] leading-4" role="status">
                  <strong>Tình trạng giá đã lưu:</strong> {productPriceBlockers(product, supplier).length === 0 ? "Sản phẩm và doanh nghiệp đã cho phép chia sẻ giá." : "Người mua vẫn thấy On request."}
                  <ul className="mt-1 list-disc pl-5">{productPriceBlockers(product, supplier).map((reason) => <li key={reason}>{reason}</li>)}
                    {(review !== "approved" || !product.ready_for_buyer || supplier.status !== "published") && <li>Sản phẩm chưa đủ điều kiện công khai hoặc hồ sơ doanh nghiệp chưa được xuất bản.</li>}
                  </ul>
                  {dirty && <p className="mt-1 font-semibold text-amber-800">Thay đổi ở form chưa lưu; dòng trên là tình trạng trước khi lưu.</p>}
                </div>}
                <p className="mt-1.5 text-[11px] leading-4 text-ink-600">
                  Cần ảnh/catalogue, danh mục và hồ sơ doanh nghiệp được duyệt trước khi người mua thấy.
                  {supplierPriceConsentCurrent(supplier) ? " Xác nhận chia sẻ giá đang còn hiệu lực." : ""}
                </p>
                </div>
              </Row>

              <Row label="Xác nhận" required={snapshot.price_publicly_visible === "yes"}>
                {!supplierPriceConsentCurrent(supplier) && <div className="rounded-md border border-ink-200 bg-white p-3">
                  <label className="flex items-start gap-2 text-[11px] font-medium text-brand-900">
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
              </Row>
            </div>
          </section>

          {/* 06 — Đóng gói & giao hàng */}
          <section id="sec-shipping" data-form-section="sec-shipping" aria-label="Đóng gói và giao hàng"
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="6" title="Đóng gói &amp; giao hàng" pill={sectionPill("sec-shipping")}
              hint="Kiện hàng, thời gian, cảng, thanh toán" />
            <div>
              <Row label="Đóng gói">
                <div className="space-y-3">
                  <SubField label="Bao bì / đóng gói">
                    <input className="input" name="packaging" maxLength={300} placeholder="Ví dụ: túi hút chân không 25 kg"
                      defaultValue={product?.packaging ?? ""} disabled={locked} />
                  </SubField>
                  <p className="-mt-1.5 text-[11.5px] leading-4 text-ink-500">Mô tả bằng lời.</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SubField label="Loại kiện">
                      <input className="input" name="package_type" maxLength={40} placeholder="bao, thùng, pallet"
                        defaultValue={product?.package_type ?? ""} disabled={locked} />
                    </SubField>
                    <SubField label="Khối lượng mỗi kiện (kg)">
                      <input className="input" name="package_weight_kg" inputMode="decimal" placeholder="25"
                        defaultValue={product?.package_weight_kg ?? ""} disabled={locked} />
                    </SubField>
                    <SubField label="Số đơn vị mỗi thùng">
                      <input className="input" name="units_per_carton" inputMode="numeric" placeholder="20"
                        defaultValue={product?.units_per_carton ?? ""} disabled={locked} />
                    </SubField>
                  </div>
                  <SubField label="Kích thước kiện (cm)">
                    <input className="input max-w-[300px]" name="package_size" maxLength={60} placeholder="60 × 40 × 40"
                      defaultValue={product?.package_size ?? ""} disabled={locked} />
                  </SubField>
                  <p className="-mt-1.5 text-[11.5px] leading-4 text-ink-500">Dài × rộng × cao, tính bằng cm.</p>
                </div>
              </Row>

              <Row label="Thời gian giao hàng"
                hint="Số ngày hoặc tuần từ lúc xác nhận đơn đến khi hàng sẵn sàng giao, chưa tính vận chuyển.">
                <div className="flex items-center gap-2">
                  <input
                    name="lead_time_value"
                    type="number"
                    min={1}
                    max={leadTimeUnit === "weeks" ? 52 : 365}
                    className="input w-[120px] shrink-0 font-mono tabular-nums disabled:bg-ink-50 disabled:text-ink-400"
                    placeholder={leadTimeUnit === "on_request" ? "-" : leadTimeUnit === "weeks" ? "VD: 2" : "VD: 15"}
                    value={leadTimeUnit === "on_request" ? "" : leadTimeValue}
                    onChange={(e) => updateLeadTime(e.target.value, leadTimeUnit)}
                    disabled={locked || leadTimeUnit === "on_request"}
                  />
                  <select
                    name="lead_time_unit"
                    aria-label="Đơn vị thời gian giao hàng"
                    className="input w-[120px] shrink-0"
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
              </Row>

              <Row label="Vận chuyển">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SubField label="Cảng xuất">
                    <input name="export_port" className="input" maxLength={120} placeholder="Ví dụ: Cát Lái"
                      defaultValue={String(product?.export_port ?? "")} disabled={locked} />
                  </SubField>
                  <SubField label="Địa điểm Incoterm">
                    <input name="incoterm_place" className="input" maxLength={100} placeholder="Ví dụ: Hồ Chí Minh"
                      defaultValue={String(product?.incoterm_place ?? "")} disabled={locked} />
                  </SubField>
                </div>
              </Row>

              <Row label="Điều kiện thanh toán">
                <input name="payment_terms" className="input" maxLength={200} placeholder="Ví dụ: T/T 30% cọc"
                  value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} disabled={locked} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["T/T 30% cọc", "L/C at sight", "D/P"].map((option) => <button key={option} type="button" disabled={locked}
                    onClick={() => setPaymentTerm(option)}
                    className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-800 disabled:opacity-50">
                    {option}
                  </button>)}
                </div>
              </Row>
            </div>
          </section>

          {/* 07 — Nội dung chi tiết */}
          <section id="sec-detail" data-form-section="sec-detail" aria-label="Nội dung chi tiết"
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="7" title="Nội dung chi tiết" pill={sectionPill("sec-detail")}
              hint="Bài người mua đọc kỹ trước khi hỏi giá" />
            <div className="px-4 py-4 sm:px-5">
              <div className="text-[12px]">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">Mô tả chi tiết</span>
                <ProductDescriptionEditor id="supplier-product-description-detail" name="description_detail"
                  value={snapshot.description_detail} onChange={onDescriptionDetailChange} disabled={locked || busy} />
                <span className="mt-1 block text-[11px] leading-4 text-ink-500">Dùng tiêu đề, in đậm, danh sách cho dễ đọc. Không nhập thông tin liên hệ trực tiếp.</span>
              </div>
            </div>
          </section>
        </form>

        {/* 08 — Xem lại & gửi */}
        <section id="sec-review" data-form-section="sec-review" aria-label="Xem lại và gửi"
          className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
          <SectionHead index="8" title="Xem lại &amp; gửi" />
          <div className="space-y-2.5 px-3 py-2.5 sm:px-3.5">
            {/* Danh sách kiểm tra: mỗi dòng một việc, bên phải là hành động tương ứng. */}
            <ul className="space-y-2 px-4 py-4 sm:px-5">
              {([
                { ok: !!product && !dirty, label: "Lưu thông tin sản phẩm trước khi gửi",
                  action: "Lưu ngay", run: () => formRef.current?.requestSubmit() },
                { ok: hasDetails, label: "Bổ sung mô tả ngắn hoặc quy cách",
                  action: "Đi tới mục 2", run: () => scrollToSection("sec-basic") },
                { ok: hasMedia, label: "Tải ít nhất một ảnh sản phẩm hoặc catalogue",
                  action: "Đi tới mục 3", run: () => scrollToSection("sec-media") },
                { ok: priceIssueCount === 0 && !!quantityPreview, label: "Chọn grade và nhập giá",
                  action: "Đi tới mục 5", run: () => scrollToSection("sec-price") },
                { ok: !!(snapshot.name ?? "").trim() && !!selectedCategory, label: "Tên và danh mục đã điền",
                  action: "Sửa", run: () => scrollToSection("sec-category") },
              ]).map((row) => <li key={row.label}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-ink-200 px-3 py-2.5">
                {row.ok
                  ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  : <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />}
                <span className={`min-w-0 flex-1 text-[12.5px] ${row.ok ? "text-ink-700" : "font-semibold text-ink-900"}`}>{row.label}</span>
                <button type="button" onClick={row.run}
                  className="shrink-0 text-[12px] font-bold text-brand-800 underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
                  {row.ok ? "Sửa" : row.action}
                </button>
              </li>)}
            </ul>

            <details className="mx-4 mb-4 rounded-md border border-ink-200 sm:mx-5">
              <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-bold text-ink-700">Xem lại nội dung đã nhập</summary>
              <div className="space-y-2.5 px-3 pb-3">
            <div className="rounded-lg border border-ink-200">
              <ReviewHead title="Tên, danh mục &amp; mô tả" onEdit={() => scrollToSection("sec-basic")} />
              <dl className="grid gap-x-4 gap-y-2 px-3.5 py-2.5 text-[12px] sm:grid-cols-2">
                <div className="sm:col-span-2"><ReviewField label="Tên sản phẩm" value={snapshot.name} strong /></div>
                <div className="sm:col-span-2"><ReviewField label="Danh mục" value={categoryLabel} /></div>
                <div><ReviewField label="Từ khoá" value={snapshot.keywords} /></div>
                <div><ReviewField label="Mô tả ngắn" value={snapshot.description} /></div>
                <div><ReviewField label="Quy cách / tiêu chuẩn" value={snapshot.spec} /></div>
                <div><ReviewField label="Năng lực mỗi tháng" value={snapshot.monthly_capacity} /></div>
                <div><ReviewField label="Vùng nguyên liệu" value={snapshot.raw_material_region} /></div>
                <div><ReviewField label="Xuất xứ nguyên liệu đầu vào" value={snapshot.input_material_origin} /></div>
                {attributeRows.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-semibold text-ink-500">Thông số theo nhóm hàng</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">{attributeRows.map(([label, value]) =>
                      <span key={label} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-800"><strong className="font-semibold">{label}:</strong> {value}</span>)}</dd>
                  </div>
                )}
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-[11px] font-semibold text-ink-500">Mô tả chi tiết</dt>
                  <dd className="mt-1 rounded-lg bg-ink-50 px-2.5 py-1.5"><ProductDescriptionPreview value={snapshot.description_detail} /></dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-ink-200">
              <ReviewHead title="Giá, MOQ &amp; điều kiện bán" onEdit={() => scrollToSection("sec-price")} />
              <div className="px-3.5 py-2.5 text-[12px]">
                {quantityEditor?.v2 ? <>
                  <p>Grade: <strong>{quantityEditor.grade}</strong> · Incoterm: <strong>{quantityEditor.incoterm}</strong></p>
                  <table className="mt-1.5 w-full text-left text-[11.5px]"><thead><tr><th>Số lượng ({quantityEditor.v2.unit === "mt" ? "MT" : "kg"})</th><th>Giá (USD/{quantityEditor.v2.unit === "mt" ? "MT" : "kg"})</th></tr></thead>
                    <tbody>{quantityEditor.v2.tiers.map((tier, index) => <tr key={index} className="border-t border-ink-100"><td className="py-1 tabular-nums">{tier.quantity}</td><td className="py-1 tabular-nums">{tier.price}</td></tr>)}</tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-ink-500">{quantityEditor.pendingPriceId ? "Bảng giá đang chờ duyệt." : "Bảng giá đã duyệt."}</p>
                </> : quantityEditor && quantityPreview ? <>
                  <p>Grade: <strong>{quantityPreview.grade || "Chưa chọn"}</strong> · Tiền tệ: <strong>{quantityPreview.currency ?? "USD"}</strong></p>
                  <table className="mt-1.5 w-full text-left text-[11.5px]"><thead><tr><th>Incoterm</th><th>Số lượng từ (kg)</th><th>Giá ({quantityPreview.currency ?? "USD"}/kg)</th></tr></thead>
                    <tbody>{quantityPreview.tiers.map((tier, index) => <tr key={index} className="border-t border-ink-100"><td className="py-1">{tier.incoterm || quantityPreview.incoterm || "—"}</td><td className="py-1 tabular-nums">{tier.minKg || "—"}</td><td className="py-1 tabular-nums">{tier.priceUsdPerKg || "—"}</td></tr>)}</tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-ink-500">Bảng giá cần được duyệt.</p>
                </> : <span>Chưa tải được bảng giá mới.</span>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([
                    [snapshot.price_publicly_visible === "yes", "Công khai giá khi đủ điều kiện"],
                    [snapshot.oem === "yes", "Nhận gia công/OEM"],
                    [snapshot.odm === "yes", "Thiết kế & sản xuất ODM"],
                    [snapshot.samples === "yes", "Có thể gửi mẫu"],
                  ] as const).map(([on, label]) => <span key={label} className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${on ? "bg-brand-50 text-brand-900 ring-1 ring-brand-200" : "bg-ink-100 text-ink-500 line-through"}`}>{label}</span>)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-ink-200">
              <ReviewHead title="Đóng gói &amp; giao hàng" onEdit={() => scrollToSection("sec-shipping")} />
              <dl className="grid gap-x-4 gap-y-2 px-3.5 py-2.5 text-[12px] sm:grid-cols-2">
                <div><ReviewField label="Bao bì / đóng gói" value={snapshot.packaging} /></div>
                <div><ReviewField label="Loại kiện" value={snapshot.package_type} /></div>
                <div><ReviewField label="Khối lượng mỗi kiện (kg)" value={snapshot.package_weight_kg} /></div>
                <div><ReviewField label="Kích thước kiện" value={snapshot.package_size} /></div>
                <div><ReviewField label="Số đơn vị mỗi thùng" value={snapshot.units_per_carton} /></div>
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
            </div>

            <div className="rounded-lg border border-ink-200">
              <ReviewHead title={`Ảnh và catalogue (${media.length} tệp)`} onEdit={() => scrollToSection("sec-media")} />
              <div className="px-3.5 py-2.5">
                {media.length
                  ? <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {media.slice(0, 6).map((asset) => {
                      const url = privateMediaUrl(asset);
                      return <li key={asset.id} className="relative overflow-hidden rounded-md border border-ink-200 bg-ink-50">
                        <span className="block aspect-square">
                          {asset.kind === "image" && url
                            ? <img src={url} alt={asset.caption || "Ảnh sản phẩm"} className="size-full object-cover" />
                            : <span className="flex size-full items-center justify-center text-brand-700"><FileText className="size-5" aria-hidden="true" /></span>}
                        </span>
                      </li>;
                    })}
                  </ul>
                  : <p className="rounded-md bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900">Chưa có tệp. Bổ sung ảnh hoặc catalogue thật ở mục Ảnh và tệp.</p>}
                {media.length > 6 && <p className="mt-1 text-[10.5px] text-ink-500">và {media.length - 6} tệp khác - xem đủ ở mục Ảnh và tệp.</p>}
              </div>
            </div>
              </div>
            </details>

            {sent || review === "pending"
              ? <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-900">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">Đã gửi duyệt. Bạn sẽ nhận thông báo khi sản phẩm được đăng.</span>
                <Link href="/supplier/portal/products" className="underline">Về danh sách</Link>
              </div>
              : review === "approved"
                ? <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800"><Check className="size-4" aria-hidden="true" /> {live ? "Sản phẩm đã đăng. Bạn có thể tiếp tục quản lý." : "Sản phẩm đã duyệt và đang chờ đăng."}</p>
                : <div className="space-y-2">
                  <div id="submit-blockers" aria-live="polite">
                    {submitHint?.length
                      ? <ul role="alert" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                        {submitHint.map((hint) => <li key={hint} className="flex gap-1.5"><AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{hint}</li>)}
                      </ul>
                      : canSubmit
                        ? <p className="text-[11.5px] text-ink-600">Hồ sơ đủ điều kiện để gửi duyệt - bấm Gửi duyệt ở thanh dưới cùng.</p>
                        : null}
                  </div>
                </div>}
            {quantityEditor?.pendingNameId
              ? <p className="text-[11px] leading-4 text-ink-500">Tên tiếng Anh đang chờ duyệt riêng.</p>
              : quantityEditor?.hasApprovedName
                ? <p className="text-[11px] leading-4 text-ink-500">Đã có tên tiếng Anh được duyệt riêng.</p>
                : null}
          </div>
        </section>

        {/* Thanh dính đáy: lưu nháp và gửi duyệt, luôn trong tầm tay. */}
        {/* Thanh đính đáy: huỷ + trạng thái bên trái, ba nút hành động bên phải. */}
        <div className="sticky bottom-0 z-20 mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white/95 px-3 py-2 shadow-[0_-2px_12px_rgba(15,23,42,0.08)] backdrop-blur">
          <Link href="/supplier/portal/products" className="text-[13px] font-semibold text-ink-600 hover:text-ink-900">Hủy</Link>
          <span className="hidden min-w-0 items-center gap-1.5 truncate text-[12px] text-ink-500 sm:flex">
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dirty ? "bg-amber-500" : review === "changes_requested" ? "bg-rose-500" : "bg-emerald-500"}`} />
            <span className="truncate">
              {dirty ? "Có thay đổi chưa lưu" : product ? `${media.length} tệp · thông tin đã lưu` : "Chưa lưu sản phẩm"}
            </span>
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Mở bản xem trước đúng những gì người mua thấy; không rời trang nên giữ nguyên phần đang nhập. */}
            <button type="button" onClick={() => setPreviewOpen(true)} aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-800 hover:bg-ink-50">
              <Eye className="size-3.5" aria-hidden="true" /> Xem trước
            </button>
            {!locked && dirty &&
              <button type="submit" form="product-info" disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-800 hover:bg-ink-50 disabled:opacity-50">
                <Save className="size-3.5" aria-hidden="true" /> {review === "approved" ? "Lưu thay đổi" : "Lưu nháp"}
              </button>}
            {review === "pending" || review === "approved" || sent
              ? <span className="text-[12px] font-semibold text-emerald-800">{review === "approved" ? (live ? "Đã đăng" : "Đã duyệt, chờ đăng") : "Đã gửi duyệt"}</span>
              : <button type="button" onClick={requestSubmit} disabled={busy} aria-describedby="submit-blockers"
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-brand-800 disabled:opacity-70">
                {busy
                  ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> Đang gửi...</>
                  : <><Send className="size-3.5" aria-hidden="true" /> Gửi duyệt</>}
              </button>}
          </div>
        </div>
      </div>

      {/* Cột phải: thẻ xem nhanh - đọc được ngay cả khi cuộn giữa trang. */}
      <aside className="space-y-3 lg:sticky lg:top-4">
        {/* Thẻ điểm chất lượng đứng trước để thấy ngay việc cần bổ sung. */}
        {product && <section aria-label="Độ hoàn thiện hồ sơ" className="rounded-lg border border-ink-200 bg-white p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Điểm chất lượng</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative size-[52px] shrink-0">
              <svg viewBox="0 0 36 36" className="size-full" aria-hidden="true">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3.4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#0f766e" strokeWidth="3.4" strokeLinecap="round"
                  strokeDasharray="97.4" strokeDashoffset={97.4 - (Math.max(0, Math.min(100, completeness.score)) / 100) * 97.4}
                  transform="rotate(-90 18 18)" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-black tabular-nums text-brand-800">{completeness.score}</span>
            </div>
            <p className="min-w-0 text-[13px] font-bold text-ink-900">{completeness.score >= 85 ? "Cao" : completeness.score >= 60 ? "Trung bình" : "Thấp"}</p>
          </div>
          {completeness.next ? <>
            <p className="mt-2.5 text-[10.5px] font-bold tracking-wider text-ink-500 uppercase">Việc cần làm tiếp</p>
            <ul className="mt-1 space-y-1 text-[11.5px] leading-4 text-ink-600">
              {completeness.missing.slice(0, 3).map((item) => <li key={item.key} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="min-w-0 flex-1"><strong className="font-semibold text-ink-800">{item.label}</strong> · {item.hint}</span>
                <span className="shrink-0 rounded bg-brand-50 px-1 py-0.5 font-mono text-[9.5px] font-bold text-brand-800">+{item.weight}</span>
              </li>)}
            </ul>
            {completeness.missing.length > 3 && <p className="mt-1.5 text-[11px] text-ink-500">Còn {completeness.missing.length - 3} mục nữa.</p>}
            <button type="button" onClick={() => scrollToSection(completeness.next!.step === 2 ? "sec-media" : "sec-basic")} className="btn btn-soft btn-sm mt-2">
              Bổ sung: {completeness.next.label}
            </button>
          </> : <p className="mt-2 text-[11.5px] leading-4 text-emerald-700">Hồ sơ đã đủ các mục cần thiết.</p>}
          <p className="mt-2 text-[10.5px] leading-4 text-ink-500">{dirty ? "Lưu thay đổi để cập nhật số liệu." : "Số liệu tính từ bản đã lưu."}</p>
        </section>}

        <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
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

        {product && (canDeleteDraft || review === "approved") && <section aria-label="Quản lý sản phẩm" className="rounded-lg border border-ink-200 bg-white p-3">
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

        <details className="rounded-lg border border-ink-200 bg-white">
          <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-bold text-ink-800">Ví dụ điền mẫu</summary>
          <ul className="space-y-1 px-3 pb-3 text-[11.5px] leading-4 text-ink-600">
            <li><strong className="font-semibold text-ink-800">Tên:</strong> Hạt điều nhân trắng (không ghi grade).</li>
            <li><strong className="font-semibold text-ink-800">MOQ:</strong> 1.000 kg dễ nhận hỏi giá hơn 5 tấn.</li>
            <li><strong className="font-semibold text-ink-800">Đóng gói:</strong> bao 25 kg, 20 đơn vị mỗi thùng.</li>
            <li><strong className="font-semibold text-ink-800">Từ khoá:</strong> cashew w320, vietnam cashew.</li>
          </ul>
          <p className="px-3 pb-3 text-[10.5px] leading-4 text-ink-500">Ví dụ minh hoạ, không phải số liệu của bạn.</p>
        </details>

        <div className="rounded-lg border border-ink-200 bg-ink-50/70 p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Luồng duyệt</p>
          <ol className="mt-2 space-y-2 text-[11.5px] leading-4 text-ink-600">
            <li className="flex gap-2"><span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-white">1</span>Bạn lưu thông tin và tải tệp thật.</li>
            <li className="flex gap-2"><span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-ink-300 bg-white text-[10px] font-bold text-ink-500">2</span>Gửi duyệt nội dung.</li>
            <li className="flex gap-2"><span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-ink-300 bg-white text-[10px] font-bold text-ink-500">3</span>Nội dung được duyệt rồi sản phẩm mới đăng.</li>
          </ol>
        </div>

        <Link href="/supplier/portal/products" className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-800">
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

    {/* Bản xem trước: dùng chính component của trang người mua, dựng từ nội dung đang nhập. */}
    {previewOpen && <BuyerPreviewDialog open onClose={() => setPreviewOpen(false)} data={{
      title: buyerPreviewNameEn || (snapshot.name ?? "").trim(),
      hasEnglishTitle: !!buyerPreviewNameEn,
      categoryLabel: activeCategory?.label ?? "Chưa chọn danh mục",
      description: (snapshot.description ?? "").trim(),
      detail: snapshot.description_detail ?? "",
      images: imageSlots.filter((asset): asset is MediaAsset => !!asset)
        .map((asset) => privateMediaUrl(asset)).filter((url): url is string => !!url),
      offer: quantityPreview ? draftPublicQuantityOffer(quantityPreview, {
        priceUnit: quantityEditor?.buyerPriceUnit ?? newBuyerUnit,
        pricePubliclyVisible: buyerPreviewPriceVisible,
        standardGrades: quantityEditor?.standardGrades ?? newGrades,
        englishName: buyerPreviewNameEn,
      }) : null,
      pricePubliclyVisible: buyerPreviewPriceVisible,
      trade: { oem: snapshot.oem === "yes", odm: snapshot.odm === "yes", samples: snapshot.samples === "yes" },
      details: buyerPreviewDetails,
      shipping: buyerPreviewShipping,
      certificates: certificates.map((certificate) => ({
        id: certificate.id, name: certificate.name, validUntil: certificate.valid_until ?? null,
      })),
      supplierName: supplier.display_name || supplier.trade_name || supplier.name,
      supplierProvince: supplier.province ?? "",
      dirty,
    }} />}
  </div>;
}

/**
 * `step` chỉ truyền khi thẻ này CHÍNH LÀ nội dung của một bước (bước 2, bước 3).
 * Các thẻ con trong bước 1 để trống để không lặp lại chữ “Bước 1” ba lần trên cùng
 * một màn hình - bước đang mở đã hiện ở thanh bước phía trên.
 */
function SectionHead({ index, title, hint, pill }: { index?: string; title: string; hint?: string;
  pill?: { text: string; tone: "ok" | "muted" | "error" } }) {
  const tone = pill?.tone === "ok"
    ? "bg-emerald-50 text-emerald-800"
    : pill?.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-ink-100 text-ink-600";
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink-100 px-4 py-3 sm:px-5">
    <h2 className="text-[15.5px] leading-6 font-black text-ink-900">
      {index && <span className="mr-1 tabular-nums">{index}.</span>}{title}
    </h2>
    {pill && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{pill.text}</span>}
    {hint && <p className="ml-auto max-w-[330px] text-right text-[12px] leading-4 text-ink-500">{hint}</p>}
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

/**
 * Một dòng nhập: nhãn nằm trên, ô nhập chiếm hết bề rộng thẻ.
 * Nhãn không được dựng thành cột riêng — cột nhãn đẩy ô nhập sang phải và bóp hẹp ô.
 */
function Row({ label, hint, required, children, error }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode; error?: boolean;
}) {
  return <div className="border-t border-ink-100 px-4 py-3 first:border-t-0 sm:px-5">
    <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
      {required && <span className="mr-1 text-rose-600" aria-hidden="true">*</span>}{label}
    </span>
    <div className="min-w-0">
      {children}
      {hint && <p className={`mt-1.5 text-[11.5px] leading-4 ${error ? "text-rose-700" : "text-ink-500"}`}>{hint}</p>}
    </div>
  </div>;
}

/** Nhãn nhỏ phía trên ô trong cùng một dòng (dùng cho nhóm nhiều ô). */
function SubField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0">
    <span className="mb-1 block text-[12px] font-semibold text-ink-700">{label}</span>
    {children}
  </label>;
}

function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={className ? `block text-[12.5px] ${className}` : "block text-[12.5px]"}>
    <span className="mb-1 block font-semibold text-ink-800">{label}{required && " *"}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] leading-4 text-ink-500">{hint}</span>}
  </label>;
}

function ClockIcon() { return <span className="size-2.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />; }
