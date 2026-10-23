import {
  L2_FACTORY_PHOTO_ITEMS,
  L3_EXPORT_ITEMS,
  type MediaAsset,
  type SupplierSubmission,
  type SupplierSubmissionItem,
  type SupplierVerificationRequest,
  type Verification,
} from "@/lib/types";
import { INITIAL_DOCUMENT_KEYS } from "./policy";

/**
 * Tiến độ xác minh nhìn từ phía NHÀ CUNG CẤP.
 *
 * Trang tổng quan và “Trang của tôi” cùng dùng một mô hình để hai nơi không thể nói
 * khác nhau. Mỗi bước là một kết luận độc lập của Vexim; ở đây chỉ mô tả đúng những gì
 * hệ thống đã có:
 *  - `approved`     : đã có đợt kiểm được duyệt (huy hiệu chỉ đến từ bước này);
 *  - `reviewing`    : NCC đã nộp và Vexim đang xét, hoặc đã nhận vào đợt kiểm;
 *  - `action`       : đang chờ NCC làm một việc cụ thể (tải giấy tờ/ảnh/chứng từ);
 *  - `not_started`  : chưa có dữ liệu nào.
 *
 * Không suy ra “đã xác minh” từ việc tải tệp, từ hồ sơ tự gửi hay từ yêu cầu kiểm định.
 */

export type VerificationState = "approved" | "reviewing" | "action" | "not_started";
export type VerificationTone = "emerald" | "amber" | "rose" | "ink";

export interface VerificationProgressStep {
  level: 1 | 2 | 3;
  title: string;
  titleEn: string;
  description: string;
  state: VerificationState;
  /** Nhãn trạng thái ngắn, tiếng Việt. */
  status: string;
  /** Nhãn trạng thái ngắn, tiếng Anh (dùng cho bản xem trước trang buyer). */
  statusEn: string;
  /** Việc NCC nên làm tiếp, hoặc lý do đang chờ. */
  note: string;
  /** Câu đếm ngắn: “Đã tải 3/9 ảnh”. */
  metric: string;
  metricEn: string;
  href: string;
  action: string;
  actionEn: string;
  tone: VerificationTone;
}

export interface VerificationProgress {
  steps: VerificationProgressStep[];
  approvedCount: number;
  /** Cấp đầu tiên chưa được duyệt, theo thứ tự 1 → 2 → 3. */
  currentLevel: 1 | 2 | 3 | null;
  /** 0–100, tính theo số bước đã duyệt trên 3. */
  percent: number;
  /** Một câu tóm tắt việc tiếp theo. */
  headline: string;
}

export interface VerificationProgressInput {
  supplierId: string;
  reviews: Verification[];
  submissions?: SupplierSubmission[];
  /** Bằng chứng đã tải của từng hồ sơ tự gửi, theo `submission.id`. */
  submissionItems?: Record<string, SupplierSubmissionItem[]>;
  requests?: SupplierVerificationRequest[];
  /** Tệp gắn với đợt kiểm giấy tờ L1 (owner_type = "verification"). */
  documents?: MediaAsset[];
  /** Chỉ đếm tệp do chính tài khoản NCC này tải lên. */
  userId?: string | null;
}

const STEP_COPY = {
  1: {
    title: "Kiểm tra giấy tờ",
    titleEn: "Documents check",
    description: "Đối chiếu giấy phép, chứng nhận và bằng chứng đính kèm.",
    href: "/supplier/portal/documents",
  },
  2: {
    title: "Thăm nhà máy",
    titleEn: "Factory visit",
    description: "Chín ảnh nhà máy theo danh mục chung, kèm tờ mã xác minh ở 3 ảnh đánh dấu 🔖.",
    href: "/supplier/portal/verification/factory",
  },
  3: {
    title: "Lịch sử giao hàng",
    titleEn: "Delivery history",
    description: "Một lô hàng đã xuất thật: vận đơn, tờ khai và link nguồn công khai.",
    href: "/supplier/portal/verification/export",
  },
} as const;

const STATUS_EN: Record<VerificationState, string> = {
  approved: "Approved",
  reviewing: "Vexim is reviewing",
  action: "Action needed",
  not_started: "Not started",
};

const L2_TOTAL = L2_FACTORY_PHOTO_ITEMS.length;
const L3_REQUIRED = L3_EXPORT_ITEMS.filter((item) => item.required);
const L3_TOTAL = L3_REQUIRED.length;

const isInitialDocKey = (key: string | null | undefined): boolean =>
  !!key && (INITIAL_DOCUMENT_KEYS as readonly string[]).includes(key);

/** Đợt kiểm mới nhất của một cấp; ưu tiên bản đã duyệt khi có nhiều đợt. */
function latestReview(reviews: Verification[], supplierId: string, level: 1 | 2 | 3) {
  const mine = reviews
    .filter((v) => v.supplier_id === supplierId && v.target_level === level)
    .sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""));
  return mine.find((v) => v.status === "approved") ?? mine[0] ?? null;
}

function latestSubmission(submissions: SupplierSubmission[], supplierId: string, level: 2 | 3) {
  return submissions
    .filter((s) => s.supplier_id === supplierId && s.target_level === level)
    .sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""))[0] ?? null;
}

function countUploaded(items: SupplierSubmissionItem[] | undefined, keys: readonly string[]) {
  const have = new Set((items ?? [])
    .filter((item) => !!item.media_id || !!item.storage_path)
    .map((item) => item.checklist_key as string));
  return keys.filter((key) => have.has(key)).length;
}

/** Ngày duyệt dạng dd/mm/yyyy, không phụ thuộc locale của máy chủ. */
function shortDate(value: string | null | undefined): string | null {
  const [year, month, day] = (value ?? "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : null;
}

export function buildVerificationProgress(input: VerificationProgressInput): VerificationProgress {
  const submissions = input.submissions ?? [];
  const requests = input.requests ?? [];
  const items = input.submissionItems ?? {};

  /* ------------------------------- Bước 1: giấy tờ ------------------------------- */
  const l1 = latestReview(input.reviews, input.supplierId, 1);
  const docs = (input.documents ?? []).filter((m) =>
    !!m.storage_path && isInitialDocKey(m.checklist_key) && (!input.userId || m.created_by === input.userId));
  const docCount = new Set(docs.map((m) => m.checklist_key)).size;
  const l1Approved = input.reviews.some((v) => v.supplier_id === input.supplierId && v.target_level === 1 && v.status === "approved");

  const step1: VerificationProgressStep = {
    level: 1,
    ...STEP_COPY[1],
    state: "not_started",
    status: "Chưa bắt đầu",
    statusEn: STATUS_EN.not_started,
    note: "Tải giấy phép kinh doanh hoặc một trong các chứng nhận ATTP / HACCP / ISO / BRC. Chỉ cần một giấy xác minh chính.",
    metric: docCount ? `Đã tải ${docCount} giấy tờ` : "Chưa có giấy tờ",
    metricEn: docCount ? `${docCount} document${docCount === 1 ? "" : "s"} uploaded` : "No documents yet",
    action: "Bắt đầu bước 1",
    actionEn: "Start step 1",
    tone: "ink",
  };

  if (l1Approved) {
    const approvedOn = shortDate(l1?.approved_at);
    Object.assign(step1, {
      state: "approved", status: "Đã duyệt", statusEn: STATUS_EN.approved,
      note: "Vexim đã đối chiếu giấy tờ của bạn. Không cần làm gì thêm ở bước này.",
      metric: approvedOn ? `Duyệt ngày ${approvedOn}` : "Vexim đã duyệt hồ sơ",
      metricEn: approvedOn ? `Approved ${approvedOn}` : "Approved by Vexim",
      action: "Xem giấy tờ", actionEn: "View documents", tone: "emerald",
    } satisfies Partial<VerificationProgressStep>);
  } else if (l1?.status === "returned") {
    Object.assign(step1, {
      state: "action", status: "Cần bổ sung", statusEn: STATUS_EN.action, tone: "rose",
      note: l1.return_reason ? `Vexim yêu cầu bổ sung: ${l1.return_reason}` : "Vexim yêu cầu bổ sung giấy tờ. Mở trang Giấy tờ để tải lại bản đúng.",
      action: "Bổ sung giấy tờ", actionEn: "Upload documents",
    } satisfies Partial<VerificationProgressStep>);
  } else if (l1?.status === "submitted") {
    Object.assign(step1, {
      state: "reviewing", status: "Chờ Vexim duyệt", statusEn: STATUS_EN.reviewing, tone: "amber",
      note: "Bạn đã nộp giấy tờ. Vexim đang đối chiếu thủ công; tải lên không tự duyệt.",
      action: "Xem giấy tờ", actionEn: "View documents",
    } satisfies Partial<VerificationProgressStep>);
  } else if (l1 || docCount > 0) {
    Object.assign(step1, {
      state: "action", status: "Đang hoàn thiện", statusEn: STATUS_EN.action, tone: "amber",
      action: "Tải giấy tờ", actionEn: "Upload documents",
    } satisfies Partial<VerificationProgressStep>);
  }

  /* ------------------------------ Bước 2: nhà máy ------------------------------ */
  const l2 = latestReview(input.reviews, input.supplierId, 2);
  const sub2 = latestSubmission(submissions, input.supplierId, 2);
  const done2 = countUploaded(sub2 ? items[sub2.id] : undefined, L2_FACTORY_PHOTO_ITEMS.map((item) => item.key));
  const request2 = requests.find((r) => r.supplier_id === input.supplierId && r.target_level === 2) ?? null;

  const step2: VerificationProgressStep = {
    level: 2,
    ...STEP_COPY[2],
    state: "not_started",
    status: "Chưa bắt đầu",
    statusEn: STATUS_EN.not_started,
    note: "Tự chụp 9 ảnh theo danh mục. Ảnh điện thoại, kể cả ảnh đã gửi qua Zalo, đều nhận.",
    metric: `Đã tải ${done2}/${L2_TOTAL} ảnh`,
    metricEn: `${done2}/${L2_TOTAL} photos uploaded`,
    action: "Bắt đầu bước 2",
    actionEn: "Start step 2",
    tone: "ink",
  };

  const l2Note = "Ba ảnh 🔖 (cổng, dây chuyền, kho thành phẩm) phải có tờ mã xác minh do Vexim phát hành nằm trong khung hình.";
  if (l2?.status === "approved") {
    const approvedOn = shortDate(l2.approved_at);
    Object.assign(step2, {
      state: "approved", status: "Đã duyệt", statusEn: STATUS_EN.approved, tone: "emerald",
      note: "Vexim đã hoàn tất đợt thăm nhà máy và duyệt kết quả.",
      metric: approvedOn ? `Duyệt ngày ${approvedOn}` : "Duyệt theo đợt kiểm của Vexim",
      metricEn: approvedOn ? `Approved ${approvedOn}` : "Approved in a Vexim review",
      action: "Xem bằng chứng", actionEn: "View evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2?.status === "pending_review") {
    Object.assign(step2, {
      state: "reviewing", status: "Chờ Vexim xét", statusEn: STATUS_EN.reviewing, tone: "amber",
      note: "Hồ sơ 9 ảnh đã nộp và đang trong hàng đợi. Bằng chứng tạm khóa; AI chỉ quét sơ bộ, nhân viên Vexim vẫn đối chiếu.",
      action: "Xem hồ sơ đã nộp", actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2?.status === "returned") {
    Object.assign(step2, {
      state: "action", status: "Cần bổ sung", statusEn: STATUS_EN.action, tone: "rose",
      note: sub2.review_note || "Vexim yêu cầu bổ sung ảnh nhà máy. Mở cổng xác thực để xem lý do.",
      action: "Bổ sung ảnh", actionEn: "Add factory photos",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2?.status === "accepted") {
    Object.assign(step2, {
      state: "reviewing", status: "Đã vào đợt kiểm", statusEn: STATUS_EN.reviewing, tone: "amber",
      note: "Vexim đã nhận hồ sơ vào đợt kiểm và sẽ đối chiếu tại nhà máy. Đây chưa phải kết quả duyệt.",
      action: "Xem hồ sơ", actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2) {
    Object.assign(step2, {
      state: "action", status: "Đang hoàn thiện", statusEn: STATUS_EN.action, tone: "amber",
      note: done2 < L2_TOTAL
        ? `Còn ${L2_TOTAL - done2} ảnh bắt buộc. ${l2Note}`
        : `Đã đủ ${L2_TOTAL} ảnh. Mở cổng xác thực để kiểm tra lần cuối và bấm nộp hồ sơ.`,
      action: done2 < L2_TOTAL ? "Tải ảnh nhà máy" : "Nộp hồ sơ 9 ảnh",
      actionEn: done2 < L2_TOTAL ? "Add factory photos" : "Submit 9 photos",
    } satisfies Partial<VerificationProgressStep>);
  } else if (request2?.status === "contacted") {
    Object.assign(step2, {
      state: "action", status: "Vexim đã liên hệ", statusEn: STATUS_EN.action, tone: "amber",
      note: "Vexim đã ghi nhận yêu cầu thăm nhà máy và sẽ liên hệ lên kế hoạch. Bạn có thể tự nộp 9 ảnh ngay để rút ngắn thời gian.",
      action: "Nộp 9 ảnh nhà máy", actionEn: "Add factory photos",
    } satisfies Partial<VerificationProgressStep>);
  } else if (request2) {
    Object.assign(step2, {
      state: "action", status: "Đã gửi yêu cầu", statusEn: STATUS_EN.action, tone: "amber",
      note: "Yêu cầu thăm nhà máy đã gửi. Trong lúc chờ, bạn có thể tự nộp 9 ảnh để Vexim đối chiếu song song.",
      action: "Nộp 9 ảnh nhà máy", actionEn: "Add factory photos",
    } satisfies Partial<VerificationProgressStep>);
  }

  /* --------------------------- Bước 3: lịch sử giao hàng --------------------------- */
  const l3 = latestReview(input.reviews, input.supplierId, 3);
  const sub3 = latestSubmission(submissions, input.supplierId, 3);
  const done3 = countUploaded(sub3 ? items[sub3.id] : undefined, L3_REQUIRED.map((item) => item.key));
  const request3 = requests.find((r) => r.supplier_id === input.supplierId && r.target_level === 3) ?? null;

  const step3: VerificationProgressStep = {
    level: 3,
    ...STEP_COPY[3],
    state: "not_started",
    status: "Chưa bắt đầu",
    statusEn: STATUS_EN.not_started,
    note: "Tải vận đơn và tờ khai của một lô đã xuất thật. RFQ trúng thầu không đủ làm bằng chứng giao hàng.",
    metric: `Đã nộp ${done3}/${L3_TOTAL} chứng từ bắt buộc`,
    metricEn: `${done3}/${L3_TOTAL} required shipping documents`,
    action: "Bắt đầu bước 3",
    actionEn: "Start step 3",
    tone: "ink",
  };

  const l3Note = "Che số tài khoản ngân hàng, giá mua bán và thông tin buyer nếu bạn không muốn chia sẻ.";
  if (l3?.status === "approved") {
    const approvedOn = shortDate(l3.approved_at);
    Object.assign(step3, {
      state: "approved", status: "Đã duyệt", statusEn: STATUS_EN.approved, tone: "emerald",
      note: "Vexim đã duyệt đợt kiểm lịch sử giao hàng của một lô hàng cụ thể.",
      metric: approvedOn ? `Duyệt ngày ${approvedOn}` : "Duyệt theo đợt kiểm của Vexim",
      metricEn: approvedOn ? `Approved ${approvedOn}` : "Approved in a Vexim review",
      action: "Xem bằng chứng", actionEn: "View evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3?.status === "pending_review") {
    Object.assign(step3, {
      state: "reviewing", status: "Chờ Vexim xét", statusEn: STATUS_EN.reviewing, tone: "amber",
      note: "Chứng từ đã nộp và đang chờ Vexim đối chiếu. Bằng chứng tạm khóa trong lúc xét.",
      action: "Xem hồ sơ đã nộp", actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3?.status === "returned") {
    Object.assign(step3, {
      state: "action", status: "Cần bổ sung", statusEn: STATUS_EN.action, tone: "rose",
      note: sub3.review_note || "Vexim yêu cầu bổ sung chứng từ giao hàng. Mở cổng xác thực để xem lý do.",
      action: "Bổ sung chứng từ", actionEn: "Add shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3?.status === "accepted") {
    Object.assign(step3, {
      state: "reviewing", status: "Đã vào đợt kiểm", statusEn: STATUS_EN.reviewing, tone: "amber",
      note: "Vexim đã nhận chứng từ vào đợt kiểm. Nhân viên Vexim sẽ đối chiếu với lô hàng đã giao.",
      action: "Xem hồ sơ", actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3) {
    Object.assign(step3, {
      state: "action", status: "Đang hoàn thiện", statusEn: STATUS_EN.action, tone: "amber",
      note: done3 < L3_TOTAL
        ? `Còn ${L3_TOTAL - done3} chứng từ bắt buộc (vận đơn, tờ khai hải quan). ${l3Note}`
        : "Đã đủ chứng từ bắt buộc. Mở cổng để kiểm tra link nguồn và bấm nộp hồ sơ.",
      action: done3 < L3_TOTAL ? "Tải chứng từ" : "Nộp hồ sơ chứng từ",
      actionEn: done3 < L3_TOTAL ? "Add shipping evidence" : "Submit shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (request3?.status === "contacted") {
    Object.assign(step3, {
      state: "action", status: "Vexim đã liên hệ", statusEn: STATUS_EN.action, tone: "amber",
      note: "Vexim đã ghi nhận yêu cầu đối chiếu lịch sử giao hàng và sẽ liên hệ lên kế hoạch. Bạn vẫn có thể tự nộp chứng từ.",
      action: "Nộp chứng từ", actionEn: "Add shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (request3) {
    Object.assign(step3, {
      state: "action", status: "Đã gửi yêu cầu", statusEn: STATUS_EN.action, tone: "amber",
      note: "Yêu cầu đối chiếu lịch sử giao hàng đã gửi. Bạn có thể tự nộp chứng từ để Vexim xét song song.",
      action: "Nộp chứng từ", actionEn: "Add shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  }

  const steps = [step1, step2, step3];
  const approvedCount = steps.filter((step) => step.state === "approved").length;
  const current = steps.find((step) => step.state !== "approved") ?? null;
  const percent = Math.round((approvedCount / steps.length) * 100);

  const headline = !current
    ? "Đủ ba bước xác minh. Hồ sơ của bạn đang ở trạng thái đầy đủ nhất."
    : current.state === "reviewing"
      ? `Bước ${current.level} · ${current.title} đang chờ Vexim xét. Không cần nộp lại; kết quả sẽ hiện ngay tại đây.`
      : current.state === "action"
        ? `Bước ${current.level} · ${current.title} đang chờ bạn xử lý.`
        : `Bước tiếp theo: ${current.title}.`;

  return { steps, approvedCount, currentLevel: current?.level ?? null, percent, headline };
}
