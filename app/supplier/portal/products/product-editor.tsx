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
import { GradePricingTable } from "@/components/products/grade-pricing-table";
import {
  CUSTOM_GRADE_OPTION,
  categoryMarketPriceUnit,
  formatGradeRowPriceVi,
  hydrateGradeRowsDraft,
  isGradeFieldKey,
  nonGradeProductFields,
  reconcileGradeRowsForCategory,
  serializeGradeRowsDraft,
  validateGradeRowsDraft,
  type ProductGradeRowDraft,
} from "@/lib/products/grade-pricing";
import { effectiveFieldsFor, fieldsFor, supplierFieldsFor } from "@/lib/product-attributes";

type EditorProps = {
  product?: SupplierProduct;
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
  ["price_valid_until", "Giá có hiệu lực tới"],
  ["lead_time_days", "Thời gian giao hàng (ngày)"],
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
function snapshotFrom(product?: SupplierProduct, gradeRowsJson = ""): Record<string, string> {
  const seed: Record<string, string> = {
    name: product?.name ?? "",
    description: product?.description ?? "",
    spec: product?.spec ?? "",
    description_detail: product?.description_detail ?? "",
    raw_material_region: product?.raw_material_region ?? "",
    input_material_origin: product?.input_material_origin ?? "",
    grade_rows_json: gradeRowsJson,
  };
  for (const [key] of [...REVIEW_COMMERCIAL, ...REVIEW_ORDER]) {
    const value = product ? (product as unknown as Record<string, unknown>)[key] : "";
    seed[key] = value == null ? "" : String(value);
  }
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
export function SupplierProductEditor({ product, media = [], userId, categories, categoryScope = [], supplier, initialStep = 1 }: EditorProps) {
  const router = useRouter();
  const globalToast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  // Bước sẽ mở sau khi lưu thành công; null = chỉ lưu rồi ở lại.
  const advanceTo = useRef<Step | null>(null);

  const [step, setStep] = useState<Step>(initialStep);
  const [busy, setBusy] = useState(false);
  const initialCategorySlug = product?.reviewed_category_slug ?? product?.supplier_category_proposal ?? product?.category ?? "";
  const [selectedCategory, setSelectedCategory] = useState(product?.reviewed_category_slug ?? product?.supplier_category_proposal ?? product?.category ?? "");
  const initialCategoryObj = categories.find((c) => c.slug === initialCategorySlug) ?? (initialCategorySlug ? { slug: initialCategorySlug } : null);
  const [gradeRows, setGradeRows] = useState<ProductGradeRowDraft[]>(() => hydrateGradeRowsDraft(product, initialCategoryObj));
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
    snapshotFrom(product, serializeGradeRowsDraft(hydrateGradeRowsDraft(product, initialCategoryObj))),
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
    const initial = snapshotFromForm(formRef.current, snapshotFrom(product, serializeGradeRowsDraft(gradeRows)));
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
  const hasDetails = !!product && !!(product.spec?.trim() || product.description?.trim());
  const hasMedia = media.some((m) => (m.kind === "image" || m.kind === "catalogue") && !!m.storage_path);
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

  const onGradeRowsChange = useCallback((next: ProductGradeRowDraft[]) => {
    setGradeRows(next);
    const json = serializeGradeRowsDraft(next);
    setSnapshot((previous) => ({ ...previous, grade_rows_json: json }));
  }, []);

  function onCategorySelect(nextSlug: string) {
    setSelectedCategory(nextSlug);
    const nextCat = categories.find((c) => c.slug === nextSlug) ?? (nextSlug ? { slug: nextSlug } : null);
    const reconciled = reconcileGradeRowsForCategory(gradeRows, nextCat);
    setGradeRows(reconciled);
    const json = serializeGradeRowsDraft(reconciled);
    setSnapshot((previous) => ({
      ...previous,
      supplier_category_proposal: nextSlug,
      grade_rows_json: json,
    }));
  }

  function validateCurrentGradeRows(): string | null {
    const check = validateGradeRowsDraft(gradeRows, activeCategorySource);
    return check.valid ? null : (check.message ?? "Kiểm tra lại bảng Grade & giá.");
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
        document.getElementById("grade-pricing-table")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setBusy(true);
    setToast(null);
    setStepError(null);
    try {
      const form = new FormData(formElement);
      form.set("grade_rows_json", serializeGradeRowsDraft(gradeRows));
      if (product) form.set("product_id", product.id);
      const response = await saveSupplierProductAction(form);
      setToast(response);
      if (!response.ok) return;
      setShowGradeErrors(false);
      setSubmitHint(null);
      const saved = snapshotFromForm(formElement, { ...snapshot, grade_rows_json: serializeGradeRowsDraft(gradeRows) });
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
        document.getElementById("grade-pricing-table")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      `Tạm ẩn “${product.name}” khỏi buyer? Sản phẩm và lịch sử được giữ. Khi muốn đăng lại, bạn cần gửi duyệt và chờ phê duyệt.`,
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
  const savedPriceValue = product?.ref_price != null
    ? formatGradeRowPriceVi(
        product.ref_price,
        product.ref_price_max != null && product.ref_price_max >= product.ref_price ? product.ref_price_max : product.ref_price,
        unitMeta.unitLabel,
      )
    : product
      ? "Báo giá theo yêu cầu"
      : "-";
  const commercial = [
    { label: "Giá tham khảo", value: savedPriceValue },
    { label: "MOQ", value: product?.moq || "-" },
    { label: "Năng lực / tháng", value: product?.monthly_capacity || "-" },
    { label: "Thời gian giao", value: product?.lead_time_days != null ? `${product.lead_time_days} ngày` : "-" },
    { label: "Cảng xuất", value: product?.export_port || "-" },
    { label: "Incoterm", value: [product?.incoterm, product?.incoterm_place].filter(Boolean).join(" / ") || "-" },
    { label: "Thanh toán", value: product?.payment_terms || "-" },
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
        {/* Chỉ trạng thái cần NCC hành động mới hiện thanh: "Đã đăng" đã có nhãn ở thanh đáy và panel bước 3,
            không lặp khối tĩnh sát thanh chọn bước. Kết quả mỗi hành động bắn qua thông báo nổi. */}
        {(review === "pending" || review === "changes_requested" || review === "paused") && <section aria-label="Trạng thái xét duyệt"
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-4 py-2.5 ${review === "changes_requested" ? "border-rose-200 bg-rose-50" : review === "paused" ? "border-slate-300 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>{statusLabel}</span>
          <p className="min-w-0 flex-1 text-[12px] leading-5 text-ink-700">
            {review === "pending"
              ? "Đã gửi duyệt. Bạn có thể xem nhưng chưa thể chỉnh sửa hoặc tải tệp."
              : review === "paused"
                ? "Sản phẩm đang ẩn khỏi buyer. Muốn đăng lại, hãy gửi duyệt ở bước 3 và chờ phê duyệt."
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
              <SectionHead title="Thông tin cơ bản" hint="Tên, danh mục và mô tả - phần buyer đọc đầu tiên." />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Tên sản phẩm" hint="Ví dụ: Hạt điều nhân trắng W320" required>
                    <input name="name" className="input" required maxLength={180} minLength={3} placeholder="Nhập tên mặt hàng của bạn" defaultValue={product?.name ?? ""} disabled={locked} />
                  </Field>
                </div>
                <Field label="Danh mục sản phẩm" required className="md:col-span-2" hint="Chọn danh mục gần nhất. Danh mục sẽ được kiểm tra khi duyệt. Đổi danh mục thì danh sách grade đổi theo.">
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
                  <GradePricingTable
                    rows={gradeRows}
                    onChange={onGradeRowsChange}
                    category={activeCategorySource}
                    disabled={locked}
                    showErrors={showGradeErrors}
                    hiddenInputName="grade_rows_json"
                  />
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
                    <span className="mt-1 block text-[11px] leading-4 text-ink-500">Dùng tiêu đề, in đậm, in nghiêng và danh sách để buyer dễ đọc. Không nhập thông tin liên hệ trực tiếp.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Không còn mũi tên gập: thương mại & xuất khẩu hiện ngay từ bước 1. */}
            <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
              <SectionHead title="Thông tin thương mại & xuất khẩu" />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2 xl:grid-cols-3">
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
                  <input type="checkbox" name="price_publicly_visible" value="yes" defaultChecked={priceOptInDefault(product)} disabled={locked} className="mt-0.5 size-4 accent-brand-700" />
                  Cho phép công khai giá tham khảo của sản phẩm này khi đủ điều kiện
                </label>
                {!product && <p className="mt-1 pl-6 text-[11px] leading-4 text-ink-500">Được chọn sẵn. Bỏ chọn nếu chưa muốn chia sẻ giá.</p>}
                {product && <div className="mt-2.5 rounded-md bg-white p-2.5 text-[11.5px] leading-5" role="status">
                  <strong>Tình trạng giá đã lưu:</strong> {productPriceBlockers(product, supplier).length === 0 ? "Sản phẩm và doanh nghiệp đã cho phép chia sẻ giá." : "Buyer vẫn thấy On request."}
                  <ul className="mt-1 list-disc pl-5">{productPriceBlockers(product, supplier).map((reason) => <li key={reason}>{reason}</li>)}
                    {(review !== "approved" || !product.ready_for_buyer || supplier.status !== "published") && <li>Sản phẩm chưa đủ điều kiện công khai hoặc hồ sơ doanh nghiệp chưa được xuất bản.</li>}
                  </ul>
                  {dirty && <p className="mt-1 font-semibold text-amber-800">Thay đổi ở form chưa lưu; dòng trên là tình trạng trước khi lưu.</p>}
                </div>}
                <p className="mt-2 text-[11.5px] leading-5">
                  Giá cần lớn hơn 0 và còn hạn; sản phẩm cần có ảnh/catalogue, danh mục và hồ sơ doanh nghiệp đã được duyệt - nếu chưa, buyer sẽ thấy <em>On request</em>.
                  {supplierPriceConsentCurrent(supplier) ? " Xác nhận chia sẻ giá đang còn hiệu lực." : ""}
                </p>
                {!supplierPriceConsentCurrent(supplier) && <div className="mt-2.5 rounded-md bg-white p-2.5 ring-1 ring-brand-200">
                  <label className="flex items-start gap-2 text-[11.5px] font-medium text-brand-900">
                    <input type="checkbox" name="confirm_supplier_price_consent" value="yes" disabled={locked} className="mt-0.5 size-4 shrink-0 accent-brand-700" />
                    <span>Tôi đồng ý chia sẻ giá tham khảo của những sản phẩm tôi chọn công khai.</span>
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
              <SectionHead title="Đặt hàng & năng lực" />
              <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-2">
                {BASE_FIELDS.map(([key, label, placeholder, max]) => <Field key={key} label={label}>
                  <input className="input" name={key} maxLength={max} placeholder={placeholder} defaultValue={String(product?.[key] ?? "")} disabled={locked} />
                </Field>)}
              </div>
            </div>

            {stepError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-900">{stepError}</p>}
          </section>
        </form>

        <section data-step-panel={2} className={step === 2 ? "space-y-3" : "hidden"} aria-label="Bước 2: Ảnh và catalogue" id="product-media">
          <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
            <SectionHead step="Bước 2" title="Ảnh và catalogue"
              hint={live
                ? "JPG, PNG, WebP tối đa 8 MB hoặc PDF tối đa 15 MB. Tệp tải lên sẽ hiển thị với buyer trên sản phẩm đã đăng."
                : review === "approved"
                  ? "JPG, PNG, WebP tối đa 8 MB hoặc PDF tối đa 15 MB. Tệp tải lên ở chế độ nội bộ khi chờ đăng."
                  : "JPG, PNG, WebP tối đa 8 MB hoặc PDF tối đa 15 MB. Tệp được kiểm tra khi duyệt."} />
            <div className="space-y-4 px-4 py-4 sm:px-5">
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
                    ? "Ảnh này hiện đầu tiên với buyer. Kéo ảnh khác vào ô này (hoặc bấm nút sao) để thay; bạn cũng có thể xóa ảnh do mình tải."
                    : "Ảnh này hiện đầu tiên với buyer."}</p>
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
                          {asset.audience === "buyer" ? "Chia sẻ buyer" : "Nội bộ"}
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
                  : dirty ? "Có thay đổi ở bước 1 chưa lưu. Quay lại bước 1 bấm Lưu, rồi chuyển sang bước 2 để quản lý tệp."
                  : legacyManaged ? "Sản phẩm này được quản lý từ trước nên tài khoản chưa tự sửa được tệp. Liên hệ bộ phận hỗ trợ nếu cần bổ sung ảnh hoặc catalogue."
                  : locked ? "Sản phẩm đang chờ duyệt nên tạm khoá tải tệp - nội dung đang duyệt không thay đổi giữa chừng. Khi được duyệt hoặc bị trả về, bạn tải thêm được ngay."
                  : "Sản phẩm này được quản lý từ trước nên tài khoản chưa tự sửa được tệp. Liên hệ bộ phận hỗ trợ nếu cần bổ sung ảnh hoặc catalogue."}
              </div>}
              {progress && <p role="status" className="text-[12.5px] font-semibold text-brand-800">{progress}</p>}
            </div>
          </div>
        </section>

        <section data-step-panel={3} className={step === 3 ? "space-y-3" : "hidden"} aria-label="Bước 3: Xem lại và gửi" id="product-review">
          <div className="rounded-xl border border-ink-200 bg-white shadow-sm">
            <SectionHead step="Bước 3" title="Xem lại toàn bộ hồ sơ"
              hint="Đọc lại đúng nội dung ở bước 1 và 2. Sửa được ngay tại đây, gửi xong hồ sơ mới chuyển sang bước duyệt." />
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
                    <dt className="text-[11px] font-semibold text-ink-500">Grade &amp; giá ({unitMeta.unitLabel})</dt>
                    <dd className="mt-1 overflow-x-auto rounded-lg border border-ink-200">
                      <table className="min-w-full border-collapse text-left text-[12px]">
                        <thead className="bg-ink-50 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">
                          <tr>
                            <th className="px-2.5 py-1.5">Grade</th>
                            <th className="px-2.5 py-1.5">{unitMeta.headerLabel}</th>
                            <th className="px-2.5 py-1.5">Incoterm</th>
                            <th className="px-2.5 py-1.5">MOQ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100 bg-white">
                          {gradeRows.map((row) => {
                            const isCustom = row.selectedGrade === CUSTOM_GRADE_OPTION;
                            const gradeLabel = (isCustom ? row.customGrade : row.selectedGrade).trim() || "Chưa chọn";
                            const minNum = row.priceMin.trim() ? Number(row.priceMin.trim()) : null;
                            const maxNum = row.priceMax.trim() ? Number(row.priceMax.trim()) : null;
                            const hasValidPrice = minNum !== null && maxNum !== null && Number.isFinite(minNum) && Number.isFinite(maxNum) && minNum > 0 && maxNum >= minNum;
                            const priceDisplay = hasValidPrice ? formatGradeRowPriceVi(minNum, maxNum, unitMeta.unitLabel) : "Báo giá theo yêu cầu";
                            return (
                              <tr key={row.id}>
                                <td className="px-2.5 py-1.5 font-semibold text-ink-900">
                                  {gradeLabel}
                                  {isCustom && row.customGrade.trim() ? <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">Tự nhập</span> : null}
                                </td>
                                <td className={`px-2.5 py-1.5 font-semibold text-ink-800 ${hasValidPrice ? "font-mono tabular-nums" : "text-ink-500"}`}>{priceDisplay}</td>
                                <td className="px-2.5 py-1.5 text-ink-800">{row.incoterm || "-"}</td>
                                <td className="px-2.5 py-1.5 text-ink-800">{row.moq.trim() || "Chưa nhập"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
                            {asset.audience === "buyer" ? "Buyer" : "Nội bộ"}
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
              <p className="text-[11.5px] leading-5 text-ink-500">{product?.name_i18n?.en?.trim() ? "Bản tiếng Anh cho trang buyer đã có." : "Bản tiếng Anh cho trang buyer được dịch tự động bằng AI khi duyệt."} Bạn cứ nhập bằng tiếng Việt.</p>
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
                : review === "pending" ? "Đang chờ duyệt" : "Xem lại rồi gửi duyệt"}
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
            <h2 className="mt-0.5 line-clamp-2 text-[13.5px] font-black text-ink-900">{product?.name ?? "Sản phẩm mới"}</h2>
            <dl className="mt-2.5 space-y-1 border-t border-ink-100 pt-2.5 text-[11.5px]">
              {commercial.map((row) => <div key={row.label} className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-ink-500">{row.label}</dt>
                <dd className={`min-w-0 truncate text-right font-semibold text-ink-800 ${row.label === "Giá tham khảo" && row.value !== "-" ? "font-mono tabular-nums" : ""}`}>{row.value}</dd>
              </div>)}
            </dl>
            <p className="mt-2 text-[10.5px] leading-4 text-ink-500">Số liệu lấy từ bản đã lưu{dirty ? "; thay đổi đang nhập chưa hiển thị ở đây." : "."}</p>
          </div>
        </div>

        {product && (canDeleteDraft || review === "approved") && <section aria-label="Quản lý sản phẩm" className="rounded-xl border border-ink-200 bg-white p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Quản lý sản phẩm</p>
          {canDeleteDraft ? <>
            <p className="mt-2 text-[11.5px] leading-5 text-ink-600">Xóa vĩnh viễn bản nháp chưa duyệt và tệp của sản phẩm. Không thể hoàn tác.</p>
            <button type="button" disabled={busy || dirty} onClick={() => void deleteDraft()} className="btn btn-ghost btn-sm mt-2 text-rose-700 disabled:opacity-50">
              <Trash2 className="size-3.5" aria-hidden="true" /> Xóa bản nháp
            </button>
          </> : <>
            <p className="mt-2 text-[11.5px] leading-5 text-ink-600">Ẩn khỏi buyer, giữ lịch sử. Muốn đăng lại cần gửi duyệt.</p>
            <button type="button" disabled={busy || dirty} onClick={() => void pauseProduct()} className="btn btn-ghost btn-sm mt-2 text-ink-700 disabled:opacity-50">
              <EyeOff className="size-3.5" aria-hidden="true" /> Tạm ẩn sản phẩm
            </button>
          </>}
          {dirty && <p className="mt-2 text-[11px] text-amber-800">Lưu hoặc bỏ thay đổi chưa lưu trước khi tiếp tục.</p>}
        </section>}

        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-3.5">
          <p className="text-[11px] font-bold tracking-wider text-ink-500 uppercase">Luồng duyệt</p>
          <ol className="mt-2 space-y-1.5 text-[11.5px] leading-4 text-ink-600">
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">1.</span>Bạn lưu thông tin và tải tệp thật.</li>
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">2.</span>Gửi duyệt nội dung.</li>
            <li className="flex gap-1.5"><span className="font-bold text-brand-700">3.</span>Chọn tệp chia sẻ buyer và bật sẵn sàng.</li>
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
function SectionHead({ step, title, hint }: { step?: string; title: string; hint?: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-1 border-b border-ink-100 px-4 py-3 sm:px-5">
    <div className="min-w-0">
      {step && <p className="text-[10px] font-bold tracking-[0.14em] text-brand-700 uppercase">{step}</p>}
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
