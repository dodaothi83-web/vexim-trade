"use client";

/**
 * Luồng gửi email giờ HOÀN TOÀN tự động: mỗi lần đổi giai đoạn là hệ thống
 * gửi ngay cho buyer và NCC (theo đúng yêu cầu nghiệp vụ), không có công tắc
 * hay bước xác nhận nào. Hook giữ lại để các component đọc giá trị cố định.
 */
export function useAutoSend() {
  return { value: true };
}
