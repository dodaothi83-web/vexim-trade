import "server-only";

import type { DataStore } from "@/lib/db/types";
import { MAX_INITIAL_FILES, saveDocumentEvidence, validateInitialDocument } from "@/lib/supplier-portal/evidence";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { defaultCertificateLabelForKey, ingestCertificateScan, isL1CertificateKey } from "@/lib/certificate-service";
import { L1_DOC_ITEMS } from "@/lib/types";

export type InitialDocument = { key: typeof INITIAL_DOCUMENT_KEYS[number]; file: File; prepared: Awaited<ReturnType<typeof validateInitialDocument>> };

export async function prepareInitialDocuments(form: FormData): Promise<InitialDocument[]> {
  const documents: InitialDocument[] = [];
  for (const key of INITIAL_DOCUMENT_KEYS) {
    for (const value of form.getAll(`doc:${key}`)) {
      if (!(value instanceof File) || !value.size) continue;
      if (documents.length >= MAX_INITIAL_FILES) throw new Error(`Tối đa ${MAX_INITIAL_FILES} giấy tờ bước đầu.`);
      documents.push({ key, file: value, prepared: await validateInitialDocument(value, key) });
    }
  }
  return documents;
}

/** Evidence belongs only to the document review. A request is never an approval. */
export async function saveInitialEvidence(input: {
  store: DataStore; supplierId: string; userId: string; userEmail?: string | null;
  tax: string; bank: string; documents: InitialDocument[]; requested: (2 | 3)[];
}) {
  const { store, supplierId, userId, userEmail, tax, bank, documents, requested } = input;
  const reviews = await store.listVerifications(supplierId);
  const review = reviews.find((v) => v.target_level === 1 && (v.status === "in_progress" || v.status === "returned")) ??
    await store.createVerification({
      supplier_id: supplierId, target_level: 1, status: "in_progress", inspector_id: null,
      tax_number: tax, bank_account_number: bank,
      checklist: Object.fromEntries(L1_DOC_ITEMS.map((item) => [item.key, null])),
      checklist_notes: {}, public_summary_i18n: {},
    });
  if (review.tax_number !== tax || review.bank_account_number !== bank) {
    await store.updateVerification(review.id, { tax_number: tax, bank_account_number: bank });
  }
  /*
   * Giấy chứng nhận tải ngay khi đăng ký cũng phải vào kho chứng nhận: nếu chỉ lưu tệp thì
   * hồ sơ có HACCP mà trang Giấy tờ lại báo "0 chứng nhận", không có hạn nhắc, badge hay
   * phạm vi sản phẩm. Lỗi quét không được làm hỏng việc nộp hồ sơ.
   */
  const supplier = await store.getSupplier(supplierId).catch(() => null);
  for (const { key, file, prepared } of documents) {
    const row = await saveDocumentEvidence({ store, review, key, file, prepared, createdBy: userId });
    if (!supplier || !isL1CertificateKey(key)) continue;
    await ingestCertificateScan({
      supplier,
      mediaId: row.id,
      bytes: prepared.bytes,
      storagePath: row.storage_path,
      declaredLabel: defaultCertificateLabelForKey(key),
      checklistKey: key,
      verificationId: review.id,
      source: "l1-supplier",
      actor: { id: userId, email: userEmail ?? null },
    }).catch((error) => console.error("[supplier-profile] certificate ingest", error));
  }
  const existing = await store.listSupplierVerificationRequests(supplierId);
  for (const level of requested) if (!existing.some((r) => r.target_level === level)) {
    await store.createSupplierVerificationRequest(supplierId, level);
  }
  return review;
}
