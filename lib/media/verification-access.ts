import type { Verification } from "@/lib/types";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { requireSecondVerificationReviewer } from "@/lib/verification-policy";

/** Applied by every media mutation endpoint, not just by hiding UI controls. */
export async function verificationMediaEditError(v: Verification): Promise<string | null> {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "verifications.inspect") || !hasPermission(session.role, "media.internal")) {
    return "Bạn không có quyền sửa bằng chứng nội bộ.";
  }
  if (v.status === "approved") return "Đợt kiểm đã được duyệt; bằng chứng được khóa để giữ lịch sử.";
  if (v.status === "submitted") {
    if (!hasPermission(session.role, "verifications.approve")) return "Đợt kiểm đang chờ duyệt; chỉ quản trị viên có quyền xét duyệt được đối chiếu bằng chứng.";
    if (requireSecondVerificationReviewer() && v.inspector_id === session.uid) {
      return "Đợt kiểm đang chờ duyệt; cần người xét duyệt khác người kiểm đối chiếu bằng chứng.";
    }
  }
  return null;
}
