import "server-only";
import { getStore } from "@/lib/db";
import type { DataStore } from "@/lib/db/types";
import { getObject } from "@/lib/media/storage";
import {
  scanCertificateFile,
  type CertificateScanOutcome,
  type CertificateScanResult,
} from "@/lib/ai/certificate-scan";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
import {
  notifySupplierCertificateExpiry,
  notifySupplierCertificateSubmission,
  notifySupplierDecision,
} from "@/lib/supplier-portal/notify";
import type {
  Certificate,
  CertificateHolderMatch,
  CertificateSource,
  Supplier,
  SupplierType,
} from "@/lib/types";
import { approvedL2Scope } from "@/lib/verification-status";

export const L1_CERTIFICATE_KEYS = [
  "food_safety",
  "haccp_or_brc",
  "product_certs",
  "export_license",
] as const;

export type L1CertificateKey = (typeof L1_CERTIFICATE_KEYS)[number];

export const EXPIRY_REMINDER_THRESHOLDS = [60, 30, 7, 1] as const;
export type ExpiryReminderThreshold = (typeof EXPIRY_REMINDER_THRESHOLDS)[number];

export function isL1CertificateKey(key: string | null | undefined): key is L1CertificateKey {
  return Boolean(key && (L1_CERTIFICATE_KEYS as readonly string[]).includes(key));
}

export function defaultCertificateLabelForKey(key: string | null | undefined): string {
  switch (key) {
    case "food_safety":
      return "Giấy chứng nhận ATTP";
    case "haccp_or_brc":
      return "HACCP / BRC / ISO 22000";
    case "product_certs":
      return "Chứng chỉ sản phẩm";
    case "export_license":
      return "Giấy phép xuất khẩu";
    default:
      return "Giấy chứng nhận";
  }
}

export function holderMatchBadgeLabel(
  holderMatch: CertificateHolderMatch | null | undefined,
  holderName: string | null | undefined,
): string {
  if (holderMatch === "owner") return "Chính chủ";
  if (holderMatch === "partner") {
    return holderName?.trim() ? `Đơn vị đối tác: ${holderName.trim()}` : "Đơn vị đối tác";
  }
  return "Chưa xác định đơn vị đứng tên";
}

export function daysUntilExpiry(validUntil: string | null | undefined, today = todayISO()): number | null {
  if (!validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return null;
  const endMs = Date.parse(`${validUntil}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(endMs) || Number.isNaN(todayMs)) return null;
  return Math.floor((endMs - todayMs) / 86_400_000);
}

export interface CertificatePublicationDecision {
  autoPublish: boolean;
  review_status: "approved" | "pending";
  publicly_visible: boolean;
  review_note: string;
}

/**
 * Ai đứng tên trên giấy và hồ sơ xác thực của chính nhà cung cấp.
 *
 * Nhà máy/HTX chỉ dùng được chứng nhận đứng tên chính mình. Đơn vị thương mại muốn
 * dùng chứng nhận của nhà máy khác thì phải có hồ sơ L2 "nhà máy đối tác" đã duyệt —
 * nếu không, giấy đó chỉ được lưu để đối chiếu chứ không công bố được. Nhờ vậy không
 * thể tải bừa một giấy chứng nhận của doanh nghiệp bất kỳ lên hồ sơ.
 */
export interface CertificateHolderContext {
  supplierType?: SupplierType | null;
  /** Đã có hồ sơ L2 nhà máy đối tác (partner_contract) được duyệt. */
  partnerContractApproved?: boolean;
}

/** Câu giải thích vì sao giấy đứng tên đơn vị khác chưa được công bố. */
function partnerHolderRule(context: CertificateHolderContext): string {
  if (context.supplierType === "manufacturer" || context.supplierType === "cooperative") {
    return "nhà máy chỉ dùng chứng nhận đứng tên chính mình";
  }
  if (context.supplierType === "trading") {
    return context.partnerContractApproved
      ? "Vexim đối chiếu với hợp đồng nhà máy đối tác ở L2"
      : "chưa xác thực L2 nhà máy đối tác nên giấy này chưa dùng được";
  }
  return "Vexim kiểm tra loại hình doanh nghiệp trước khi đăng";
}

export function decideCertificatePublication(
  scan: CertificateScanResult | null,
  today = todayISO(),
  context: CertificateHolderContext = {},
): CertificatePublicationDecision {
  if (!scan) {
    return {
      autoPublish: false,
      review_status: "pending",
      publicly_visible: false,
      review_note: "Chờ AI quét nội dung chứng nhận (đơn vị đứng tên và ngày hết hạn).",
    };
  }

  // Chứng nhận đứng tên doanh nghiệp khác không bao giờ tự công bố: phải để Vexim
  // đối chiếu loại hình nhà cung cấp (nhà máy hay thương mại) và hồ sơ L2 đối tác.
  if (scan.holder_match === "partner" && scan.holder_name?.trim()) {
    const reasons: string[] = [];
    if (!scan.valid_until) reasons.push("chưa đọc được ngày hết hạn");
    else if (scan.valid_until < today) reasons.push(`giấy đã hết hạn ngày ${scan.valid_until}`);
    if (!(scan.confidence === "high" || scan.confidence === "medium")) reasons.push("ảnh/PDF mờ hoặc độ tin cậy thấp");
    const rule = partnerHolderRule(context);
    return {
      autoPublish: false,
      review_status: "pending",
      publicly_visible: false,
      review_note: `Chưa tự công bố: giấy đứng tên ${scan.holder_name.trim()} (${rule}).${
        reasons.length ? ` Lưu ý: ${reasons.join("; ")}.` : " Vexim kiểm tra trước khi đăng."}`,
    };
  }

  const hasValidHolder = scan.holder_match === "owner";
  const hasFutureExpiry = Boolean(scan.valid_until && scan.valid_until >= today);
  const hasConfidence = scan.confidence === "high" || scan.confidence === "medium";

  if (hasValidHolder && hasFutureExpiry && hasConfidence) {
    const holderText =
      scan.holder_match === "owner"
        ? `Chính chủ (${scan.holder_name || "khớp tên nhà cung cấp"})`
        : `Đơn vị đối tác: ${scan.holder_name}`;
    return {
      autoPublish: true,
      review_status: "approved",
      publicly_visible: true,
      review_note: `AI đã quét: ${holderText} · Hết hạn ${scan.valid_until}.`,
    };
  }

  const reasons: string[] = [];
  if (!scan.valid_until) {
    reasons.push("chưa đọc được ngày hết hạn trên giấy");
  } else if (scan.valid_until < today) {
    reasons.push(`giấy đã hết hạn ngày ${scan.valid_until}`);
  }
  if (!hasValidHolder) {
    reasons.push("chưa xác định rõ đơn vị đứng tên (chính chủ hay đối tác)");
  }
  if (!hasConfidence) {
    reasons.push("ảnh/PDF mờ hoặc độ tin cậy nhận diện thấp");
  }

  return {
    autoPublish: false,
    review_status: "pending",
    publicly_visible: false,
    review_note: `Chưa tự công bố: ${reasons.join("; ")}. Vui lòng tải bản rõ hơn hoặc chờ kiểm tra.`,
  };
}

export interface IngestCertificateInput {
  supplier: Supplier;
  mediaId: string;
  bytes?: Uint8Array | null;
  storagePath?: string | null;
  declaredLabel?: string | null;
  checklistKey?: string | null;
  verificationId?: string | null;
  source: CertificateSource;
  existingCertificateId?: string | null;
  actor?: { id?: string | null; email?: string | null };
}

export interface IngestCertificateDeps {
  store?: DataStore;
  scanFn?: typeof scanCertificateFile;
  getObjectFn?: typeof getObject;
  notifyDecisionFn?: typeof notifySupplierDecision;
  notifyStaffFn?: typeof notifySupplierCertificateSubmission;
  today?: string;
  nowIso?: string;
}

export async function ingestCertificateScan(
  input: IngestCertificateInput,
  deps: IngestCertificateDeps = {},
): Promise<{
  certificate: Certificate;
  scanOutcome: CertificateScanOutcome;
  decision: CertificatePublicationDecision;
}> {
  const store = deps.store ?? getStore();
  const scanFn = deps.scanFn ?? scanCertificateFile;
  const getObjectFn = deps.getObjectFn ?? getObject;
  const notifyDecisionFn = deps.notifyDecisionFn ?? notifySupplierDecision;
  const notifyStaffFn = deps.notifyStaffFn ?? notifySupplierCertificateSubmission;
  const today = deps.today ?? todayISO();
  const nowIso = deps.nowIso ?? new Date().toISOString();

  let bytes = input.bytes ?? null;
  if (!bytes && input.storagePath) {
    const obj = await getObjectFn(input.storagePath);
    bytes = obj?.data ?? null;
  }

  const supplierNames = [
    input.supplier.name,
    input.supplier.trade_name ?? "",
    input.supplier.display_name ?? "",
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const fallbackLabel =
    input.declaredLabel?.trim() || defaultCertificateLabelForKey(input.checklistKey);

  const scanOutcome: CertificateScanOutcome = bytes
    ? await scanFn({
        supplierNames,
        file: { bytes, declaredLabel: fallbackLabel },
      })
    : {
        ok: false,
        reason: "unsupported_file",
        message: "Không tìm thấy nội dung tệp để quét.",
      };

  const scan = scanOutcome.ok ? scanOutcome.data : null;
  // Loại hình đăng ký + hồ sơ L2 quyết định giấy đứng tên đơn vị khác có dùng được không.
  const verifications = typeof store.listVerifications === "function"
    ? await store.listVerifications(input.supplier.id).catch(() => [])
    : [];
  const l2Scope = approvedL2Scope(verifications ?? []);
  const decision = decideCertificatePublication(scan, today, {
    supplierType: input.supplier.supplier_type ?? null,
    partnerContractApproved: l2Scope === "partner_contract" || l2Scope === "both",
  });

  const all = await store.listCertificates(input.supplier.id);
  let existing: Certificate | undefined;
  if (input.existingCertificateId) {
    existing = all.find((c) => c.id === input.existingCertificateId);
  }
  if (!existing && scan?.certificate_number) {
    const numNorm = scan.certificate_number.trim().toLowerCase();
    existing = all.find((c) => c.number && c.number.trim().toLowerCase() === numNorm);
  }
  if (!existing && input.checklistKey) {
    existing = all.find(
      (c) =>
        c.checklist_key === input.checklistKey &&
        (c.source === "l1-supplier" || c.source === "l1-staff"),
    );
  }

  const resolvedName =
    scan?.certificate_name ||
    input.declaredLabel?.trim() ||
    existing?.name ||
    defaultCertificateLabelForKey(input.checklistKey);
  const resolvedValidUntil = scan ? scan.valid_until : (existing?.valid_until ?? null);
  const expiryChanged =
    !existing || (existing.valid_until ?? null) !== (resolvedValidUntil ?? null);

  const patch: Partial<Certificate> = {
    supplier_id: input.supplier.id,
    name: resolvedName.slice(0, 160),
    issuer: scan?.issuer ?? existing?.issuer ?? null,
    number: scan?.certificate_number ?? existing?.number ?? null,
    valid_until: resolvedValidUntil,
    file_media_id: input.mediaId || existing?.file_media_id || null,
    check_status: existing?.check_status ?? "on_file",
    holder_name: scan?.holder_name ?? existing?.holder_name ?? null,
    holder_match: scan ? scan.holder_match : (existing?.holder_match ?? "unclear"),
    ai_scanned_at: scanOutcome.ok ? nowIso : (existing?.ai_scanned_at ?? null),
    ai_summary: scanOutcome.ok ? scanOutcome.data.summary : scanOutcome.message,
    ai_confidence: scanOutcome.ok ? scanOutcome.data.confidence : (existing?.ai_confidence ?? null),
    source: input.source,
    checklist_key: input.checklistKey ?? existing?.checklist_key ?? null,
    verification_id: input.verificationId ?? existing?.verification_id ?? null,
    // Không bao giờ tự ghi đè cờ ẩn của nhân viên khi quét lại.
    staff_hidden: existing?.staff_hidden ?? false,
    // Khi NCC tải bản mới có ngày hết hạn khác, đặt lại toàn bộ mốc nhắc 60/30/7/1 ngày.
    expiry_notified: expiryChanged ? {} : (existing?.expiry_notified ?? {}),
    review_status: decision.review_status,
    review_note: decision.review_note,
    publicly_visible: decision.publicly_visible,
    checked_at: decision.autoPublish ? nowIso : (existing?.checked_at ?? null),
  };

  let certificate: Certificate;
  if (existing) {
    certificate = (await store.updateCertificate(existing.id, patch)) ?? {
      ...existing,
      ...patch,
      updated_at: nowIso,
    };
  } else {
    certificate = await store.createCertificate(patch);
  }

  await store
    .addAuditLog({
      actor_id: input.actor?.id ?? null,
      actor_email: input.actor?.email ?? null,
      entity: "supplier",
      entity_id: input.supplier.id,
      action: "certificate.ai_scan",
      before: existing
        ? {
            id: existing.id,
            valid_until: existing.valid_until,
            holder_match: existing.holder_match ?? null,
            review_status: existing.review_status,
            publicly_visible: existing.publicly_visible,
          }
        : null,
      after: {
        id: certificate.id,
        name: certificate.name,
        source: certificate.source,
        checklist_key: certificate.checklist_key ?? null,
        holder_match: certificate.holder_match ?? null,
        holder_name: certificate.holder_name ?? null,
        valid_until: certificate.valid_until,
        ai_confidence: certificate.ai_confidence ?? null,
        auto_published: decision.autoPublish,
        staff_hidden: Boolean(certificate.staff_hidden),
      },
    })
    .catch(() => null);

  if (decision.autoPublish && !certificate.staff_hidden) {
    await notifyDecisionFn({
      supplierId: input.supplier.id,
      decision: "certificate_published",
      name: certificate.name,
      entityId: certificate.id,
      note: decision.review_note,
    }).catch(() => "failed");
  } else if (input.source !== "l1-staff") {
    await notifyStaffFn(input.supplier, certificate.name).catch(() => "failed");
  }

  return { certificate, scanOutcome, decision };
}

export function pickExpiryReminderThreshold(
  daysLeft: number | null,
): ExpiryReminderThreshold | null {
  if (daysLeft === null || daysLeft < 0 || daysLeft > 60) return null;
  if (daysLeft <= 1) return 1;
  if (daysLeft <= 7) return 7;
  if (daysLeft <= 30) return 30;
  return 60;
}

export interface ExpiryReminderReport {
  checked: number;
  reminded: number;
  alreadyNotified: number;
  failed: number;
  details: Array<{
    certificateId: string;
    supplierId: string;
    name: string;
    validUntil: string;
    daysLeft: number;
    threshold: ExpiryReminderThreshold;
    status: "sent" | "simulated" | "failed" | "already_notified";
  }>;
}

export async function sendCertificateExpiryReminders(opts: {
  store?: DataStore;
  notifyFn?: typeof notifySupplierCertificateExpiry;
  today?: string;
  nowIso?: string;
} = {}): Promise<ExpiryReminderReport> {
  const store = opts.store ?? getStore();
  const notifyFn = opts.notifyFn ?? notifySupplierCertificateExpiry;
  const today = opts.today ?? todayISO();
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const suppliers = await store.listSuppliers();
  const report: ExpiryReminderReport = {
    checked: 0,
    reminded: 0,
    alreadyNotified: 0,
    failed: 0,
    details: [],
  };

  for (const supplier of suppliers) {
    const certs = await store.listCertificates(supplier.id);
    for (const cert of certs) {
      if (cert.review_status === "rejected" || !cert.valid_until) continue;
      report.checked += 1;
      const daysLeft = daysUntilExpiry(cert.valid_until, today);
      const threshold = pickExpiryReminderThreshold(daysLeft);
      if (threshold === null || daysLeft === null) continue;

      const markerKey = `d${threshold}`;
      const notifiedMap = cert.expiry_notified ?? {};
      if (notifiedMap[markerKey]) {
        report.alreadyNotified += 1;
        report.details.push({
          certificateId: cert.id,
          supplierId: supplier.id,
          name: cert.name,
          validUntil: cert.valid_until,
          daysLeft,
          threshold,
          status: "already_notified",
        });
        continue;
      }

      const sendStatus = await notifyFn({
        supplierId: supplier.id,
        certificateName: cert.name,
        validUntil: cert.valid_until,
        daysLeft,
        threshold,
      });

      if (sendStatus === "sent" || sendStatus === "simulated") {
        await store.updateCertificate(cert.id, {
          expiry_notified: { ...notifiedMap, [markerKey]: nowIso },
        });
        report.reminded += 1;
      } else {
        report.failed += 1;
      }

      report.details.push({
        certificateId: cert.id,
        supplierId: supplier.id,
        name: cert.name,
        validUntil: cert.valid_until,
        daysLeft,
        threshold,
        status: sendStatus,
      });
    }
  }

  return report;
}
