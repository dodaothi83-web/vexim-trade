import "server-only";

import { getBuyerUser } from "@/lib/auth/buyer-session";
import { getStore } from "@/lib/db";
import type { DataStore } from "@/lib/db/types";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";

/**
 * Người đang xem chat. Người mua: tài khoản đã xác minh email. Nhà cung cấp: tài khoản cổng
 * đã được duyệt. Bên nào thì do đường dẫn quyết định, không do dữ liệu trình duyệt gửi lên.
 */
export type ChatViewer =
  | { side: "buyer"; email: string; store: DataStore }
  | { side: "supplier"; supplierId: string; email: string; store: DataStore };

export async function chatViewer(side: string | null): Promise<ChatViewer | null> {
  if (side === "buyer") {
    const account = await getBuyerUser();
    if (!account?.verified_at) return null;
    return { side: "buyer", email: account.email.trim().toLowerCase(), store: getStore() };
  }
  if (side === "supplier") {
    const access = await supplierPortalAccess().catch(() => null);
    if (!access || !portalApproved(access.supplier)) return null;
    return { side: "supplier", supplierId: access.supplier.id, email: access.user.email, store: access.store };
  }
  return null;
}

export function sameOrigin(request: Request): boolean {
  try { return new URL(request.headers.get("origin") || "").host === request.headers.get("host"); } catch { return false; }
}
