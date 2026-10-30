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
  if (v.status === "submitted") return "Đợt kiểm đang chờ duyệt; trả về để người kiểm bổ sung bằng chứng.";
  return null;
}
