/**
 * Định nghĩa pipeline (trạng thái của buyer).
 * Đây là nơi duy nhất cần sửa nếu Vexim muốn đổi/ thêm/ bớt giai đoạn.
 */

export type StageKey =
  | "lead"
  | "contacted"
  | "quoted"
  | "negotiation"
  | "confirmed"
  | "production"
  | "shipping"
  | "completed"
  | "lost";

export interface StageDef {
  key: StageKey;
  /** Nhãn tiếng Việt hiển thị trong giao diện */
  label: string;
  /** Nhãn tiếng Anh dùng trong email gửi buyer */
  labelEn: string;
  /** Mô tả ngắn hiện ra trong dropdown */
  hint: string;
  /** Màu chủ đạo (hex) – dùng cho dot, badge, cột kanban */
  color: string;
  /** Có phải là trạng thái kết thúc funnel không */
  terminal?: boolean;
  /** Mặc định KHÔNG gửi email khi chuyển sang trạng thái này */
  silent?: boolean;
  /** Từ trạng thái này trở đi hệ thống sẽ nhắc gắn NCC */
  wantsSupplier?: boolean;
}

export const STAGES: StageDef[] = [
  {
    key: "lead",
    label: "Khách mới",
    labelEn: "New enquiry",
    hint: "Vừa nhận được yêu cầu, chưa trao đổi",
    color: "#64748b",
  },
  {
    key: "contacted",
    label: "Đã liên hệ",
    labelEn: "In contact",
    hint: "Đã phản hồi buyer, đang tìm hiểu nhu cầu",
    color: "#0ea5e9",
  },
  {
    key: "quoted",
    label: "Báo giá & gửi mẫu",
    labelEn: "Quotation & sample",
    hint: "Đã gửi báo giá / mẫu cho buyer",
    color: "#8b5cf6",
    wantsSupplier: true,
  },
  {
    key: "negotiation",
    label: "Đàm phán",
    labelEn: "Negotiating",
    hint: "Đang thương lượng giá, quy cách, điều khoản",
    color: "#f59e0b",
    wantsSupplier: true,
  },
  {
    key: "confirmed",
    label: "Chốt PI & cọc",
    labelEn: "PI confirmed & deposit received",
    hint: "Đã ký PI, nhận tiền cọc – chuẩn bị sản xuất",
    color: "#10b981",
    wantsSupplier: true,
  },
  {
    key: "production",
    label: "Đang sản xuất",
    labelEn: "In production",
    hint: "NCC đang sản xuất / gom hàng",
    color: "#0d9488",
    wantsSupplier: true,
  },
  {
    key: "shipping",
    label: "Đang giao hàng",
    labelEn: "Shipped",
    hint: "Đã xuất hàng, đang làm chứng từ",
    color: "#2563eb",
    wantsSupplier: true,
  },
  {
    key: "completed",
    label: "Hoàn tất",
    labelEn: "Completed",
    hint: "Buyer đã nhận hàng & thanh toán đủ",
    color: "#16a34a",
    terminal: true,
  },
  {
    key: "lost",
    label: "Mất đơn / Hoãn",
    labelEn: "On hold / lost",
    hint: "Buyer dừng – chỉ ghi nhận nội bộ, không gửi email",
    color: "#dc2626",
    terminal: true,
    silent: true,
  },
];

/** Thứ tự funnel (không gồm "lost") – dùng cho thanh tiến độ trong email */
export const FUNNEL_STAGES = STAGES.filter((s) => s.key !== "lost");

const MAP = new Map(STAGES.map((s) => [s.key, s]));

export function getStage(key: string | null | undefined): StageDef {
  return MAP.get((key ?? "lead") as StageKey) ?? STAGES[0];
}

export function stageIndex(key: string | null | undefined): number {
  const i = FUNNEL_STAGES.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i;
}

export function isStage(key: unknown): key is StageKey {
  return typeof key === "string" && MAP.has(key as StageKey);
}

