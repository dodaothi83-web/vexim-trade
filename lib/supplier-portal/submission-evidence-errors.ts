import { evidenceMessages } from "@/lib/i18n/portal/evidence";

/**
 * Lỗi bảo vệ hồ sơ L2/L3 từ CSDL, đổi thành hướng dẫn ngắn cho NCC.
 * Mặc định tiếng Việt để khu nội bộ không đổi; cổng NCC truyền ngôn ngữ đang chọn.
 */
export function submissionEvidenceErrorMessage(error: unknown, language: "en" | "vi" = "vi"): string | null {
  const text = evidenceMessages[language].upload.errors;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("L2_PARTNER_CONTRACT_REQUIRED")) return text.partnerContractRequired;
  if (message.includes("L2_SCOPE_TYPE_MISMATCH")) return text.scopeTypeMismatch;
  if (message.includes("L2_PARTNER_PRIVATE_EVIDENCE")) return text.partnerPrivate;
  if (message.includes("L2_PARTNER_KEY_MISMATCH")) return text.partnerKeyMismatch;
  if (message.includes("L2_FACTORY_LOCKED")) return text.factoryLocked;
  if (message.includes("L2_FACTORY_PHOTOS_REQUIRED")) return text.photosRequired;
  if (message.includes("L2_FACTORY_CODE_REQUIRED")) return text.codeRequired;
  if (message.includes("L2_FACTORY_ITEM_INVALID")) return text.itemInvalid;
  if (message.includes("L3_SUBMISSION_LOCKED")) return text.l3Locked;
  if (message.includes("L3_EVIDENCE_LIMIT")) return text.l3Limit;
  if (message.includes("L3_EVIDENCE_REQUIRED")) return text.l3Required;
  return null;
}
