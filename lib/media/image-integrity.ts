import { distanceMeters, parseExif, softwareSignal, type ExifInfo } from "./exif";
import { inVnBounds } from "@/lib/verification";
import { L2_FACTORY_PHOTO_ITEMS, SUBMISSION_FLAG_LABELS, type SubmissionFlag, type SubmissionIntegrityFlag } from "@/lib/types";

/**
 * Đối chứng kỹ thuật của ảnh L2: định vị, thời điểm chụp, dấu hiệu chỉnh sửa.
 *
 * Nguyên tắc: đây là TÍN HIỆU, không phải kết luận. Ảnh thiếu EXIF vẫn có thể là
 * ảnh thật (một số máy/ứng dụng không ghi EXIF), nên hệ thống chỉ nêu cờ để
 * người duyệt của Vexim xem lại — không tự đánh trượt hay tự duyệt.
 */

/** Ảnh phải chụp ban ngày: 06:00–18:00 giờ Việt Nam. */
export const DAYLIGHT_START_HOUR = 6;
export const DAYLIGHT_END_HOUR = 18;
/** GPS EXIF và GPS trình duyệt lệch quá mức này thì nêu cờ. */
export const GPS_TOLERANCE_M = 1000;
/** Ảnh dưới ngưỡng pixel này bị coi là thấp bất thường (ảnh nén lại nhiều lần). */
export const MIN_EDGE_PX = 600;

export interface GpsSample {
  lat: number | null;
  lng: number | null;
  accuracy_m?: number | null;
}

/** Giờ VN (UTC+7) của một mốc ISO, trả về {hour, minute, day} để kiểm tra ban ngày. */
export function vietnamClock(iso: string | null): { hour: number; minute: number; dateText: string } | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(time));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    hour: get("hour") % 24,
    minute: get("minute"),
    dateText: `${String(get("day")).padStart(2, "0")}/${String(get("month")).padStart(2, "0")}/${get("year")}`,
  };
}

export function isDaylight(iso: string | null): boolean | null {
  const clock = vietnamClock(iso);
  if (!clock) return null;
  return clock.hour >= DAYLIGHT_START_HOUR && clock.hour < DAYLIGHT_END_HOUR;
}

export function formatDaylight(iso: string | null): string {
  const clock = vietnamClock(iso);
  if (!clock) return "Không rõ thời điểm chụp";
  const hh = String(clock.hour).padStart(2, "0");
  const mm = String(clock.minute).padStart(2, "0");
  return `${clock.dateText} ${hh}:${mm} (giờ VN)`;
}

/**
 * Sinh cờ đối chứng cho MỘT ảnh L2 từ bytes gốc + GPS trình duyệt + thông số ảnh.
 * `codeIssuedAt`: mốc hệ thống phát hành mã xác minh — ảnh 🔖 chụp trước mốc này
 * nghĩa là tờ giấy không thể ghi mã của đợt này.
 */
export function photoIntegrityFlags(input: {
  checklistKey: string;
  exif: ExifInfo;
  capture: GpsSample;
  width: number | null;
  height: number | null;
  codeIssuedAt: string | null;
}): SubmissionIntegrityFlag[] {
  const flags: SubmissionIntegrityFlag[] = [];
  const push = (flag: SubmissionFlag, severity: "hard" | "warning", source: SubmissionIntegrityFlag["source"], detail: string | null) => {
    if (!flags.some((f) => f.flag === flag)) flags.push({ flag, severity, source, detail });
  };
  const item = L2_FACTORY_PHOTO_ITEMS.find((i) => i.key === input.checklistKey);

  if (!input.exif.has_exif) {
    push("no_exif", "warning", "exif", "Không tìm thấy EXIF trong tệp. Ảnh gốc từ camera thường còn EXIF; ảnh đã nén/đăng lại qua Zalo, Facebook… thì mất. Cần người duyệt đối chiếu thêm.");
  } else {
    const signal = softwareSignal(input.exif.software);
    if (signal === "editor") push("edited_software", "hard", "exif", `EXIF ghi phần mềm chỉnh sửa: ${input.exif.software}`);
    if (signal === "messenger") push("shared_via_app", "hard", "exif", `EXIF ghi ứng dụng chat/mạng xã hội: ${input.exif.software}`);
  }

  const exifLat = input.exif.lat;
  const exifLng = input.exif.lng;
  if (exifLat == null || exifLng == null) {
    push("no_gps", item?.requires_code ? "hard" : "warning", "gps", "Ảnh không chứa toạ độ GPS. Yêu cầu bật định vị camera khi chụp.");
  } else {
    if (inVnBounds(exifLat, exifLng) === false) push("gps_outside_vn", "warning", "gps", `GPS EXIF ${exifLat.toFixed(4)},${exifLng.toFixed(4)} ngoài phạm vi Việt Nam — kiểm tra lại cơ sở.`);
    const gap = distanceMeters(exifLat, exifLng, input.capture.lat, input.capture.lng);
    if (gap != null && gap > GPS_TOLERANCE_M) {
      push("gps_mismatch", "warning", "gps", `GPS trong ảnh lệch vị trí trình duyệt ${gap.toLocaleString("vi-VN")} m (chênh > ${GPS_TOLERANCE_M.toLocaleString("vi-VN")} m).`);
    }
  }

  const capturedAt = input.exif.captured_at;
  if (!capturedAt) {
    push("no_capture_time", "warning", "time", "Không đọc được thời điểm chụp từ EXIF; chỉ có thời điểm tải lên.");
  } else {
    if (isDaylight(capturedAt) === false) push("not_daylight", "hard", "time", `Ảnh chụp lúc ${formatDaylight(capturedAt)} — ngoài khoảng 06:00–18:00. Yêu cầu chụp ban ngày.`);
    if (input.codeIssuedAt && Date.parse(capturedAt) < Date.parse(input.codeIssuedAt) - 60_000) {
      push("capture_before_code", item?.requires_code ? "hard" : "warning", "time", `Ảnh chụp trước khi hệ thống phát hành mã xác minh (${formatDaylight(input.codeIssuedAt)}).`);
    }
  }

  const edge = Math.min(input.width ?? Number.POSITIVE_INFINITY, input.height ?? Number.POSITIVE_INFINITY);
  if (Number.isFinite(edge) && edge < MIN_EDGE_PX) {
    push("resolution_low", "warning", "system", `Ảnh chỉ ${input.width}×${input.height}px — khó đối chiếu biển tên/nhãn mác.`);
  }
  return flags;
}

/** Gộp cờ của các ảnh + cờ cấp hồ sơ, khử trùng lặp theo `flag` (giữ mức nặng hơn). */
export function mergeFlags(lists: SubmissionIntegrityFlag[][]): SubmissionIntegrityFlag[] {
  const byFlag = new Map<string, SubmissionIntegrityFlag>();
  for (const list of lists) {
    for (const flag of list) {
      const current = byFlag.get(flag.flag);
      if (!current || (current.severity === "warning" && flag.severity === "hard")) byFlag.set(flag.flag, flag);
    }
  }
  return [...byFlag.values()].sort((a, b) => (a.severity === b.severity ? a.flag.localeCompare(b.flag) : a.severity === "hard" ? -1 : 1));
}

export function flagLabel(flag: string): string {
  return SUBMISSION_FLAG_LABELS[flag] ?? flag;
}

/** Đọc EXIF + trả về bản tóm tắt để ghi vào hồ sơ (không ném lỗi). */
export function readPhotoEvidence(bytes: Uint8Array): ExifInfo {
  return parseExif(bytes);
}
