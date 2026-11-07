import "server-only";

import sharp from "sharp";

import { getStore } from "@/lib/db";
import { getObject } from "@/lib/media/storage";
import { SITE_URL } from "@/lib/site";
import { callDurationMinutes, callItems, callReviewImages, isCallReview, normalizeReportCode } from "@/lib/l2-call-review";
import { isPartnerL2 } from "@/lib/l2-scope";
import { L2_CALL_GROUPS, L2_PUBLIC_PHOTOS_MAX, L2_REVIEW_METHOD_LABELS, type Supplier, type Verification } from "@/lib/types";
import { regionFromAddress, type FactoryReportData, type FactoryReportItem, type FactoryReportPhoto } from "./factory-report";

function englishDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(iso)) + (withTime ? " (GMT+7)" : "");
}

/** Chỉ báo cáo của đợt kiểm qua cuộc gọi đã duyệt và nhà cung cấp còn công khai. */
export async function loadFactoryReport(rawCode: string): Promise<{ verification: Verification; supplier: Supplier; report: FactoryReportData } | null> {
  const code = normalizeReportCode(rawCode);
  if (!/^VXR-\d{4}-[A-Z0-9]{6}$/.test(code)) return null;
  const store = getStore();
  const verification = typeof store.getVerificationByReportCode === "function"
    ? await store.getVerificationByReportCode(code)
    : (await store.listVerifications()).find((v) => v.report_code === code && v.status === "approved") ?? null;
  if (!verification || verification.status !== "approved" || !isCallReview(verification) || !verification.report_code) return null;
  const supplier = await store.getSupplier(verification.supplier_id);
  if (!supplier || supplier.status !== "published") return null;
  const items: FactoryReportItem[] = callItems(verification.l2_scope).map((item) => {
    const value = verification.checklist?.[item.key];
    return {
      key: item.key, group: item.group, groupLabel: L2_CALL_GROUPS[item.group]?.en ?? item.group, label: item.labelEn,
      status: value === true ? "seen" : value === false ? "not_seen" : value === "not_applicable" ? "not_applicable" : "not_recorded",
    };
  });
  const report: FactoryReportData = {
    code: verification.report_code,
    supplierName: supplier.display_name?.trim() || supplier.trade_name?.trim() || supplier.name,
    partner: isPartnerL2(verification),
    partnerFactoryName: isPartnerL2(verification) ? verification.partner_factory_name ?? null : null,
    region: regionFromAddress(verification.visit_address ?? supplier.address),
    method: L2_REVIEW_METHOD_LABELS[verification.review_method ?? "video_call"].en,
    reviewedAt: englishDate(verification.call_started_at, true),
    durationMinutes: callDurationMinutes(verification),
    inspectorName: verification.inspector_name ?? "Vexim review lead",
    approvedAt: englishDate(verification.approved_at),
    items,
    verifyUrl: `${SITE_URL}/verify/${verification.report_code}`,
    supplierUrl: `${SITE_URL}/suppliers/${supplier.slug || supplier.id}`,
  };
  return { verification, supplier, report };
}

/**
 * Ảnh công khai: chỉ ảnh người kiểm đã chọn, của đúng đợt kiểm. Mỗi ảnh được mã hoá lại
 * (bỏ toàn bộ EXIF/GPS), thu nhỏ và đóng mã báo cáo ở góc để khó dùng lại ngoài ngữ cảnh.
 */
export async function loadFactoryReportPhotos(verification: Verification): Promise<FactoryReportPhoto[]> {
  const store = getStore();
  const media = callReviewImages(verification, await store.listMedia("verification", verification.id));
  const items = callItems(verification.l2_scope);
  const out: FactoryReportPhoto[] = [];
  for (const id of (verification.public_photo_ids ?? []).slice(0, L2_PUBLIC_PHOTOS_MAX)) {
    const asset = media.find((m) => m.id === id);
    if (!asset?.storage_path) continue;
    const object = await getObject(asset.storage_path).catch(() => null);
    if (!object) continue;
    try {
      // sharp không giữ metadata nếu không gọi withMetadata(): EXIF/GPS bị bỏ khi mã hoá lại.
      const resized = await sharp(object.data).rotate()
        .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
        .toBuffer({ resolveWithObject: true });
      const { width, height } = resized.info;
      const label = `Vexim ${verification.report_code}`;
      const fontSize = Math.max(14, Math.round(width / 40));
      const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${width - fontSize * 12.5}" y="${height - fontSize * 2}" width="${fontSize * 12.5}" height="${fontSize * 2}" fill="rgba(15,23,42,0.55)"/>
        <text x="${width - fontSize * 0.6}" y="${height - fontSize * 0.65}" font-family="sans-serif" font-size="${fontSize}" fill="#ffffff" text-anchor="end">${label}</text>
      </svg>`);
      const jpeg = await sharp(resized.data).composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
      const item = items.find((entry) => entry.key === asset.checklist_key);
      out.push({ dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, caption: item?.labelEn ?? "Facility" });
    } catch (error) {
      console.error("[factory-report] photo could not be prepared", asset.id, error);
    }
  }
  return out;
}
