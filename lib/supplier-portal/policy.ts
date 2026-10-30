import type { AppUserRecord, AuditEvidenceKey, Verification } from "@/lib/types";
import { auditUploadKind } from "@/lib/verification";

/** Supplier accounts never inherit staff permissions, even if they know another supplier's ID. */
export function ownsDocumentReview(user: Pick<AppUserRecord, "role" | "is_active" | "supplier_id"> | null, review: Pick<Verification, "supplier_id" | "target_level" | "status"> | null): boolean {
  return !!user?.is_active && user.role === "supplier" && !!user.supplier_id &&
    !!review && review.target_level === 1 && user.supplier_id === review.supplier_id;
}

export function canUploadOwnDocument(user: Pick<AppUserRecord, "role" | "is_active" | "supplier_id"> | null, review: Verification | null, key: string): boolean {
  return ownsDocumentReview(user, review) && !!review &&
    (review.status === "in_progress" || review.status === "returned") &&
    auditUploadKind(1, key as AuditEvidenceKey) === "file";
}

export const INITIAL_DOCUMENT_KEYS = ["business_license", "food_safety", "haccp_or_brc", "product_certs", "export_license"] as const;
