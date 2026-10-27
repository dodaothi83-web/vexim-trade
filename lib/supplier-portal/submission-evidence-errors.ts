/** Lỗi bảo vệ hồ sơ L3 từ CSDL, đổi thành hướng dẫn ngắn cho NCC. */
export function submissionEvidenceErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("L2_PARTNER_CONTRACT_REQUIRED")) return "Hãy tải hợp đồng với nhà máy đối tác trước khi nộp.";
  if (message.includes("L2_SCOPE_TYPE_MISMATCH")) return "Loại hình doanh nghiệp chưa rõ hoặc đã thay đổi. Liên hệ nhân viên để kiểm tra lại hồ sơ.";
  if (message.includes("L2_PARTNER_PRIVATE_EVIDENCE")) return "Tệp không thuộc đúng hồ sơ hoặc không được lưu nội bộ. Hãy kiểm tra lại.";
  if (message.includes("L2_PARTNER_KEY_MISMATCH")) return "Mục bằng chứng không đúng với phạm vi hồ sơ.";
  if (message.includes("L3_SUBMISSION_LOCKED")) return "Hồ sơ đang chờ xét hoặc đã được nhận; không thể thay đổi chứng từ.";
  if (message.includes("L3_EVIDENCE_LIMIT")) return "Mỗi mục giữ tối đa 3 tệp. Hãy xóa một tệp trước khi tải thêm.";
  if (message.includes("L3_EVIDENCE_REQUIRED")) return "Hồ sơ đã thay đổi. Hãy tải ít nhất một chứng từ trước khi nộp.";
  return null;
}
