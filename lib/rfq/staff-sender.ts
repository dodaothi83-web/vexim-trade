import "server-only";

import { getStore } from "@/lib/db";
import { checkSenderAddress, formatFrom, senderAddressFor } from "@/lib/email/sender";

/** Never fall back to sales@/contact@ or to an unnamed role account for supplier RFQ mail. */
export async function requireRfqStaffSender(actorId: string): Promise<{ header: string; address: string }> {
  if (!actorId) throw new Error("Chưa xác định nhân viên gửi RFQ. Không gửi email nhà cung cấp.");
  const store = getStore();
  const [actor, users] = await Promise.all([store.getUser(actorId), store.listUsers()]);
  const name = actor?.name?.trim();
  if (!actor?.is_active || !["admin", "sourcing", "sale"].includes(actor.role) || !name ||
    /[\r\n<>]/.test(name) ||
    /^(?:admin|sales?|sourcing|staff|support|contact|vexim(?: trade)?)(?:\s+(?:team|department|dept|vexim|trade))?$/i.test(name)) {
    throw new Error("Nhân viên cần tài khoản đang hoạt động và tên người thật để gửi RFQ; không dùng hộp thư chung.");
  }
  // An explicitly configured but invalid address must fail, not silently become another identity.
  const address = actor.sender_email?.trim() || senderAddressFor(actor, users);
  const checked = checkSenderAddress(address);
  if (!checked.ok) throw new Error("Địa chỉ gửi cá nhân chưa hợp lệ/không thuộc domain Resend đã cấu hình. Kiểm tra Cài đặt → Người dùng.");
  return { address: checked.address, header: formatFrom(name, checked.address) };
}
