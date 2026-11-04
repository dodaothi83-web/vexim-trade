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
  X,
} from "lucide-react";
import type { MediaAsset, SupplierProduct, Supplier } from "@/lib/types";
import { productPriceBlockers, productPriceBlockersEn, supplierPriceConsentCurrent } from "@/lib/public/product-selection";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { PRODUCT_STATUS, privateMediaUrl, productReview } from "@/lib/supplier-portal/product-view";
import { addSupplierGradeOptionAction, deleteSupplierDraftProductAction, pauseSupplierProductAction, saveSupplierProductAction, submitSupplierProductAction } from "../product-actions";
import { useToast } from "@/components/toast";
import { SupplierAttributeInputs } from "@/components/supplier-attribute-inputs";
import { RawMaterialRegionInput } from "@/components/raw-material-region-input";
import { ProductDescriptionEditor } from "@/components/products/product-description-editor";
import { ProductDescriptionPreview } from "@/components/products/product-description-preview";
import { QuantityPricingInline } from "@/components/products/quantity-pricing-inline";
import { QuantityBuyerPreview, QuantityPricingEditor } from "@/components/products/quantity-pricing-editor";
import { BuyerPreviewDialog } from "@/components/products/buyer-preview-dialog";
import { draftPublicQuantityOffer, validateQuantityPricing, type QuantityPricingInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import { displayUnitsForCategory } from "@/lib/public/price-units";
import type { QuantityEditorData } from "@/lib/products/quantity-editor-data";
import { productCompleteness } from "@/lib/products/completeness";
import { fill } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { ProductEditorMessages } from "@/lib/i18n/portal/product-editor";
import type { ProductsMessages } from "@/lib/i18n/portal/products";
import {
  LEAD_TIME_UNIT_OPTIONS,
  categoryMarketPriceUnit,
  formatGradeRowPriceVi,
  formatLeadTimeEn,
  formatLeadTimeVi,
  formatProductMoqEn,
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
  /** Chuỗi của biểu mẫu theo ngôn ngữ đang chọn. */
  messages: ProductEditorMessages["editor"];
  /** Nhãn của các khối dùng chung với CRM (thông số, mô tả, bảng giá, bản xem trước). */
  shared: ProductEditorMessages["shared"];
  /** Nhãn trạng thái duyệt, dùng chung với danh sách sản phẩm. */
  statuses: ProductsMessages["statuses"];
  lang: Locale;
};

type EditorCopy = ProductEditorMessages["editor"];

type Step = 1 | 2 | 3;

/**
 * Tám khối của một trang duy nhất, xếp theo mạch người bán điền hồ sơ: chọn ngành hàng,
 * đặt tên, đưa ảnh lên, khai quy cách, giá, đóng gói, viết mô tả, rồi xem lại và gửi.
 * `id` cũng là đích neo cho mục lục trái và các nút "Sửa" ở khối xem lại.
 */
const formSections = (copy: EditorCopy) => [
  { id: "sec-category", ...copy.sections.category },
  { id: "sec-basic", ...copy.sections.basic },
  { id: "sec-media", ...copy.sections.media },
  { id: "sec-spec", ...copy.sections.spec },
  { id: "sec-price", ...copy.sections.price },
  { id: "sec-shipping", ...copy.sections.shipping },
  { id: "sec-detail", ...copy.sections.detail },
  { id: "sec-review", ...copy.sections.review },
] as const;

// Chứng nhận không khai ở đây: hồ sơ Giấy tờ L1 là nguồn duy nhất (AI quét đơn vị đứng tên
// và ngày hết hạn), nên sản phẩm không có ô tự khai để tránh tạo cảm giác được xác minh.

/** Nhóm trường hiển thị ở mục xem lại để NCC đọc lại đúng những gì đã nhập. */
const reviewCommercial = (copy: EditorCopy) => [
  ["lead_time_days", copy.reviewLabels.leadTime],
  ["payment_terms", copy.reviewLabels.paymentTerms],
  ["export_port", copy.reviewLabels.exportPort],
  ["incoterm_place", copy.reviewLabels.incotermPlace],
] as const;

const reviewOrder = (copy: EditorCopy) => [
  ["monthly_capacity", copy.reviewLabels.capacity],
  ["packaging", copy.reviewLabels.packaging],
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
  for (const key of ["lead_time_days", "payment_terms", "export_port", "incoterm_place", "monthly_capacity", "packaging"]) {
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
  // Operator log stays in English; the toast uses the same action name the user clicked.
  console.error(`[supplier-product] ${what} failed:`, error);
  const detail = error instanceof Error && error.message ? error.message.trim() : "";
  if (detail && !/failed to fetch|fetch failed|networkerror/i.test(detail))
    return { ok: false, message: `${what}: ${detail}` };
  return { ok: false, message: `${what}: lost connection or the page is out of date. Reload the page (F5) and try again.` };
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
export function SupplierProductEditor({ product, quantityEditor, quantityPolicies, media = [], bankMedia = [], userId, categories, categoryScope = [], supplier, certificates = [], certificateInheritance = {}, initialStep = 1, messages: copy, shared, statuses, lang }: EditorProps) {
  const router = useRouter();
  const globalToast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const creationRequestId = useRef<string | null>(null);
  // Chọn sẵn cam kết giá: người bán chỉ bỏ tick khi giá chưa phải giá sẵn sàng báo.
  const [quantityConsent, setQuantityConsent] = useState(true);

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
  /** Ảnh trong kho ảnh của chính tài khoản này; kho là chỗ ảnh dừng trước khi gắn sản phẩm. */
  const bankOwnCount = bankMedia.filter((asset) => !userId || asset.created_by === userId).length;
  // Đọc nội dung đang nhập chứ không phải bản đã lưu: gõ mô tả ngắn là mục 8 hết nhắc.
  const hasDetails = !!((snapshot.spec ?? "").trim() || (snapshot.description ?? "").trim());
  const hasMedia = media.some((m) => m.kind === "image" && !!m.storage_path && m.supplier_id === product?.supplier_id);
  // Ảnh đang chọn trong kho ảnh, giữ đúng thứ tự chọn: ảnh chọn đầu tiên là ảnh chính.
  const pickedImages = pickedBank
    .map((id) => bankMedia.find((asset) => asset.id === id && asset.kind === "image" && privateMediaUrl(asset)))
    .filter((asset): asset is MediaAsset => !!asset);
  /** Ảnh còn trong kho mà chưa chọn cho sản phẩm này — chỉ hiện phần chưa dùng nên không lặp ảnh đã chọn. */
  const unusedBank = bankMedia.filter((asset) => asset.kind === "image" && !!privateMediaUrl(asset) &&
    !pickedBank.includes(asset.id));
  /** Đã có ảnh dùng được chưa: sản phẩm đã lưu thì tính ảnh trên sản phẩm, sản phẩm mới tính ảnh đang chọn. */
  const hasAnyImage = product ? hasMedia : pickedImages.length > 0;
  /** Số ảnh đang hiện trong 6 ô, dùng cho nhãn mục và các dòng nhắc. */
  const shownImageCount = product ? imageCount : pickedImages.length;
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
  /** Đủ nội dung để gửi duyệt: nút gửi tự lưu trước nên không đòi bản đã lưu. */
  const submitReady = !!(snapshot.name ?? "").trim() && !!selectedCategory && hasDetails && hasAnyImage &&
    priceIssueCount === 0 && (!!product || !!quantityPreview);
  const catalogueAssets = media.filter((asset) => asset.kind !== "image");
  const basicFilled = [snapshot.name, snapshot.keywords, snapshot.description].filter((value) => (value ?? "").trim()).length;
  const specFilled = [snapshot.spec, snapshot.monthly_capacity, snapshot.raw_material_region, snapshot.input_material_origin]
    .filter((value) => (value ?? "").trim()).length;
  const shippingFilled = [snapshot.packaging, snapshot.package_type, snapshot.package_weight_kg, snapshot.package_size,
    snapshot.units_per_carton, snapshot.export_port, snapshot.lead_time_value, snapshot.incoterm_place, snapshot.payment_terms]
    .filter((value) => (value ?? "").trim()).length;
  const sectionPill = (id: string) => {
    switch (id) {
      case "sec-category": return selectedCategory ? { text: copy.pill.done, tone: "ok" as const } : { text: copy.pill.notChosen, tone: "muted" as const };
      case "sec-basic": return { text: fill(copy.pill.fields, { filled: basicFilled, total: 3 }), tone: "muted" as const };
      case "sec-media": return { text: fill(copy.pill.images, { shown: Math.min(shownImageCount, 6) }), tone: "muted" as const };
      case "sec-spec": return { text: fill(copy.pill.fields, { filled: specFilled, total: 4 }), tone: "muted" as const };
      case "sec-price": return priceIssueCount > 0 ? { text: fill(copy.pill.errors, { count: priceIssueCount }), tone: "error" as const } : { text: copy.pill.done, tone: "ok" as const };
      case "sec-shipping": return { text: fill(copy.pill.fields, { filled: shippingFilled, total: 9 }), tone: "muted" as const };
      case "sec-detail": return { text: (snapshot.description_detail ?? "").replace(/<[^>]*>/g, "").trim() ? copy.pill.hasContent : copy.pill.empty, tone: "muted" as const };
      default: return undefined;
    }
  };
  const sectionBlocked = (id: string) => {
    switch (id) {
      case "sec-category": return !selectedCategory;
      case "sec-basic": return !(snapshot.name ?? "").trim();
      case "sec-media": return !hasAnyImage;
      case "sec-price": return priceIssueCount > 0;
      default: return false;
    }
  };
  const newGrades = standardGradesForCategory(activeCategorySource);
  const newBuyerUnit = displayUnitsForCategory(activeCategorySlug, activeCategory?.price_unit).primary === "mt" ? "mt" : "kg";
  const newQuantity = !product && quantityPreview ? { ...quantityPreview, nameVi: snapshot.name ?? "" } : null;
  const unitMeta = categoryMarketPriceUnit(activeCategorySlug, activeCategory?.price_unit);
  const categoryLabel = activeCategory?.label ?? product?.category ?? copy.review.notChosen;
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
      if (!window.confirm(copy.errors.unsavedLeave)) event.preventDefault();
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
    if (!product) setQuantityPreview((previous) => previous ? { ...previous, grade: "" } : previous);
    setSnapshot((previous) => ({ ...previous, supplier_category_proposal: nextSlug }));
  }

  function onNewQuantityChange(value: QuantityPricingInput) {
    setQuantityPreview(value);
    setSnapshot((previous) => ({ ...previous, quantity_draft: JSON.stringify(value) }));
  }

  function validateCurrentGradeRows(): string | null {
    if (!product) {
      if (!newPolicy || !newQuantity) return copy.errors.priceConfig;
      const validation = validateQuantityPricing(newQuantity, newGrades, newPolicy);
      if (!validation.value) return validation.errors[0]?.message ?? copy.errors.priceCheck;
      if (snapshot.price_publicly_visible === "yes" && !quantityConsent) return copy.errors.priceConsent;
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
      setFormError(copy.errors.requiredFields);
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
      const consentMsg = copy.errors.pricePublicConsent;
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
      } else {
        if (newQuantity) {
          creationRequestId.current ??= crypto.randomUUID();
          form.set("quantity_creation_request_id", creationRequestId.current);
          form.set("quantity_grade", newQuantity.grade);
          form.set("quantity_incoterm", newQuantity.incoterm);
          form.set("quantity_currency", newQuantity.currency ?? "USD");
          form.set("quantity_tiers_json", JSON.stringify(newQuantity.tiers));
          // Cam kết giá chỉ có nghĩa khi giá được công khai, nên đừng gửi kèm khi đang tắt.
          if (quantityConsent && snapshot.price_publicly_visible === "yes") form.set("confirm_quantity_price_consent", "yes");
        }
        // Ảnh đang chọn trong kho ảnh luôn đi kèm, kể cả khi bảng giá chưa đủ để tạo sản phẩm.
        if (pickedBank.length) form.set("bank_media_ids", JSON.stringify(pickedBank.slice(0, 6)));
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
      setToast(reportActionError(error, copy.errors.saveProduct));
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
    if (!hasDetails) blockers.push(copy.blockers.details);
    if (!hasAnyImage) blockers.push(copy.blockers.image);
    if (priceIssueCount > 0 && !quantityPreview?.grade.trim()) blockers.push(copy.blockers.grade);
    if (priceIssueCount > 0 && quantityPreview && quantityPreview.tiers.every((tier) => !tier.priceUsdPerKg.trim()))
      blockers.push(copy.blockers.price);
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
      if (!hasAnyImage) { scrollToSection("sec-media"); return; }
      if (!hasDetails) { scrollToSection("sec-basic"); return; }
      if (priceIssueCount > 0) { scrollToSection("sec-price"); return; }
      if (!selectedCategory) { scrollToSection("sec-category"); return; }
      return;
    }
    void submit();
  }

  /**
   * Gửi duyệt tự lưu trước: đang nhập dở vẫn bấm Gửi duyệt được, không phải nhớ bấm Lưu
   * rồi mới gửi. Lưu không qua được kiểm tra thì `persist` đã chỉ đúng ô cần sửa.
   */
  async function submit() {
    if (busy) return;
    setSubmitHint(null);
    setToast(null);
    setFormError(null);
    const creating = !product;
    try {
      const id = product && !dirty ? product.id : await persist();
      if (!id) return;
      setBusy(true);
      const form = new FormData();
      form.set("product_id", id);
      const response = await submitSupplierProductAction(form);
      setToast(response);
      if (!response.ok) return;
      if (creating) { router.push(detailUrl(id)); return; }
      setSent(true);
      router.refresh();
    } catch (error) {
      setToast(reportActionError(error, copy.errors.submitProduct));
    } finally {
      setBusy(false);
    }
  }

  function uploadKind(file: File): "image" | "catalogue" | null {
    if (/\.pdf$/i.test(file.name)) return "catalogue";
    if (/\.(jpg|jpeg|png|webp)$/i.test(file.name)) return "image";
    return null;
  }
  /**
   * Chọn tệp là tải lên ngay, không có bước xác nhận thứ hai.
   *
   * Sản phẩm đã lưu: ảnh vào thẳng 6 ô, catalogue vào mục catalogue.
   * Sản phẩm mới: ảnh vào kho ảnh rồi tự gắn vào 6 ô; ảnh thứ 7 trở đi nằm lại kho
   * để dành cho sản phẩm khác, vì người mua chỉ thấy 6 ảnh.
   */
  function chooseFiles(files: File[]) {
    if (!files.length || !canUpload) return;
    if (!product) {
      // Chưa có sản phẩm: tệp đi vào kho ảnh, nên chỉ nhận ảnh và đếm theo kho.
      if (files.some((file) => uploadKind(file) !== "image")) {
        setToast({ ok: false, message: copy.errors.bankImagesOnly });
        return;
      }
      if (bankOwnCount + files.length > 12) {
        setToast({ ok: false, message: fill(copy.errors.bankLimit, { count: bankOwnCount }) });
        return;
      }
      const tooBig = files.find((file) => file.size > 8 * 1024 * 1024);
      if (tooBig) {
        setToast({ ok: false, message: fill(copy.errors.imageTooBig, { name: tooBig.name }) });
        return;
      }
      void uploadFiles(files);
      return;
    }
    // Sản phẩm đã lưu: 6 ô ảnh cũng là hạn mức ảnh người mua thấy.
    const incomingImages = files.filter((file) => uploadKind(file) === "image").length;
    if (imageCount + incomingImages > 6) {
      setToast({ ok: false, message: fill(copy.errors.imageMax, { count: imageCount }) });
      return;
    }
    if (ownedCount + files.length > 12) {
      setToast({ ok: false, message: fill(copy.errors.fileMax, { count: ownedCount }) });
      return;
    }
    const invalid = files.find((file) => !uploadKind(file) || file.size > (uploadKind(file) === "catalogue" ? 15 : 8) * 1024 * 1024);
    if (invalid) {
      setToast({ ok: false, message: fill(copy.errors.fileInvalid, { name: invalid.name }) });
      return;
    }
    void uploadFiles(files);
  }
  /** Tải danh sách tệp vừa chọn lên ngay khi người dùng chọn xong. */
  async function uploadFiles(list: File[]) {
    if (!canUpload || !list.length) return;
    setBusy(true);
    let uploaded = 0;
    try {
      // Chưa có sản phẩm: ảnh vào kho ảnh riêng, gắn vào sản phẩm ngay khi bấm Lưu.
      if (!product) {
        const added: string[] = [];
        for (let index = 0; index < list.length; index++) {
          const file = list[index];
          if (uploadKind(file) !== "image") throw Error(copy.errors.bankImagesOnly);
          setProgress(fill(copy.errors.progress, { index: index + 1, total: list.length, name: file.name }));
          const body = new FormData();
          body.set("file", file);
          const response = await fetch("/api/supplier-portal/media", { method: "POST", body });
          // Trang lỗi (404/413/500...) trả HTML: đọc .json() sẽ ném — bắt lại để giữ mã HTTP thật.
          const data = await response.json().catch(() => null) as
            { ok?: boolean; message?: string; image?: { id?: string } } | null;
          if (!response.ok || !data?.ok) throw Error(data?.message || fill(copy.errors.uploadImageFailed, { status: response.status }));
          if (data.image?.id) added.push(data.image.id);
          uploaded++;
        }
        // Ảnh vừa tải được chọn sẵn cho sản phẩm đang tạo để bấm Lưu là xong.
        const room = Math.max(0, 6 - pickedBank.length);
        const chosen = added.slice(0, room);
        const leftover = added.length - chosen.length;
        if (chosen.length) setPickedBank((current) => Array.from(new Set([...current, ...chosen])).slice(0, 6));
        setToast({ ok: true, message: leftover
          ? fill(copy.toasts.uploadImages.bank, { uploaded, chosen: chosen.length, leftover })
          : fill(copy.toasts.uploadImages.product, { uploaded }) });
        router.refresh();
        return;
      }
      const productId = product.id;
      for (let index = 0; index < list.length; index++) {
        const file = list[index];
        const kind = uploadKind(file);
        if (!kind) throw Error(copy.errors.wrongFileType);
        setProgress(fill(copy.errors.progress, { index: index + 1, total: list.length, name: file.name }));
        const body = new FormData();
        body.set("kind", kind);
        body.set("file", file);
        const response = await fetch(`/api/supplier-portal/products/${productId}/media`, { method: "POST", body });
        const data = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
        if (!response.ok || !data?.ok) throw Error(data?.message || fill(copy.errors.uploadFileFailed, { status: response.status }));
        uploaded++;
      }
      setToast({ ok: true, message: live
        ? fill(copy.toasts.uploadFiles.live, { count: uploaded })
        : fill(copy.toasts.uploadFiles.draft, { count: uploaded }) });
      router.refresh();
    } catch (error) {
      const failure = reportActionError(error, copy.errors.uploadFiles);
      setToast({ ok: false, message: `${uploaded ? fill(copy.errors.uploadPartial, { done: uploaded }) : ""}${failure.message}` });
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  /** Bật/tắt một ảnh trong kho ảnh cho lần lưu này; chọn tối đa 6 ảnh vì có 6 ô ảnh. */
  function toggleBank(mediaId: string) {
    setPickedBank((current) => current.includes(mediaId)
      ? current.filter((id) => id !== mediaId)
      : current.length >= 6 ? current : [...current, mediaId]);
  }

  /** Xóa ảnh khỏi kho khi nó chưa gắn vào sản phẩm nào. */
  async function removeBank(mediaId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/supplier-portal/media?media_id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) throw Error(data?.message || fill(copy.errors.deleteImageFailed, { status: response.status }));
      setPickedBank((current) => current.filter((id) => id !== mediaId));
      setToast({ ok: true, message: copy.errors.deleteImageNote });
      router.refresh();
    } catch (failure) {
      setToast(reportActionError(failure, copy.errors.deleteImage));
    } finally {
      setBusy(false);
    }
  }
  /** Bỏ một ảnh khỏi sản phẩm: ảnh đã lưu thì xóa khỏi sản phẩm, ảnh vừa chọn trong kho thì bỏ chọn. */
  function dropImage(asset: MediaAsset) {
    if (product) void removeMedia(asset.id);
    else toggleBank(asset.id);
  }
  /**
   * Đặt ảnh chính. Sản phẩm đã lưu thì gọi API đổi ảnh đại diện; sản phẩm mới thì
   * đưa ảnh lên đầu danh sách đang chọn, nên đổi được ngay trước khi bấm Lưu.
   */
  async function makeCover(mediaId: string) {
    if (busy || mediaId === cover?.id) return;
    if (!product) {
      setPickedBank((current) => current[0] === mediaId
        ? current
        : [mediaId, ...current.filter((id) => id !== mediaId)]);
      setToast({ ok: true, message: copy.toasts.coverSet });
      return;
    }
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
        setToast({ ok: false, message: data?.message || fill(copy.errors.coverFailed, { status: response.status }) });
        return;
      }
      setToast({ ok: true, message: data.message || copy.errors.coverUpdated });
      router.refresh();
    } catch (error) {
      setToast(reportActionError(error, copy.errors.coverChanging));
    } finally {
      setBusy(false);
    }
  }
  async function removeMedia(mediaId: string) {
    if (!product || busy || !canUpload || !window.confirm(live ? copy.toasts.deleteFileLive : copy.toasts.deleteFile)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/supplier-portal/products/${product.id}/media?media_id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { ok?: boolean; message?: string; warning?: boolean } | null;
      if (!response.ok || !data?.ok) {
        setToast({ ok: false, message: data?.message || fill(copy.errors.deleteFileFailed, { status: response.status }) });
        return;
      }
      setToast({ ok: true, warning: data.warning, message: data.message || copy.toasts.fileDeleted });
      router.refresh();
    } catch (error) {
      setToast(reportActionError(error, copy.toasts.deleteFile));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!product || busy || dirty || !canDeleteDraft || !window.confirm(fill(copy.toasts.deleteDraft, { name: product.name }))) return;
    setBusy(true);
    try {
      const response = await deleteSupplierDraftProductAction(product.id);
      if (!response.ok) { setToast(response); return; }
      globalToast.push({ kind: response.warning ? "info" : "success", title: response.message,
        ...(response.warning ? { lines: [copy.toasts.leftoverFiles, copy.toasts.contactSupport] } : {}) });
      router.push("/supplier/portal/products");
      router.refresh();
    } catch (error) {
      setToast(reportActionError(error, copy.toasts.draftDeleted));
    } finally { setBusy(false); }
  }

  async function pauseProduct() {
    if (!product || busy || dirty || review !== "approved" || !window.confirm(fill(copy.toasts.archive, { name: product.name }))) return;
    setBusy(true);
    try {
      const response = await pauseSupplierProductAction(product.id);
      setToast(response);
      if (response.ok) router.refresh();
    } catch (error) {
      setToast(reportActionError(error, copy.toasts.archiveBusy));
    } finally { setBusy(false); }
  }

  const status = PRODUCT_STATUS[review];
  const statusLabel = review === "approved" && !live ? copy.toasts.verifiedPendingPublish : statuses[review];
  /** Ảnh chính của sản phẩm đã lưu: ảnh được gắn làm ảnh đại diện, không có thì ảnh đầu tiên. */
  const savedCover = media.find((m) => m.id === product?.featured_media_id && m.kind === "image" && privateMediaUrl(m)) ??
    media.find((m) => m.kind === "image" && privateMediaUrl(m));
  // Sản phẩm mới chưa lưu: ảnh chính là ảnh chọn đầu tiên trong kho ảnh, nên chọn ảnh là thấy ngay.
  const cover = product ? savedCover : pickedImages[0] ?? null;
  const coverUrl = cover ? privateMediaUrl(cover) : null;
  /** Sáu ô ảnh như sàn TMĐT: ô đầu là ảnh chính, phần còn lại là ảnh chi tiết. */
  const imageSlots: MediaAsset[] = product
    ? [savedCover, ...media.filter((m) => m.kind === "image" && privateMediaUrl(m) && m.id !== savedCover?.id)]
      .filter((m): m is MediaAsset => !!m).slice(0, 6)
    : pickedImages.slice(0, 6);
  /**
   * Ảnh cũ vượt quá 6 ô: người mua chỉ thấy 6 ảnh đầu nên phần này phải hiện ra kèm nút xóa,
   * nếu không nhà cung cấp không biết ảnh thứ 7, thứ 8 đang nằm đâu.
   */
  const slotIds = new Set(imageSlots.map((asset) => asset.id));
  const overflowImages = product
    ? media.filter((m) => m.kind === "image" && !!privateMediaUrl(m) && !slotIds.has(m.id))
    : [];
  const savedPriceValue = product?.ref_price != null
    ? formatGradeRowPriceVi(
        product.ref_price,
        product.ref_price_max != null && product.ref_price_max >= product.ref_price ? product.ref_price_max : product.ref_price,
        unitMeta.unitLabel,
        copy.review.quoteOnRequest,
      )
    : product
      ? copy.review.quoteOnRequest
      : "-";
  /**
   * Độ hoàn thiện chỉ đọc, nhưng đọc **nội dung đang nhập**: gõ giá hay MOQ là điểm đổi ngay,
   * không phải lưu rồi mở lại. Ô nào đang có chữ thì lấy chữ đó, còn lại lấy bản đã lưu.
   * Không phải cổng chặn đăng.
   */
  const liveNumber = (value: string | undefined): number | null => {
    const raw = (value ?? "").trim().replace(",", ".");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const liveTiers = quantityPreview?.tiers ?? [];
  const livePrice = liveTiers.map((tier) => liveNumber(tier.priceUsdPerKg)).find((n) => n != null && n > 0) ?? null;
  const liveMoqQty = liveTiers.map((tier) => liveNumber(tier.minKg)).find((n) => n != null && n > 0) ?? null;
  const liveKeywords = (snapshot.keywords ?? "").split(",").map((word) => word.trim()).filter(Boolean);
  /** Ảnh vừa chọn từ kho đã nằm trong lưới 6 ô và sẽ chia sẻ cho người mua khi lưu. */
  const liveMedia = [...media, ...pickedImages.map((asset) => ({ ...asset, audience: "buyer" as const }))];
  const completeness = productCompleteness({
    name: snapshot.name ?? null,
    display_name: product?.display_name ?? null,
    name_i18n: product?.name_i18n ?? null,
    category: selectedCategory || product?.category || null,
    reviewed_category_slug: product?.reviewed_category_slug ?? null,
    spec: snapshot.spec ?? null,
    description: snapshot.description ?? null,
    description_i18n: product?.description_i18n ?? null,
    ref_price: product?.ref_price ?? livePrice,
    moq: product?.moq ?? null,
    moq_qty: product?.moq_qty ?? liveMoqQty,
    packaging: snapshot.packaging ?? null,
    lead_time_days: liveNumber(snapshot.lead_time_days) ?? product?.lead_time_days ?? null,
    payment_terms: snapshot.payment_terms ?? null,
    monthly_capacity: snapshot.monthly_capacity ?? null,
    export_port: snapshot.export_port ?? null,
    keywords: liveKeywords.length ? liveKeywords : product?.keywords ?? null,
    sample_price_usd: liveNumber(snapshot.sample_price_usd) ?? product?.sample_price_usd ?? null,
    package_type: snapshot.package_type ?? null,
    package_weight_kg: liveNumber(snapshot.package_weight_kg) ?? product?.package_weight_kg ?? null,
  }, liveMedia, { supplierView: true });
  /** Lý do người mua chưa thấy giá; cổng nhà cung cấp đọc bản tiếng Anh. */
  const priceBlockers = product
    ? (lang === "en" ? productPriceBlockersEn(product, supplier) : productPriceBlockers(product, supplier))
    : [];
  const commercial = [
    { label: copy.reviewLabels.price, value: savedPriceValue },
    { label: copy.reviewLabels.moq, value: product ? (lang === "en" ? formatProductMoqEn(product) : formatProductMoqVi(product)) || "-" : "-" },
    { label: copy.reviewLabels.capacityShort, value: product?.monthly_capacity || "-" },
    { label: copy.reviewLabels.leadTimeShort, value: product ? (lang === "en" ? formatLeadTimeEn(product) : formatLeadTimeVi(product)) : "-" },
    { label: copy.reviewLabels.port, value: product?.export_port || "-" },
    { label: copy.reviewLabels.incoterm, value: [product?.incoterm, product?.incoterm_place].filter(Boolean).join(" / ") || "-" },
    { label: copy.reviewLabels.payment, value: product?.payment_terms || "-" },
  ];

  /**
   * Mục còn thiếu nằm ở khối nào trên trang một-bước: bấm "Bổ sung" phải tới đúng ô,
   * không phải khối chung. Giá và MOQ nằm trong khối giá (bảng giá số lượng), không phải ô chữ.
   */
  const SECTION_FOR_ITEM: Record<string, string> = {
    category: "sec-category",
    photo: "sec-media",
    price: "sec-price",
    moq: "sec-price",
    sample_price: "sec-price",
    spec: "sec-spec",
    capacity: "sec-spec",
    keywords: "sec-basic",
    description: "sec-basic",
    packaging: "sec-shipping",
    package_measure: "sec-shipping",
    lead_time: "sec-shipping",
    export_port: "sec-shipping",
    payment_terms: "sec-shipping",
  };

  /** Mục đích của từng khối: dùng cho mục lục bên trái và nút "Sửa" ở phần xem lại. */
  function sectionDone(id: string): boolean {
    switch (id) {
      case "sec-category": return !!selectedCategory;
      case "sec-basic": return !!(snapshot.name ?? "").trim();
      case "sec-media": return hasAnyImage;
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
      <nav aria-label={copy.toc.aria} className="hidden lg:sticky lg:top-4 lg:block">
        <div className="rounded-lg border border-ink-200 bg-white p-2">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.14em] text-ink-500 uppercase">{copy.toc.title}</p>
          <ol className="space-y-0.5">
            {formSections(copy).map((item, index) => {
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
        <p className="mt-2 px-2 text-[11px] leading-4 text-ink-500">{copy.toc.hint}</p>
      </nav>

      <div className="min-w-0 space-y-3 [&_.input]:rounded-md [&_.input]:py-1.5 [&_.input]:text-[12.5px] [&_.input]:leading-5">
        {(review === "pending" || review === "changes_requested" || review === "paused") && <section aria-label={copy.status.aria}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 ${review === "changes_requested" ? "border-rose-200 bg-rose-50" : review === "paused" ? "border-slate-300 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>{statusLabel}</span>
          <p className="min-w-0 flex-1 text-[12px] leading-5 text-ink-700">
            {review === "pending"
              ? product?.reviewed_category_slug
                ? copy.status.repricePending
                : copy.status.pending
              : review === "paused"
                ? copy.status.paused
                : copy.status.changesRequested}
          </p>
        </section>}

        {legacyManaged && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900">
          {copy.status.legacyManaged}
        </p>}

        {product?.supplier_review_note && <p className="whitespace-pre-wrap rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-rose-800">
          <AlertCircle className="mr-1 inline size-4" aria-hidden="true" /> {copy.status.reviewNote} {product.supplier_review_note}
        </p>}

        {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-[12.5px] font-semibold text-rose-900">{formError}</p>}

        <form id="product-info" ref={formRef} onSubmit={save} onChange={onFormChange} noValidate>
          {/* 01 — Ngành hàng */}
          <section id="sec-category" data-form-section="sec-category" aria-label={copy.category.aria}
            className="scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="1" title={copy.category.title} pill={sectionPill("sec-category")}
              hint={copy.category.hint} />
            <div>
              <Row label={copy.category.field} required error={!selectedCategory}
                hint={selectedCategory ? copy.category.hintChosen : copy.category.hintEmpty}>
                <div className="flex flex-wrap items-center gap-2">
                  <select name="supplier_category_proposal" className="input min-w-0 flex-1" required value={selectedCategory}
                    onChange={(e) => onCategorySelect(e.target.value)} disabled={locked || categoryLocked || !categories.length}>
                    <option value="" disabled>{copy.category.placeholder}</option>
                    {categories.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} / ` : ""}{c.label}</option>)}
                  </select>
                  {categoryLocked && <input type="hidden" name="supplier_category_proposal" value={selectedCategory} />}
                  <Link href="/supplier/portal/categories" className="btn btn-ghost btn-sm">{copy.category.suggest}</Link>
                </div>
                {categoryLocked && <p className="mt-1 text-[11.5px] text-ink-500">{copy.category.lockedNote}</p>}
                {selectedCategory && (certificateInheritance[selectedCategory] ?? []).length > 0 && <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
                  <p className="text-[11px] font-bold tracking-wider text-teal-900 uppercase">{copy.category.certTitle}</p>
                  <ul className="mt-1 space-y-0.5">
                    {(certificateInheritance[selectedCategory] ?? []).map((certificate) => (
                      <li key={certificate.id} className="flex items-start gap-1.5 text-[12px] text-ink-800">
                        <span aria-hidden="true" className="mt-0.5 text-emerald-700">✓</span>
                        <span>
                          {certificate.name}
                          {certificate.scheme ? ` · ${certificate.scheme}` : ""}
                          {certificate.validUntil ? fill(copy.category.certExpiry, { date: certificate.validUntil }) : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] leading-4 text-ink-600">
                    {copy.category.certNote} {copy.category.certLink}
                  </p>
                </div>}
                {!categoryLocked && selectedCategory && categoryScope.length > 0 && !categoryScope.includes(selectedCategory) &&
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-4 text-amber-900">
                    {copy.category.outOfScope}
                  </p>}
              </Row>
              {!categories.length && <div className="px-4 py-2 sm:px-5"><p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                {copy.category.noCategories}<Link href="/supplier/portal/categories" className="font-semibold underline">{copy.category.noCategoriesLink}</Link>
              </p></div>}
            </div>
          </section>

          {/* 02 — Tên & từ khoá */}
          <section id="sec-basic" data-form-section="sec-basic" aria-label={copy.basic.aria}
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="2" title={copy.basic.title} pill={sectionPill("sec-basic")}
              hint={copy.basic.hint} />
            <div>
              <Row label={copy.basic.name} required hint={copy.basic.nameHint}>
                <div className="flex items-start gap-2">
                  <input name="name" className="input" required maxLength={180} minLength={3} placeholder={copy.basic.namePlaceholder}
                    defaultValue={product?.name ?? ""} disabled={locked} />
                  <span className="shrink-0 pt-2 font-mono text-[11px] tabular-nums text-ink-400">
                    {(snapshot.name ?? "").length}/180
                  </span>
                </div>
              </Row>
              <Row label={copy.basic.keywords} hint={copy.basic.keywordsHint}>
                <input name="keywords" className="input" maxLength={120} placeholder="cashew, w320, vietnam"
                  defaultValue={(product?.keywords ?? []).join(", ")} disabled={locked} />
              </Row>
              <Row label={copy.basic.description} hint={copy.basic.descriptionHint}>
                <textarea name="description" className="input min-h-[76px] resize-y" rows={3} maxLength={1500}
                  placeholder={copy.basic.descriptionPlaceholder} defaultValue={product?.description ?? ""} disabled={locked} />
              </Row>
            </div>
          </section>

          {/* 03 — Ảnh & tệp */}
          <section id="sec-media" data-form-section="sec-media" aria-label={copy.media.aria}
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="3" title={copy.media.title} pill={sectionPill("sec-media")}
              hint={live ? copy.media.hintLive : review === "approved" ? copy.media.hintApproved : copy.media.hintDraft} />
            <div>
              {/* Ảnh đại diện đứng trước: người mua thấy ảnh này đầu tiên trong kết quả tìm kiếm. */}
              <Row label={copy.media.cover} hint={copy.media.coverHint}>
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
                      ? <img src={coverUrl} alt={copy.media.coverAlt} className="size-full object-cover" />
                      : <span className="flex size-full items-center justify-center text-ink-400"><ImageIcon className="size-6" aria-hidden="true" /></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-5 text-ink-600">{coverUrl
                      ? copy.media.coverCurrent
                      : product ? copy.media.coverAuto : copy.media.coverFirstPicked}</p>
                    {cover && (product ? canDeleteAsset(cover) : true) && <button type="button" disabled={busy} onClick={() => dropImage(cover)}
                      aria-label={product ? copy.media.coverDelete : copy.media.coverUnpick}
                      title={product ? copy.media.coverDelete : copy.media.coverUnpickThis}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                      <Trash2 className="size-3" aria-hidden="true" /> {product ? copy.media.deletePhoto : copy.media.removePhoto}
                    </button>}
                  </div>
                </div>
              </Row>

              {/* Sáu ô ảnh sản phẩm: ô đầu là ảnh chính. */}
              <Row label={copy.media.photos} required error={!!product && !hasMedia}>
                <ul aria-label={copy.media.photosAria} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
                            <span className="text-[10px] font-semibold">{index === 0 ? copy.media.mainPhoto : fill(copy.media.photoNumber, { index: index + 1 })}</span>
                          </span>}
                        {asset && (isCover || canUpload || (product ? canDeleteAsset(asset) : true)) && <div className="absolute inset-x-1 top-1 flex items-start justify-between gap-1">
                          <span>{isCover && <span role="img" aria-label={copy.media.coverBadge} title={copy.media.coverBadge}
                            className="flex size-[18px] items-center justify-center rounded-full bg-brand-700 text-white shadow-sm">
                            <Star className="size-[11px] fill-current" aria-hidden="true" />
                          </span>}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {(product ? canUpload : true) && !isCover && <button type="button" disabled={busy} onClick={() => void makeCover(asset.id)}
                              aria-label={fill(copy.media.setCoverFor, {
                                which: index === 0 ? copy.media.thisPhoto : fill(copy.media.photoWhich, { index: index + 1 }),
                              })} title={copy.media.setCoverTitle}
                              className="rounded-full bg-white/95 p-1 text-brand-700 shadow-sm hover:bg-brand-50 disabled:opacity-50">
                              <Star className="size-3" aria-hidden="true" />
                            </button>}
                            {(product ? canDeleteAsset(asset) : true) && <button type="button" disabled={busy} onClick={() => dropImage(asset)}
                              aria-label={fill(product ? copy.media.deletePhotoNumber : copy.media.unpickPhotoNumber, { index: index + 1 })}
                              title={product ? copy.media.deleteTitle : copy.media.unpickTitle}
                              className="rounded-full bg-white/95 p-1 text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50">
                              <X className="size-3" aria-hidden="true" />
                            </button>}
                          </span>
                        </div>}
                      </div>
                    </li>;
                  })}
                </ul>
                {shownImageCount >= 6 && <p className="mt-1.5 text-[11.5px] text-ink-500">{copy.media.slotsFull}</p>}
                {!product && pickedImages.length > 0 && <p className="mt-1.5 text-[11.5px] text-ink-600">
                  {fill(copy.media.picking, { count: pickedImages.length })}
                </p>}
                {overflowImages.length > 0 && <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
                  <p className="text-[11.5px] font-semibold text-amber-900">{copy.media.overflowTitle}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-amber-900">{fill(copy.media.overflowBody, { count: imageCount })}</p>
                  <p className="text-[11px] leading-4 text-amber-900">{copy.media.overflowHint}</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">{overflowImages.map((asset) => <li key={asset.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={privateMediaUrl(asset) ?? ""} alt="" className="size-12 rounded-md border border-amber-200 object-cover" />
                    {canDeleteAsset(asset) && <button type="button" disabled={busy} onClick={() => void removeMedia(asset.id)}
                      aria-label={copy.media.overflowDelete} title={copy.media.deleteTitle}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-white p-0.5 text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50">
                      <X className="size-3" aria-hidden="true" />
                    </button>}
                  </li>)}</ul>
                </div>}

                {/* Kho ảnh chỉ hiện phần chưa dùng, nên ảnh đã chọn không bị lặp lại ở hai chỗ. */}
                {!product && unusedBank.length > 0 && <div className="mt-2 rounded-md border border-ink-200 bg-white px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <p className="text-[11.5px] font-semibold text-ink-700">{copy.media.bankTitle}</p>
                    <p className="text-[11px] text-ink-500">{copy.media.bankHint}</p>
                  </div>
                  <ul className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {unusedBank.map((asset) => {
                      const url = privateMediaUrl(asset);
                      return <li key={asset.id} className="relative">
                        <button type="button" disabled={busy || pickedImages.length >= 6} onClick={() => toggleBank(asset.id)}
                          aria-label={copy.media.bankAdd} title={copy.media.bankAddTitle}
                          className="block w-full overflow-hidden rounded-md border border-ink-200 transition hover:border-brand-400 disabled:opacity-50">
                          <span className="block aspect-square overflow-hidden bg-ink-100">
                            {url
                              ? <img src={url} alt="" className="size-full object-cover" />
                              : <span className="flex size-full items-center justify-center text-ink-400"><ImageIcon className="size-4" aria-hidden="true" /></span>}
                          </span>
                        </button>
                        <button type="button" disabled={busy} onClick={() => void removeBank(asset.id)}
                          aria-label={copy.media.bankDelete} title={copy.media.bankDeleteTitle}
                          className="absolute top-1 right-1 rounded-full bg-white/95 p-1 text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50">
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </li>;
                    })}
                  </ul>
                </div>}

                {/* Một chỗ tải tệp duy nhất: ngay dưới 6 ô ảnh. */}
                {canUpload ? <>
                  <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFiles(Array.from(e.dataTransfer.files)); }}
                    className="mt-2 rounded-md border border-dashed border-ink-300 bg-white px-4 py-3 text-center transition hover:border-brand-400 focus-within:border-brand-600">
                    <p className="text-[12px] text-ink-600">{copy.media.dropHint}{" "}
                      <label className="cursor-pointer font-semibold text-brand-700 underline">{product ? copy.media.dropPickFiles : copy.media.dropPickImages}
                        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" aria-label={copy.media.filePickerAria}
                          onChange={(e) => { chooseFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                      </label>
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-500">{fill(product ? copy.media.countFiles : copy.media.countBank, { count: product ? ownedCount : bankOwnCount })}</p>
                    <p className="mt-0.5 text-[11px] text-ink-500">{product ? copy.media.limitFiles : copy.media.limitBank}</p>
                  </div>
                </> : <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900">
                  {locked ? copy.media.lockedPending : copy.media.lockedLegacy}
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
                      {url && <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-[11.5px] font-semibold text-brand-700 underline">{copy.media.viewFile}</a>}
                      {canDeleteAsset(asset) && <button type="button" disabled={busy} onClick={() => void removeMedia(asset.id)}
                        aria-label={fill(copy.media.deleteFileAria, { caption: asset.caption || copy.media.fileWord })} title={copy.media.deleteFileTitle}
                        className="shrink-0 rounded-md border border-rose-200 bg-white p-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                        <X className="size-3" aria-hidden="true" />
                      </button>}
                    </li>;
                  })}
                </ul>
                <p className="mt-1.5 text-[11.5px] leading-4 text-ink-500">{copy.media.catalogueNote}</p>
              </Row>}
            </div>
          </section>

          {/* 04 — Quy cách & năng lực */}
          <section id="sec-spec" data-form-section="sec-spec" aria-label={copy.spec.aria}
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="4" title={copy.spec.title} pill={sectionPill("sec-spec")}
              hint={copy.spec.hint} />
            <div>
              <Row label={copy.spec.spec} hint={copy.spec.specHint}>
                <textarea name="spec" className="input min-h-[76px] resize-y" rows={3} maxLength={800}
                  placeholder={copy.spec.specPlaceholder} defaultValue={product?.spec ?? ""} disabled={locked} />
              </Row>
              <Row label={copy.spec.capacity}>
                <input className="input max-w-[280px]" name="monthly_capacity" maxLength={180} placeholder={copy.spec.capacityPlaceholder}
                  defaultValue={product?.monthly_capacity ?? ""} disabled={locked} />
              </Row>
              <Row label={copy.spec.region} hint={copy.spec.regionHint}>
                <RawMaterialRegionInput defaultValue={product?.raw_material_region ?? ""} disabled={locked} placeholder={shared.regionPlaceholder} />
              </Row>
              <Row label={copy.spec.origin} hint={copy.spec.originHint}>
                <input name="input_material_origin" className="input" maxLength={300}
                  placeholder={copy.spec.originPlaceholder} defaultValue={product?.input_material_origin ?? ""} disabled={locked} />
              </Row>
              {!!selectedCategory && (officialAttributeFields.length > 0 || supplierAttributeFields.length > 0) &&
                <Row label={copy.spec.attributes}>
                  {/* Chỉ hiện thêm khối thông số khi danh mục còn thông số khác ngoài Grade. */}
                  <SupplierAttributeInputs key={selectedCategory} disabled={locked}
                    officialFields={officialAttributeFields}
                    supplierFields={supplierAttributeFields}
                    values={product?.supplier_category_proposal === selectedCategory || product?.reviewed_category_slug === selectedCategory ? product?.specs ?? {} : {}}
                    onCommit={onAttributesCommit} copy={shared.attributes} />
                </Row>}
              <Row label={copy.spec.services}>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-ink-700">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" name="oem" value="yes" defaultChecked={product?.oem ?? false} disabled={locked} className="size-4 accent-brand-700" /> {copy.spec.oem}</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" name="odm" value="yes" defaultChecked={product?.odm ?? false} disabled={locked} className="size-4 accent-brand-700" /> {copy.spec.odm}</label>
                  <label className="inline-flex w-full items-center gap-2"><input type="checkbox" name="samples" value="yes" defaultChecked={product?.samples ?? false} disabled={locked} className="size-4 accent-brand-700" /> {copy.spec.samples}</label>
                </div>
              </Row>
            </div>
          </section>

          {/* 05 — Giá & điều kiện bán */}
          <section id="sec-price" data-form-section="sec-price" aria-label={copy.price.aria}
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="5" title={copy.price.title} pill={sectionPill("sec-price")}
              hint={copy.price.hint} />
            <div>
              <Row label={copy.price.quantity} required error={priceIssueCount > 0}
                hint={priceIssueCount > 0 ? copy.price.quantityHintIssues : copy.price.quantityHint}>
              {product ? <div className="rounded-md border border-ink-200 p-3">
                {quantityEditor ? <QuantityPricingInline key={`${quantityEditor.productId}:${quantityEditor.updatedAt}`}
                  data={quantityEditor} actor="supplier" disabled={locked || busy} dirty={dirty} onPreviewChange={setQuantityPreview}
                  copy={shared.quantityInline} lang={lang} />
                  : <p role="alert" className="text-xs text-rose-700">{copy.price.quantityLoadFailed}</p>}
              </div> : <div id="new-quantity-pricing" className="space-y-3 rounded-md border border-ink-200 p-3">
                {!activeCategory ? <p className="text-xs text-ink-600">{copy.price.noCategory}</p> : !newPolicy || !newQuantity ?
                  <p role="alert" className="text-xs text-rose-700">{copy.price.policyFailed}</p> : <>
                    <p className="text-xs text-ink-600">{copy.price.nameNote}</p>
                    {newQuantity && <QuantityPricingEditor value={newQuantity} onChange={onNewQuantityChange} standardGrades={newGrades} policy={newPolicy}
                      buyerPriceUnit={newBuyerUnit} pricePubliclyVisible={snapshot.price_publicly_visible === "yes"}
                      isolated showPreview={false} showTitle={false} validateEnglishName={false} showErrors={showGradeErrors} consentChecked={quantityConsent} onConsentChange={setQuantityConsent}
                      gradeScope={activeCategorySlug}
                      copy={shared.quantityEditor} lang={lang}
                      onAddGrade={(grade) => addSupplierGradeOptionAction({ categorySlug: activeCategorySlug, grade })} />}
                  </>}
              </div>}
              </Row>

              <Row label={copy.price.sample} hint={copy.price.sampleHint}>
                <input className="input max-w-[200px]" name="sample_price_usd" inputMode="decimal" placeholder={copy.price.samplePlaceholder}
                  defaultValue={product?.sample_price_usd ?? ""} disabled={locked} />
              </Row>

              <Row label={copy.price.display}>
                <div className="text-[12px] text-ink-700">
                <label className="flex items-start gap-2 font-semibold">
                  <input type="checkbox" name="price_publicly_visible" value="yes" defaultChecked={priceOptInDefault(product)} disabled={locked} className="mt-0.5 size-4 accent-brand-700" />
                  {copy.price.publicOptIn}
                </label>
                {!product && <p className="mt-1 pl-6 text-[11px] leading-4 text-ink-500">{copy.price.publicOptInHint}</p>}
                {product && <div className="mt-2 rounded-md bg-white p-2.5 text-[11px] leading-4" role="status">
                  <strong>{copy.price.savedState}</strong> {priceBlockers.length === 0 ? copy.price.savedOk : copy.price.savedBlocked}
                  <ul className="mt-1 list-disc pl-5">{priceBlockers.map((reason) => <li key={reason}>{reason}</li>)}
                    {(review !== "approved" || !product.ready_for_buyer || supplier.status !== "published") && <li>{copy.price.savedBlockedProduct}</li>}
                  </ul>
                  {dirty && <p className="mt-1 font-semibold text-amber-800">{copy.price.savedStale}</p>}
                </div>}
                <p className="mt-1.5 text-[11px] leading-4 text-ink-600">
                  {copy.price.needsApproval}
                  {supplierPriceConsentCurrent(supplier) ? copy.price.consentCurrent : ""}
                </p>
                </div>
              </Row>

              {/* Chỉ hiện khi chưa có cam kết còn hiệu lực; nếu không hàng này sẽ trống trơn. */}
              {!supplierPriceConsentCurrent(supplier) && <Row label={copy.price.confirm} required={snapshot.price_publicly_visible === "yes"}>
                <div className="rounded-md border border-ink-200 bg-white p-3">
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
                      {copy.price.consentText}
                      {snapshot.price_publicly_visible === "yes" && <span className="ml-1 font-semibold text-rose-700">*</span>}
                    </span>
                  </label>
                  <p className="mt-1 pl-6 text-[10.5px] leading-4 text-ink-500">
                    {copy.price.consentNote}{" "}
                    <Link href="/dieu-khoan-su-dung" className="font-semibold text-brand-800 underline">{copy.price.terms}</Link>
                  </p>
                </div>
              </Row>}
            </div>
          </section>

          {/* 06 — Đóng gói & giao hàng */}
          <section id="sec-shipping" data-form-section="sec-shipping" aria-label={copy.shipping.aria}
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="6" title={copy.shipping.title} pill={sectionPill("sec-shipping")}
              hint={copy.shipping.hint} />
            <div>
              <Row label={copy.shipping.packaging}>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SubField label={copy.shipping.packageType}>
                      <input className="input" name="package_type" maxLength={40} placeholder={copy.shipping.packageTypePlaceholder}
                        defaultValue={product?.package_type ?? ""} disabled={locked} />
                    </SubField>
                    <SubField label={copy.shipping.packageWeight}>
                      <input className="input" name="package_weight_kg" inputMode="decimal" placeholder="25"
                        defaultValue={product?.package_weight_kg ?? ""} disabled={locked} />
                    </SubField>
                    <SubField label={copy.shipping.unitsPerCarton}>
                      <input className="input" name="units_per_carton" inputMode="numeric" placeholder="20"
                        defaultValue={product?.units_per_carton ?? ""} disabled={locked} />
                    </SubField>
                  </div>
                  <SubField label={copy.shipping.packageSize}>
                    <input className="input max-w-[300px]" name="package_size" maxLength={60} placeholder="60 × 40 × 40"
                      defaultValue={product?.package_size ?? ""} disabled={locked} />
                  </SubField>
                  <p className="-mt-1.5 text-[11.5px] leading-4 text-ink-500">{copy.shipping.packageSizeNote}</p>
                </div>
              </Row>

              <Row label={copy.shipping.leadTime} hint={copy.shipping.leadTimeHint}>
                <div className="flex items-center gap-2">
                  <input
                    name="lead_time_value"
                    type="number"
                    min={1}
                    max={leadTimeUnit === "weeks" ? 52 : 365}
                    className="input w-[120px] shrink-0 font-mono tabular-nums disabled:bg-ink-50 disabled:text-ink-400"
                    placeholder={leadTimeUnit === "on_request" ? "-" : leadTimeUnit === "weeks" ? copy.shipping.leadTimePlaceholderWeeks : copy.shipping.leadTimePlaceholderDays}
                    value={leadTimeUnit === "on_request" ? "" : leadTimeValue}
                    onChange={(e) => updateLeadTime(e.target.value, leadTimeUnit)}
                    disabled={locked || leadTimeUnit === "on_request"}
                  />
                  <select
                    name="lead_time_unit"
                    aria-label={copy.shipping.leadTimeUnit}
                    className="input w-[120px] shrink-0"
                    value={leadTimeUnit}
                    onChange={(e) => updateLeadTime(leadTimeValue, e.target.value as LeadTimeUnit)}
                    disabled={locked}
                  >
                    {LEAD_TIME_UNIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{lang === "en" ? opt.enLabel : opt.viLabel}</option>
                    ))}
                  </select>
                  <input type="hidden" name="lead_time_days" value={computedLeadTimeDays} readOnly />
                </div>
              </Row>

              <Row label={copy.shipping.transport}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SubField label={copy.shipping.exportPort}>
                    <input name="export_port" className="input" maxLength={120} placeholder={copy.shipping.exportPortPlaceholder}
                      defaultValue={String(product?.export_port ?? "")} disabled={locked} />
                  </SubField>
                  <SubField label={copy.shipping.incotermPlace}>
                    <input name="incoterm_place" className="input" maxLength={100} placeholder={copy.shipping.incotermPlacePlaceholder}
                      defaultValue={String(product?.incoterm_place ?? "")} disabled={locked} />
                  </SubField>
                </div>
              </Row>

              <Row label={copy.shipping.payment}>
                <input name="payment_terms" className="input" maxLength={200} placeholder={copy.shipping.paymentPlaceholder}
                  value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} disabled={locked} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[copy.shipping.paymentDeposit, "L/C at sight", "D/P"].map((option) => <button key={option} type="button" disabled={locked}
                    onClick={() => setPaymentTerm(option)}
                    className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-800 disabled:opacity-50">
                    {option}
                  </button>)}
                </div>
              </Row>
            </div>
          </section>

          {/* 07 — Nội dung chi tiết */}
          <section id="sec-detail" data-form-section="sec-detail" aria-label={copy.detail.aria}
            className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
            <SectionHead index="7" title={copy.detail.title} pill={sectionPill("sec-detail")}
              hint={copy.detail.hint} />
            <div className="px-4 py-4 sm:px-5">
              <div className="text-[12px]">
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">{copy.detail.label}</span>
                <ProductDescriptionEditor id="supplier-product-description-detail" name="description_detail"
                  value={snapshot.description_detail} onChange={onDescriptionDetailChange} disabled={locked || busy}
                  copy={shared.description} />
                <span className="mt-1 block text-[11px] leading-4 text-ink-500">{copy.detail.note}</span>
              </div>
            </div>
          </section>
        </form>

        {/* 08 — Xem lại & gửi */}
        <section id="sec-review" data-form-section="sec-review" aria-label={copy.review.aria}
          className="mt-3 scroll-mt-24 rounded-lg border border-ink-200 bg-white">
          <SectionHead index="8" title={copy.review.title} />
          <div className="space-y-2.5 px-3 py-2.5 sm:px-3.5">
            {/* Danh sách kiểm tra: mỗi dòng một việc, bên phải là hành động tương ứng. */}
            <ul className="space-y-2 px-4 py-4 sm:px-5">
              {([
                { ok: hasDetails, label: copy.review.checkDetails,
                  action: fill(copy.review.goSection, { index: 2 }), run: () => scrollToSection("sec-basic") },
                { ok: hasAnyImage, label: copy.review.checkImage,
                  action: fill(copy.review.goSection, { index: 3 }), run: () => scrollToSection("sec-media") },
                { ok: priceIssueCount === 0 && (!!product || !!quantityPreview), label: copy.review.checkPrice,
                  action: fill(copy.review.goSection, { index: 5 }), run: () => scrollToSection("sec-price") },
                { ok: !!(snapshot.name ?? "").trim() && !!selectedCategory, label: copy.review.checkName,
                  action: copy.review.edit, run: () => scrollToSection("sec-category") },
              ]).map((row) => <li key={row.label}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-ink-200 px-3 py-2.5">
                {row.ok
                  ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  : <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />}
                <span className={`min-w-0 flex-1 text-[12.5px] ${row.ok ? "text-ink-700" : "font-semibold text-ink-900"}`}>{row.label}</span>
                <button type="button" onClick={row.run}
                  className="shrink-0 text-[12px] font-bold text-brand-800 underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
                  {row.ok ? copy.review.edit : row.action}
                </button>
              </li>)}
            </ul>

            <details className="mx-4 mb-4 rounded-md border border-ink-200 sm:mx-5">
              <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-bold text-ink-700">{copy.review.openSaved}</summary>
              <div className="space-y-2.5 px-3 pb-3">
            <div className="rounded-lg border border-ink-200">
              <ReviewHead editLabel={copy.review.edit} title={copy.review.headBasic} onEdit={() => scrollToSection("sec-basic")} />
              <dl className="grid gap-x-4 gap-y-2 px-3.5 py-2.5 text-[12px] sm:grid-cols-2">
                <div className="sm:col-span-2"><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.name} value={snapshot.name} strong /></div>
                <div className="sm:col-span-2"><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.category} value={categoryLabel} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.keywords} value={snapshot.keywords} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.description} value={snapshot.description} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.spec} value={snapshot.spec} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.capacity} value={snapshot.monthly_capacity} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.region} value={snapshot.raw_material_region} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.origin} value={snapshot.input_material_origin} /></div>
                {attributeRows.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-semibold text-ink-500">{copy.review.attributes}</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">{attributeRows.map(([label, value]) =>
                      <span key={label} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-800"><strong className="font-semibold">{label}:</strong> {value}</span>)}</dd>
                  </div>
                )}
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-[11px] font-semibold text-ink-500">{copy.review.detailLabel}</dt>
                  <dd className="mt-1 rounded-lg bg-ink-50 px-2.5 py-1.5"><ProductDescriptionPreview value={snapshot.description_detail} /></dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-ink-200">
              <ReviewHead editLabel={copy.review.edit} title={copy.review.headPrice} onEdit={() => scrollToSection("sec-price")} />
              <div className="px-3.5 py-2.5 text-[12px]">
                {quantityEditor?.v2 ? <>
                  <p>{copy.review.grade} <strong>{quantityEditor.grade}</strong> · {copy.review.incoterm} <strong>{quantityEditor.incoterm}</strong></p>
                  <table className="mt-1.5 w-full text-left text-[11.5px]"><thead><tr><th>{fill(copy.review.quantity, { unit: quantityEditor.v2.unit === "mt" ? "MT" : "kg" })}</th><th>{fill(copy.review.priceColumn, { unit: quantityEditor.v2.unit === "mt" ? "MT" : "kg" })}</th></tr></thead>
                    <tbody>{quantityEditor.v2.tiers.map((tier, index) => <tr key={index} className="border-t border-ink-100"><td className="py-1 tabular-nums">{tier.quantity}</td><td className="py-1 tabular-nums">{tier.price}</td></tr>)}</tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-ink-500">{quantityEditor.pendingPriceId ? copy.review.pendingTable : copy.review.approvedTable}</p>
                </> : quantityEditor && quantityPreview ? <>
                  <p>{copy.review.grade} <strong>{quantityPreview.grade || copy.review.notChosen}</strong> · {copy.review.currency} <strong>{quantityPreview.currency ?? "USD"}</strong></p>
                  <table className="mt-1.5 w-full text-left text-[11.5px]"><thead><tr><th>{copy.review.incoterm}</th><th>{copy.review.quantityFrom}</th><th>{fill(copy.review.pricePerKg, { currency: quantityPreview.currency ?? "USD" })}</th></tr></thead>
                    <tbody>{quantityPreview.tiers.map((tier, index) => <tr key={index} className="border-t border-ink-100"><td className="py-1">{tier.incoterm || quantityPreview.incoterm || "—"}</td><td className="py-1 tabular-nums">{tier.minKg || "—"}</td><td className="py-1 tabular-nums">{tier.priceUsdPerKg || "—"}</td></tr>)}</tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-ink-500">{copy.review.tableNeedsReview}</p>
                </> : <span>{copy.review.newTableFailed}</span>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([
                    [snapshot.price_publicly_visible === "yes", copy.price.publicOptIn],
                    [snapshot.oem === "yes", copy.spec.oem],
                    [snapshot.odm === "yes", copy.spec.odm],
                    [snapshot.samples === "yes", copy.spec.samples],
                  ] as const).map(([on, label]) => <span key={label} className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${on ? "bg-brand-50 text-brand-900 ring-1 ring-brand-200" : "bg-ink-100 text-ink-500 line-through"}`}>{label}</span>)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-ink-200">
              <ReviewHead editLabel={copy.review.edit} title={copy.review.headShipping} onEdit={() => scrollToSection("sec-shipping")} />
              <dl className="grid gap-x-4 gap-y-2 px-3.5 py-2.5 text-[12px] sm:grid-cols-2">
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.packagingLabel} value={snapshot.packaging} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.packageType} value={snapshot.package_type} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.packageWeight} value={snapshot.package_weight_kg} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.packageSize} value={snapshot.package_size} /></div>
                <div><ReviewField emptyLabel={copy.review.notEntered} label={copy.review.unitsPerCarton} value={snapshot.units_per_carton} /></div>
                {reviewCommercial(copy).map(([key, label]) => {
                  const displayValue = key === "lead_time_days"
                    ? (leadTimeUnit === "on_request" || !leadTimeValue.trim()
                        ? shared.gradePricing.leadTimeOnRequest
                        : fill(leadTimeUnit === "weeks" ? shared.gradePricing.leadTimeWeeks : shared.gradePricing.leadTimeDays,
                          { value: leadTimeValue.trim() }))
                    : snapshot[key];
                  return <div key={key}><ReviewField emptyLabel={copy.review.notEntered} label={label} value={displayValue} /></div>;
                })}
              </dl>
            </div>

            <div className="rounded-lg border border-ink-200">
              <ReviewHead editLabel={copy.review.edit} title={fill(copy.review.headMedia, { count: media.length })} onEdit={() => scrollToSection("sec-media")} />
              <div className="px-3.5 py-2.5">
                {media.length
                  ? <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                    {media.slice(0, 6).map((asset) => {
                      const url = privateMediaUrl(asset);
                      return <li key={asset.id} className="relative overflow-hidden rounded-md border border-ink-200 bg-ink-50">
                        <span className="block aspect-square">
                          {asset.kind === "image" && url
                            ? <img src={url} alt={asset.caption || copy.review.photoAlt} className="size-full object-cover" />
                            : <span className="flex size-full items-center justify-center text-brand-700"><FileText className="size-5" aria-hidden="true" /></span>}
                        </span>
                      </li>;
                    })}
                  </ul>
                  : <p className="rounded-md bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900">{copy.review.mediaEmpty}</p>}
                {media.length > 6 && <p className="mt-1 text-[10.5px] text-ink-500">{fill(copy.review.mediaMore, { count: media.length - 6 })}</p>}
              </div>
            </div>
              </div>
            </details>

            {sent || review === "pending"
              ? <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] font-semibold text-emerald-900">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{copy.review.sentPending}</span>
                <Link href="/supplier/portal/products" className="underline">{copy.review.backToList}</Link>
              </div>
              : review === "approved"
                ? <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-800"><Check className="size-4" aria-hidden="true" /> {live ? copy.review.liveDone : copy.review.approvedPending}</p>
                : <div className="space-y-2">
                  <div id="submit-blockers" aria-live="polite">
                    {submitHint?.length
                      ? <ul role="alert" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                        {submitHint.map((hint) => <li key={hint} className="flex gap-1.5"><AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{hint}</li>)}
                      </ul>
                      : submitReady
                        ? <p className="text-[11.5px] text-ink-600">{copy.review.eligible}</p>
                        : null}
                  </div>
                </div>}
            {quantityEditor?.pendingNameId
              ? <p className="text-[11px] leading-4 text-ink-500">{copy.review.englishPending}</p>
              : quantityEditor?.hasApprovedName
                ? <p className="text-[11px] leading-4 text-ink-500">{copy.review.englishApproved}</p>
                : null}
          </div>
        </section>

        {/* Thanh dính đáy: lưu nháp và gửi duyệt, luôn trong tầm tay. */}
        {/* Thanh đính đáy: huỷ + trạng thái bên trái, ba nút hành động bên phải. */}
        <div className="sticky bottom-0 z-20 mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white/95 px-3 py-2 shadow-[0_-2px_12px_rgba(15,23,42,0.08)] backdrop-blur">
          <Link href="/supplier/portal/products" className="text-[13px] font-semibold text-ink-600 hover:text-ink-900">{copy.footer.cancel}</Link>
          <span className="hidden min-w-0 items-center gap-1.5 truncate text-[12px] text-ink-500 sm:flex">
            <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dirty ? "bg-amber-500" : review === "changes_requested" ? "bg-rose-500" : "bg-emerald-500"}`} />
            <span className="truncate">
              {dirty ? copy.footer.dirty : product ? fill(copy.footer.savedInfo, { count: media.length }) : copy.footer.unsaved}
            </span>
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Mở bản xem trước đúng những gì người mua thấy; không rời trang nên giữ nguyên phần đang nhập. */}
            <button type="button" onClick={() => setPreviewOpen(true)} aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-800 hover:bg-ink-50">
              <Eye className="size-3.5" aria-hidden="true" /> {copy.footer.preview}
            </button>
            {!locked && dirty &&
              <button type="submit" form="product-info" disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-800 hover:bg-ink-50 disabled:opacity-50">
                <Save className="size-3.5" aria-hidden="true" /> {review === "approved" ? copy.footer.saveChanges : copy.footer.saveDraft}
              </button>}
            {review === "pending" || review === "approved" || sent
              ? <span className="text-[12px] font-semibold text-emerald-800">{review === "approved" ? (live ? copy.footer.published : copy.footer.approvedPending) : copy.footer.sent}</span>
              : <button type="button" onClick={requestSubmit} disabled={busy} aria-describedby="submit-blockers"
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-brand-800 disabled:opacity-70">
                {busy
                  ? <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> {copy.footer.sending}</>
                  : <><Send className="size-3.5" aria-hidden="true" /> {copy.footer.submit}</>}
              </button>}
          </div>
        </div>
      </div>

      {/* Cột phải: thẻ xem nhanh - đọc được ngay cả khi cuộn giữa trang. */}
      <aside className="space-y-3 lg:sticky lg:top-4">
        {/* Thẻ điểm chất lượng đứng trước để thấy ngay việc cần bổ sung. */}
        {product && <section aria-label={copy.side.qualityAria} className="rounded-lg border border-ink-200 bg-white p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">{copy.side.qualityTitle}</p>
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
            <p className="min-w-0 text-[13px] font-bold text-ink-900">{completeness.score >= 85 ? copy.side.high : completeness.score >= 60 ? copy.side.medium : copy.side.low}</p>
          </div>
          {completeness.next ? <>
            <p className="mt-2.5 text-[10.5px] font-bold tracking-wider text-ink-500 uppercase">{copy.side.nextTitle}</p>
            <ul className="mt-1 space-y-1 text-[11.5px] leading-4 text-ink-600">
              {completeness.missing.slice(0, 3).map((item) => <li key={item.key} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="min-w-0 flex-1"><strong className="font-semibold text-ink-800">{lang === "en" ? item.labelEn : item.label}</strong>{lang === "en" ? "" : ` · ${item.hint}`}</span>
                <span className="shrink-0 rounded bg-brand-50 px-1 py-0.5 font-mono text-[9.5px] font-bold text-brand-800">+{item.weight}</span>
              </li>)}
            </ul>
            {completeness.missing.length > 3 && <p className="mt-1.5 text-[11px] text-ink-500">{fill(copy.side.moreItems, { count: completeness.missing.length - 3 })}</p>}
            <button type="button" onClick={() => scrollToSection(SECTION_FOR_ITEM[completeness.next!.key] ?? "sec-basic")} className="btn btn-soft btn-sm mt-2">
              {fill(copy.side.addNext, { label: lang === "en" ? completeness.next.labelEn : completeness.next.label })}
            </button>
          </> : <p className="mt-2 text-[11.5px] leading-4 text-emerald-700">{copy.side.complete}</p>}
          <p className="mt-2 text-[10.5px] leading-4 text-ink-500">{copy.side.liveNumbers}</p>
        </section>}

        <div className="overflow-hidden rounded-lg border border-ink-200 bg-white">
          <div className="relative aspect-square bg-gradient-to-br from-ink-100 via-brand-50 to-ink-100">
            {coverUrl
              ? <img src={coverUrl} alt="" className="size-full object-cover" />
              : <span className="flex size-full flex-col items-center justify-center gap-1.5 text-ink-400"><ImageIcon className="size-8 stroke-1" aria-hidden="true" /><span className="text-[11px] font-semibold">{copy.side.noPhoto}</span></span>}
            <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${status.tone}`}>{statusLabel}</span>
          </div>
          <div className="px-3.5 py-3">
            <p className="text-[10.5px] font-bold tracking-wider text-brand-700 uppercase">{categoryLabel}</p>
            {newQuantity && newPolicy ? <div className="mt-2">
              <QuantityBuyerPreview value={newQuantity} standardGrades={newGrades} policy={newPolicy}
                buyerPriceUnit={newBuyerUnit} pricePubliclyVisible={snapshot.price_publicly_visible === "yes"} copy={shared.quantityEditor} />
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-[10.5px] leading-4 text-amber-900">{copy.side.previewNote}</p>
            </div> : quantityEditor && quantityPreview ? <div className="mt-2">
              <QuantityBuyerPreview value={quantityPreview} standardGrades={quantityEditor.standardGrades} policy={quantityEditor.policy}
                buyerPriceUnit={quantityEditor.buyerPriceUnit} pricePubliclyVisible={quantityEditor.pricePubliclyVisible} copy={shared.quantityEditor} />
              <p className="mt-2 rounded-md bg-amber-50 p-2 text-[10.5px] leading-4 text-amber-900">{copy.side.previewNoteLive}</p>
            </div> : <h2 className="mt-0.5 line-clamp-2 text-[13.5px] font-black text-ink-900">{product?.name ?? copy.side.newProduct}</h2>}
            <dl className="mt-2.5 space-y-1 border-t border-ink-100 pt-2.5 text-[11.5px]">
              {commercial.filter((row) => !((quantityEditor && quantityPreview) || (newQuantity && newPolicy)) ||
                ![copy.reviewLabels.price, copy.reviewLabels.moq, copy.reviewLabels.incoterm].includes(row.label)).map((row) => <div key={row.label} className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-ink-500">{row.label}</dt>
                <dd className={`min-w-0 truncate text-right font-semibold text-ink-800 ${row.label === copy.reviewLabels.price && row.value !== "-" ? "font-mono tabular-nums" : ""}`}>{row.value}</dd>
              </div>)}
            </dl>
            <p className="mt-2 text-[10.5px] leading-4 text-ink-500">{quantityEditor && quantityPreview
              ? copy.side.previewNoteLive
              : <>{copy.side.savedNote}{dirty ? copy.side.savedNoteDirty : copy.side.savedNoteEnd}</>}</p>
          </div>
        </div>

        {product && (canDeleteDraft || review === "approved") && <section aria-label={copy.side.manageAria} className="rounded-lg border border-ink-200 bg-white p-3">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">{copy.side.manageTitle}</p>
          {canDeleteDraft ? <>
            <p className="mt-2 text-[11.5px] leading-5 text-ink-600">{copy.side.deleteDraftNote}</p>
            <button type="button" disabled={busy || dirty} onClick={() => void deleteDraft()} className="btn btn-ghost btn-sm mt-2 text-rose-700 disabled:opacity-50">
              <Trash2 className="size-3.5" aria-hidden="true" /> {copy.side.deleteDraft}
            </button>
          </> : <>
            <p className="mt-2 text-[11.5px] leading-5 text-ink-600">{copy.side.archiveNote}</p>
            <button type="button" disabled={busy || dirty} onClick={() => void pauseProduct()} className="btn btn-ghost btn-sm mt-2 text-ink-700 disabled:opacity-50">
              <EyeOff className="size-3.5" aria-hidden="true" /> {copy.side.archive}
            </button>
          </>}
          {dirty && <p className="mt-2 text-[11px] text-amber-800">{copy.side.saveFirst}</p>}
        </section>}

        <details className="rounded-lg border border-ink-200 bg-white">
          <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-bold text-ink-800">{copy.side.examplesTitle}</summary>
          <ul className="space-y-1 px-3 pb-3 text-[11.5px] leading-4 text-ink-600">
            <li><strong className="font-semibold text-ink-800">{copy.side.exampleName}</strong> {copy.side.exampleNameValue}</li>
            <li><strong className="font-semibold text-ink-800">{copy.side.exampleMoq}</strong> {copy.side.exampleMoqValue}</li>
            <li><strong className="font-semibold text-ink-800">{copy.side.examplePackaging}</strong> {copy.side.examplePackagingValue}</li>
            <li><strong className="font-semibold text-ink-800">{copy.side.exampleKeywords}</strong> {copy.side.exampleKeywordsValue}</li>
          </ul>
          <p className="px-3 pb-3 text-[10.5px] leading-4 text-ink-500">{copy.side.exampleNote}</p>
        </details>

        <div className="rounded-lg border border-ink-200 bg-ink-50/70 p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">{copy.side.flowTitle}</p>
          <ol className="mt-2 space-y-2 text-[11.5px] leading-4 text-ink-600">
            <li className="flex gap-2"><span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-brand-700 text-[10px] font-bold text-white">1</span>{copy.side.flow1}</li>
            <li className="flex gap-2"><span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-ink-300 bg-white text-[10px] font-bold text-ink-500">2</span>{copy.side.flow2}</li>
            <li className="flex gap-2"><span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-ink-300 bg-white text-[10px] font-bold text-ink-500">3</span>{copy.side.flow3}</li>
          </ol>
        </div>

        <Link href="/supplier/portal/products" className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-800">
          {copy.footer.productsLink} <ChevronRight className="size-3.5" aria-hidden="true" />
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
      <button type="button" onClick={() => setToast(null)} aria-label={copy.toastClose}
        className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"><X className="size-4" aria-hidden="true" /></button>
    </div>}

    {/* Bản xem trước: dùng chính component của trang người mua, dựng từ nội dung đang nhập. */}
    {previewOpen && <BuyerPreviewDialog open onClose={() => setPreviewOpen(false)} data={{
      title: buyerPreviewNameEn || (snapshot.name ?? "").trim(),
      hasEnglishTitle: !!buyerPreviewNameEn,
      categoryLabel: activeCategory?.label ?? copy.review.notChosen,
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
    }} copy={shared.buyerPreview} />}
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

function ReviewHead({ title, onEdit, editLabel }: { title: string; onEdit: () => void; editLabel: string }) {
  return <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3.5 py-2">
    <h3 className="text-[12px] font-bold tracking-wide text-ink-800 uppercase">{title}</h3>
    <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold text-brand-800 hover:bg-brand-50">
      <Pencil className="size-3" aria-hidden="true" /> {editLabel}
    </button>
  </div>;
}

function ReviewField({ label, value, strong, mono, emptyLabel }: { label: string; value?: string; strong?: boolean; mono?: boolean; emptyLabel: string }) {
  const shown = value?.trim();
  return <div className="min-w-0">
    <dt className="text-[11px] font-semibold text-ink-500">{label}</dt>
    <dd className={`mt-0.5 break-words whitespace-pre-wrap ${strong ? "text-[13px] font-bold text-ink-900" : "text-[12.5px] text-ink-800"} ${shown && mono ? "font-mono tabular-nums" : ""} ${shown ? "" : "text-ink-400"}`}>{shown || emptyLabel}</dd>
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
