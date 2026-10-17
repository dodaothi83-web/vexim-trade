import type { Verification } from "@/lib/types";
import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

/** Applied by every media mutation endpoint, not just by hiding UI controls. */
export async function verificationMediaEditError(v: Verification): Promise<string | null> {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "verifications.inspect") || !hasPermission(session.role, "media.internal")) {
    return "Bạn không có quyền sửa bằng chứng nội bộ.";
  }
  if (v.status === "approved") return "Đợt kiểm đã được duyệt; bằng chứng được khóa để giữ lịch sử.";
  if (v.status === "submitted" && (!hasPermission(session.role, "verifications.approve") || v.inspector_id === session.uid)) {
    return "Đợt kiểm đang chờ duyệt; chỉ người xét duyệt khác người kiểm được đối chiếu bằng chứng.";
  }
  return null;
}
