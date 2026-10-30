import "server-only";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { l2ScopeMatchesSupplier } from "@/lib/l2-scope";
import { portalApproved } from "./onboarding";
import { supplierAccountAccess } from "./access";
import { loadSubmissionBundle, type SubmissionBundle } from "@/lib/verification-submission-service";
import type { SupplierSubmission } from "@/lib/types";

/**
 * Quyền truy cập cổng tự gửi bằng chứng L2/L3.
 *
 * Hai phía tách bạch:
 *  - NCC: chỉ hồ sơ của đúng doanh nghiệp mình, và tài khoản phải được Vexim mở quyền.
 *  - Nhân viên: cần `verifications.view` để xem và `media.internal` để mở tệp bằng chứng.
 */

export interface SupplierSubmissionAccess extends SubmissionBundle {
  store: ReturnType<typeof getStore>;
  supplierId: string;
  userId: string;
  userEmail: string;
}

/** Hồ sơ `id` có thuộc tài khoản NCC đang đăng nhập hay không. */
export async function supplierSubmissionAccess(submissionId: string): Promise<SupplierSubmissionAccess | null> {
  const account = await supplierAccountAccess();
  const supplierId = account?.user.supplier_id;
  if (!account || !supplierId) return null;
  const store = account.store;
  const supplier = await store.getSupplier(supplierId);
  if (!supplier || !portalApproved(supplier)) return null;
  const bundle = await loadSubmissionBundle(store, submissionId);
  if (!bundle || bundle.submission.supplier_id !== supplierId || !l2ScopeMatchesSupplier(bundle.submission, supplier.supplier_type)) return null;
  return { ...bundle, store, supplierId, userId: account.user.id, userEmail: account.user.email };
}

/** Hồ sơ đang mở của NCC ở một cấp (kèm quyền tạo mới nếu chưa có). */
export async function supplierLevelAccess(level: 2 | 3) {
  const account = await supplierAccountAccess();
  const supplierId = account?.user.supplier_id;
  if (!account || !supplierId) return null;
  const supplier = await account.store.getSupplier(supplierId);
  if (!supplier || !portalApproved(supplier)) return null;
  return { store: account.store, supplier, user: account.user };
}

export interface StaffSubmissionAccess extends SubmissionBundle {
  store: ReturnType<typeof getStore>;
  session: { uid: string; email: string; role: string };
  canReview: boolean;
}

/** Nhân viên mở hồ sơ tự gửi để đối chiếu; `canReview` mới được nhận/trả hồ sơ. */
export async function staffSubmissionAccess(submissionId: string): Promise<StaffSubmissionAccess | null> {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "verifications.view") || !hasPermission(session.role, "media.internal")) return null;
  const store = getStore();
  const bundle = await loadSubmissionBundle(store, submissionId);
  if (!bundle) return null;
  return {
    ...bundle,
    store,
    session: { uid: session.uid, email: session.email, role: session.role },
    canReview: hasPermission(session.role, "verifications.inspect"),
  };
}

/** Hồ sơ tự gửi + doanh nghiệp gửi, dành cho trang CRM của nhân viên. */
export async function loadStaffSubmission(submissionId: string) {
  const access = await staffSubmissionAccess(submissionId);
  if (!access) return null;
  const supplier = await access.store.getSupplier(access.submission.supplier_id);
  if (!supplier) return null;
  const existing = access.submission.verification_id
    ? await access.store.getVerification(access.submission.verification_id)
    : null;
  return { ...access, supplier, verification: existing };
}

/** Nhân viên có quyền xét duyệt hồ sơ tự gửi (tạo đợt kiểm, không phải duyệt huy hiệu). */
export function canReviewSubmissions(role: string): boolean {
  return hasPermission(role as never, "verifications.inspect");
}

export function submissionOwnedBy(submission: SupplierSubmission, supplierId: string): boolean {
  return submission.supplier_id === supplierId;
}
