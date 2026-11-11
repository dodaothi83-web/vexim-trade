import {
  L2_FACTORY_PHOTO_ITEMS,
  L3_EXPORT_ITEMS,
  type MediaAsset,
  type SupplierType,
  type SupplierSubmission,
  type SupplierSubmissionItem,
  type SupplierVerificationRequest,
  type Verification,
  displayLevel,
} from "@/lib/types";
import { effectiveL2Scope, l2ScopeForSupplier } from "@/lib/l2-scope";
import { COMPANY_DOCUMENT_KEYS } from "./policy";

/**
 * Tiến độ xác minh nhìn từ phía NHÀ CUNG CẤP.
 *
 * Trang tổng quan và “Trang của tôi” cùng dùng một mô hình để hai nơi không thể nói
 * khác nhau. Mỗi bước là một kết luận độc lập; ở đây chỉ mô tả đúng những gì
 * hệ thống đã có:
 *  - `approved`     : đã có đợt kiểm được duyệt (huy hiệu chỉ đến từ bước này);
 *  - `reviewing`    : NCC đã nộp và hồ sơ đang được xét, hoặc đã nhận vào đợt kiểm;
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
  /** 0-100, tính theo số bước đã duyệt trên 3. */
  percent: number;
  /** Một câu tóm tắt việc tiếp theo. */
  headline: string;
}

export interface VerificationProgressInput {
  supplierId: string;
  supplierType?: SupplierType | null;
  reviews: Verification[];
  submissions?: SupplierSubmission[];
  /** Bằng chứng đã tải của từng hồ sơ tự gửi, theo `submission.id`. */
  submissionItems?: Record<string, SupplierSubmissionItem[]>;
  requests?: SupplierVerificationRequest[];
  /** Tệp gắn với đợt kiểm giấy tờ L1 (owner_type = "verification"). */
  documents?: MediaAsset[];
  /** Chỉ đếm tệp do chính tài khoản NCC này tải lên. */
  userId?: string | null;
  /**
   * Ngôn ngữ của các câu hiển thị. Mặc định tiếng Việt để các trang chưa chuyển (giai đoạn
   * 2) giữ nguyên; trang đã chuyển truyền `"en"`. Các trường `*En` vẫn luôn có, vì bản xem
   * trước trang buyer dùng chúng.
   */
  locale?: "vi" | "en";
}

const STEP_COPY = {
  1: {
    title: "Kiểm tra giấy tờ",
    titleEn: "Documents check",
    description: "Đối chiếu giấy phép, chứng nhận và bằng chứng đính kèm.",
    descriptionEn: "We match your licences, certificates and attachments against each other.",
    href: "/supplier/portal/documents",
  },
  2: {
    title: "Lịch sử xuất khẩu",
    titleEn: "Export history",
    description: "Chứng từ phù hợp của một lô hàng đã xuất, được đối chiếu thủ công.",
    descriptionEn: "Matching documents for one shipped batch, checked by hand.",
    href: "/supplier/portal/verification/export",
  },
  3: {
    title: "Kiểm tra nhà máy",
    titleEn: "Factory verification",
    description: "Đặt lịch gọi video để cùng xem nhà máy.",
    descriptionEn: "Book a video call so we can see your factory with you.",
    href: "/supplier/portal/verification/factory",
  },
} as const;

const STATUS_EN: Record<VerificationState, string> = {
  approved: "Approved",
  reviewing: "Under review",
  action: "Action needed",
  not_started: "Not started",
};

const L2_TOTAL = L2_FACTORY_PHOTO_ITEMS.length;
const L3_KEYS = L3_EXPORT_ITEMS.map((item) => item.key);

const isCompanyDocumentKey = (key: string | null | undefined): boolean =>
  !!key && (COMPANY_DOCUMENT_KEYS as readonly string[]).includes(key);

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
  /** Chọn câu theo ngôn ngữ; cả hai bản nằm cạnh nhau để sửa một chỗ là sửa cả hai. */
  const pick = (vi: string, en: string) => (input.locale === "en" ? en : vi);
  const submissions = input.submissions ?? [];
  const requests = input.requests ?? [];
  const items = input.submissionItems ?? {};

  /* ------------------------------- Bước 1: giấy tờ ------------------------------- */
  const l1 = latestReview(input.reviews, input.supplierId, 1);
  const docs = (input.documents ?? []).filter((m) =>
    !!m.storage_path && isCompanyDocumentKey(m.checklist_key) && (!input.userId || m.created_by === input.userId));
  const hasBusinessLicense = docs.length > 0;
  const l1Approved = input.reviews.some((v) => v.supplier_id === input.supplierId && v.target_level === 1 && v.status === "approved");

  const step1: VerificationProgressStep = {
    level: 1,
    ...STEP_COPY[1],
    title: pick(STEP_COPY[1].title, STEP_COPY[1].titleEn),
    description: pick(STEP_COPY[1].description, STEP_COPY[1].descriptionEn),
    state: "not_started",
    status: pick("Chưa bắt đầu", STATUS_EN.not_started),
    statusEn: STATUS_EN.not_started,
    note: pick(
      "Tải GCN đăng ký kinh doanh. Chứng nhận chất lượng được xét riêng và không thay thế giấy này.",
      "Upload the business registration certificate. Quality certificates are checked separately and do not replace it.",
    ),
    metric: hasBusinessLicense ? pick("Đã tải GCN ĐKKD", "Business registration uploaded") : pick("Chưa có GCN ĐKKD", "No business registration yet"),
    metricEn: hasBusinessLicense ? "Business registration uploaded" : "No business registration yet",
    action: pick("Bắt đầu bước 1", "Start step 1"),
    actionEn: "Start step 1",
    tone: "ink",
  };

  if (l1Approved) {
    const approvedOn = shortDate(l1?.approved_at);
    Object.assign(step1, {
      state: "approved", status: pick("Đã duyệt", STATUS_EN.approved), statusEn: STATUS_EN.approved,
      note: pick("Đã hoàn tất.", "Completed."),
      metric: approvedOn ? pick(`Duyệt ngày ${approvedOn}`, `Approved ${approvedOn}`) : pick("Hồ sơ đã được duyệt", "Approved after review"),
      metricEn: approvedOn ? `Approved ${approvedOn}` : "Approved",
      action: pick("Xem giấy tờ", "View documents"), actionEn: "View documents", tone: "emerald",
    } satisfies Partial<VerificationProgressStep>);
  } else if (l1?.status === "returned") {
    Object.assign(step1, {
      state: "action", status: pick("Cần bổ sung", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "rose",
      note: l1.return_reason
        ? pick(`Cần bổ sung: ${l1.return_reason}`, `Needs more: ${l1.return_reason}`)
        : pick("Giấy tờ cần bổ sung. Mở trang Giấy tờ để tải lại bản đúng.", "The documents need more information. Open the Documents page and upload the correct copy."),
      action: pick("Bổ sung giấy tờ", "Upload documents"), actionEn: "Upload documents",
    } satisfies Partial<VerificationProgressStep>);
  } else if (l1?.status === "submitted") {
    Object.assign(step1, {
      state: "reviewing", status: pick("Chờ duyệt", STATUS_EN.reviewing), statusEn: STATUS_EN.reviewing, tone: "amber",
      note: pick(
        "Giấy tờ đang được đối chiếu.",
        "Your documents are being checked.",
      ),
      action: pick("Xem giấy tờ", "View documents"), actionEn: "View documents",
    } satisfies Partial<VerificationProgressStep>);
  } else if (l1 || hasBusinessLicense) {
    Object.assign(step1, {
      state: "action", status: pick("Đang hoàn thiện", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "amber",
      action: pick("Tải giấy tờ", "Upload documents"), actionEn: "Upload documents",
    } satisfies Partial<VerificationProgressStep>);
  }

  /* ------------------- Mã level 2: nhà máy (hiển thị bước 3) ------------------- */
  // The profile may have changed since an older review. Match the saved scope,
  // never present an old factory approval as an approved partner contract.
  const scope = "supplierType" in input ? l2ScopeForSupplier(input.supplierType) : "factory";
  const partner = scope === "partner_contract";
  const l2 = latestReview(input.reviews.filter((v) => v.target_level !== 2 || (scope !== null && effectiveL2Scope(v.l2_scope) === scope)), input.supplierId, 2);
  const sub2 = latestSubmission(submissions.filter((s) => s.target_level !== 2 || (scope !== null && effectiveL2Scope(s.l2_scope) === scope)), input.supplierId, 2);
  const done2 = countUploaded(sub2 ? items[sub2.id] : undefined, partner ? ["partner_factory_contract"] : L2_FACTORY_PHOTO_ITEMS.map((item) => item.key));
  const request2 = requests.find((r) => r.supplier_id === input.supplierId && r.target_level === 2) ?? null;

  const step2: VerificationProgressStep = {
    level: 2,
    ...STEP_COPY[2],
    title: pick(STEP_COPY[2].title, STEP_COPY[2].titleEn),
    description: pick(STEP_COPY[2].description, STEP_COPY[2].descriptionEn),
    state: "not_started",
    status: pick("Chưa bắt đầu", STATUS_EN.not_started),
    statusEn: STATUS_EN.not_started,
    note: pick(
      "Ảnh chụp bằng điện thoại đều được, kể cả ảnh gửi qua Zalo.",
      "Phone photos are fine, including ones sent over Zalo.",
    ),
    metric: pick(`Đã tải ${done2}/${L2_TOTAL} ảnh`, `${done2}/${L2_TOTAL} photos uploaded`),
    metricEn: `${done2}/${L2_TOTAL} photos uploaded`,
    action: pick("Bắt đầu bước 3", "Start step 3"),
    actionEn: "Start step 3",
    tone: "ink",
  };

  if (partner) Object.assign(step2, {
    title: pick("Nhà máy đối tác", "Partner factory"), titleEn: "Partner contract review",
    description: pick("Đối chiếu hợp đồng với nhà máy đối tác; ảnh là tùy chọn.", "We check your contract with the partner factory; photos are optional."),
    note: pick(
      "Tải hợp đồng với nhà máy đối tác và đặt lịch gọi video. Tải lên không tự duyệt.",
      "Upload the partner factory contract and book a video call. Uploading does not approve it.",
    ),
    metric: done2 ? pick("Đã tải hợp đồng", "Contract uploaded") : pick("Chưa tải hợp đồng", "No contract uploaded"),
    metricEn: done2 ? "Contract uploaded" : "No contract uploaded",
  } satisfies Partial<VerificationProgressStep>);
  if (!scope) Object.assign(step2, {
    title: pick("Xác minh nhà máy (cấp 3)", "Factory verification (level 3)"), titleEn: "Factory verification (level 3)",
    description: pick("Cần cập nhật loại hình nhà cung cấp trước khi mở bước 3.", "The supplier type must be updated before step 3 opens."),
    note: pick(
      "Chưa rõ loại hình nhà cung cấp. Liên hệ hỗ trợ để cập nhật trước khi mở bước 3.",
      "The supplier type is not set yet. Contact us to update it before step 3 opens.",
    ),
    metric: pick("Chưa rõ loại hình", "Supplier type needed"), metricEn: "Supplier type needed",
    action: pick("Xem hướng dẫn", "View guidance"), actionEn: "View guidance",
  } satisfies Partial<VerificationProgressStep>);

  // 11/2026: L2 là lịch hẹn gọi video/thực địa, không còn đếm ảnh.
  void L2_TOTAL; void done2;
  if (l2?.status === "approved") {
    const approvedOn = shortDate(l2.approved_at);
    Object.assign(step2, {
      state: "approved", status: pick("Đã duyệt", STATUS_EN.approved), statusEn: STATUS_EN.approved, tone: "emerald",
      note: partner
        ? pick("Hợp đồng với nhà máy đối tác đã được đối chiếu và duyệt. Kết quả không xác nhận sở hữu nhà máy hay kiểm thực địa.", "The partner factory contract has been checked and approved. The result does not confirm factory ownership or an on-site audit.")
        : pick("Đợt xác thực nhà máy đã hoàn tất và kết quả đã được duyệt.", "The factory verification round is complete and the result has been approved."),
      metric: approvedOn ? pick(`Duyệt ngày ${approvedOn}`, `Approved ${approvedOn}`) : pick("Duyệt theo đợt kiểm", "Approved after review"),
      metricEn: approvedOn ? `Approved ${approvedOn}` : "Approved after review",
      action: pick("Xem bằng chứng", "View evidence"), actionEn: "View evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2?.status === "pending_review") {
    Object.assign(step2, {
      state: "reviewing", status: pick("Chờ duyệt", STATUS_EN.reviewing), statusEn: STATUS_EN.reviewing, tone: "amber",
      note: partner
        ? pick("Đã gửi lịch hẹn và hợp đồng; chúng tôi sẽ liên hệ để chốt giờ.", "Booking and contract sent; we'll contact you to confirm the time.")
        : pick("Đã gửi lịch hẹn; chúng tôi sẽ liên hệ để chốt giờ.", "Booking sent; we'll contact you to confirm the time."),
      action: pick("Xem hồ sơ đã nộp", "View submission"), actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2?.status === "returned") {
    Object.assign(step2, {
      state: "action", status: pick("Cần bổ sung", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "rose",
      note: sub2.review_note || pick("Cần đổi lịch hoặc bổ sung thông tin.", "Please change the time or add details."),
      action: pick("Sửa lịch hẹn", "Update booking"),
      actionEn: "Update booking",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2?.status === "accepted") {
    Object.assign(step2, {
      state: "reviewing", status: pick("Đã vào đợt kiểm", STATUS_EN.reviewing), statusEn: STATUS_EN.reviewing, tone: "amber",
      note: partner
        ? pick("Hồ sơ đã vào đợt kiểm để đối chiếu hợp đồng. Đây chưa phải kết quả duyệt.", "The submission joined a verification round to check the contract. This is not an approval yet.")
        : pick("Đã chốt lịch gọi. Đây chưa phải kết quả duyệt.", "The call is scheduled. This is not an approval yet."),
      action: pick("Xem hồ sơ", "View submission"), actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub2) {
    Object.assign(step2, {
      state: "action", status: pick("Đang hoàn thiện", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "amber",
      note: partner
        ? pick("Tải hợp đồng với nhà máy đối tác và đề xuất giờ gọi video.", "Upload the partner factory contract and suggest a video call time.")
        : pick("Đề xuất giờ gọi video hoặc thực địa rồi gửi lịch hẹn.", "Suggest a video call or visit time, then send the booking."),
      action: pick("Đặt lịch xác minh", "Book verification"),
      actionEn: "Book verification",
    } satisfies Partial<VerificationProgressStep>);
  } else if (scope && request2?.status === "contacted") {
    Object.assign(step2, {
      state: "action", status: pick("Đã ghi nhận liên hệ", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "amber",
      note: partner
        ? pick("Yêu cầu đối chiếu nhà máy đối tác đã được ghi nhận. Bạn có thể tự nộp hợp đồng.", "Your partner factory request has been noted. You can upload the contract yourself.")
        : pick("Chúng tôi sẽ liên hệ để lên kế hoạch. Bạn cũng có thể tự đặt lịch ngay.", "We'll contact you to schedule it. You can also book a call now."),
      action: pick("Đặt lịch xác minh", "Book verification"),
      actionEn: "Book verification",
    } satisfies Partial<VerificationProgressStep>);
  } else if (scope && request2) {
    Object.assign(step2, {
      state: "action", status: pick("Đã gửi yêu cầu", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "amber",
      note: partner
        ? pick("Yêu cầu đối chiếu nhà máy đối tác đã gửi. Bạn có thể tự nộp hợp đồng.", "Your partner factory request has been sent. You can upload the contract yourself.")
        : pick("Yêu cầu xác thực nhà máy đã gửi. Bạn có thể tự đặt lịch gọi để làm nhanh hơn.", "Your factory verification request has been sent. You can book a call yourself to speed it up."),
      action: pick("Đặt lịch xác minh", "Book verification"),
      actionEn: "Book verification",
    } satisfies Partial<VerificationProgressStep>);
  }

  /* -------------- Mã level 3: lịch sử giao hàng (hiển thị bước 2) -------------- */
  const l3 = latestReview(input.reviews, input.supplierId, 3);
  const sub3 = latestSubmission(submissions, input.supplierId, 3);
  const done3 = countUploaded(sub3 ? items[sub3.id] : undefined, L3_KEYS);
  const request3 = requests.find((r) => r.supplier_id === input.supplierId && r.target_level === 3) ?? null;

  const step3: VerificationProgressStep = {
    level: 3,
    ...STEP_COPY[3],
    title: pick(STEP_COPY[3].title, STEP_COPY[3].titleEn),
    description: pick(STEP_COPY[3].description, STEP_COPY[3].descriptionEn),
    state: "not_started",
    status: pick("Chưa bắt đầu", STATUS_EN.not_started),
    statusEn: STATUS_EN.not_started,
    note: pick(
      "Tải chứng từ phù hợp của một lô đã xuất. Không bắt buộc vận đơn; hồ sơ được kiểm tra thủ công.",
      "Upload matching documents for one shipped batch. A bill of lading is not required; we'll check the file.",
    ),
    metric: done3 ? pick(`Đã tải ${done3} loại chứng từ`, `${done3} document types uploaded`) : pick("Chưa tải chứng từ", "No documents uploaded"),
    metricEn: done3 ? `${done3} evidence type${done3 === 1 ? "" : "s"} uploaded` : "No evidence uploaded",
    action: pick("Bắt đầu bước 2", "Start step 2"),
    actionEn: "Start step 2",
    tone: "ink",
  };

  const l3Note = pick(
    "Có thể che thông tin nhạy cảm, nhưng cần giữ đủ dữ kiện để đối chiếu.",
    "You can hide sensitive details, but keep enough data for the check.",
  );
  if (l3?.status === "approved") {
    const approvedOn = shortDate(l3.approved_at);
    Object.assign(step3, {
      state: "approved", status: pick("Đã duyệt", STATUS_EN.approved), statusEn: STATUS_EN.approved, tone: "emerald",
      note: pick("Đợt kiểm lịch sử giao hàng của một lô hàng cụ thể đã được duyệt.", "The delivery-history check for that batch has been approved."),
      metric: approvedOn ? pick(`Duyệt ngày ${approvedOn}`, `Approved ${approvedOn}`) : pick("Duyệt theo đợt kiểm", "Approved after review"),
      metricEn: approvedOn ? `Approved ${approvedOn}` : "Approved after review",
      action: pick("Xem bằng chứng", "View evidence"), actionEn: "View evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3?.status === "pending_review") {
    Object.assign(step3, {
      state: "reviewing", status: pick("Chờ duyệt", STATUS_EN.reviewing), statusEn: STATUS_EN.reviewing, tone: "amber",
      note: pick(
        "Chứng từ đã nộp và đang chờ đối chiếu. Bằng chứng tạm khóa trong lúc xét.",
        "The documents are in and waiting to be checked. Evidence is locked while the check runs.",
      ),
      action: pick("Xem hồ sơ đã nộp", "View submission"), actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3?.status === "returned") {
    Object.assign(step3, {
      state: "action", status: pick("Cần bổ sung", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "rose",
      note: sub3.ai_scanned_at && !sub3.reviewed_by
        ? pick(
            `${sub3.review_note ? `Ghi chú trước đây: ${sub3.review_note} ` : ""}Bạn có thể nộp lại để được kiểm tra.`,
            `${sub3.review_note ? `Previous note: ${sub3.review_note} ` : ""}You can submit again for us to check.`,
          )
        : sub3.review_note || pick("Cần bổ sung chứng từ giao hàng. Mở cổng xác thực để xem lý do.", "The shipping evidence needs more information. Open the verification portal to see why."),
      action: pick("Bổ sung chứng từ", "Add shipping evidence"), actionEn: "Add shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3?.status === "accepted") {
    Object.assign(step3, {
      state: "reviewing", status: pick("Đã vào đợt kiểm", STATUS_EN.reviewing), statusEn: STATUS_EN.reviewing, tone: "amber",
      note: pick("Chứng từ đã vào đợt kiểm và sẽ được đối chiếu với lô hàng đã giao.", "The documents joined a verification round and will be checked against the shipped batch."),
      action: pick("Xem hồ sơ", "View submission"), actionEn: "View submission",
    } satisfies Partial<VerificationProgressStep>);
  } else if (sub3) {
    Object.assign(step3, {
      state: "action", status: pick("Đang hoàn thiện", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "amber",
      note: done3 === 0
        ? pick(`Tải ít nhất một chứng từ phù hợp. ${l3Note}`, `Upload at least one matching document. ${l3Note}`)
        : pick(
            "Đã có chứng từ. Mở cổng để nộp hồ sơ; có thể bổ sung thêm chứng từ liên quan.",
            "The documents are in. Open the portal to submit them; you can add related documents too.",
          ),
      action: done3 === 0 ? pick("Tải chứng từ", "Add shipping evidence") : pick("Nộp hồ sơ chứng từ", "Submit shipping evidence"),
      actionEn: done3 === 0 ? "Add shipping evidence" : "Submit shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (request3?.status === "contacted") {
    Object.assign(step3, {
      state: "action", status: pick("Đã ghi nhận liên hệ", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "amber",
      note: pick(
        "Chúng tôi sẽ liên hệ để lên kế hoạch. Bạn cũng có thể nộp chứng từ ngay.",
        "We'll contact you to schedule it. You can also upload documents now.",
      ),
      action: pick("Nộp chứng từ", "Submit shipping evidence"), actionEn: "Add shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  } else if (request3) {
    Object.assign(step3, {
      state: "action", status: pick("Đã gửi yêu cầu", STATUS_EN.action), statusEn: STATUS_EN.action, tone: "amber",
      note: pick(
        "Yêu cầu đối chiếu lịch sử giao hàng đã gửi. Bạn có thể tự nộp chứng từ để được xét song song.",
        "Your delivery-history request has been sent. You can upload the documents so both checks run in parallel.",
      ),
      action: pick("Nộp chứng từ", "Submit shipping evidence"), actionEn: "Add shipping evidence",
    } satisfies Partial<VerificationProgressStep>);
  }

  // Thứ tự hiển thị 11/2026: giấy tờ, lịch sử xuất khẩu (bước 2), nhà máy (bước 3). Mã level giữ nguyên.
  const steps = [step1, step3, step2];
  const approvedCount = steps.filter((step) => step.state === "approved").length;
  const current = steps.find((step) => step.state !== "approved") ?? null;
  const percent = Math.round((approvedCount / steps.length) * 100);

  const headline = !current
    ? pick(
        "Đủ ba bước xác minh. Hồ sơ của bạn đang ở trạng thái đầy đủ nhất.",
        "All three verification steps are done. Your profile is as complete as it gets.",
      )
    : current.state === "reviewing"
      ? pick(
          `Bước ${displayLevel(current.level)} · ${current.title} đang chờ duyệt. Không cần nộp lại; kết quả sẽ hiện ngay tại đây.`,
          `Step ${displayLevel(current.level)} · ${current.title} is under review. No need to resubmit; the result shows up right here.`,
        )
      : current.state === "action"
        ? pick(
            `Bước ${displayLevel(current.level)} · ${current.title} đang chờ bạn xử lý.`,
            `Step ${displayLevel(current.level)} · ${current.title} is waiting for you.`,
          )
        : pick(`Bước tiếp theo: ${current.title}.`, `Next step: ${current.title}.`);

  return { steps, approvedCount, currentLevel: current?.level ?? null, percent, headline };
}
