"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { eligiblePushProducts } from "@/lib/sponsored/eligibility";
import { POOL_CAP, overlapping } from "@/lib/sponsored/admin";
import type { SponsoredPushSurface } from "@/lib/types";

const PATH = "/crm/sponsored";
/** Gói luôn dài đúng 168 giờ. Không nhận số giờ từ trình duyệt. */
const GATE_HOURS = 168;

function back(code: string, kind: "ok" | "err" = "ok"): never {
  redirect(`${PATH}?${kind}=${code}`);
}

/**
 * Duyệt gói là quyền của nội bộ Vexim, không phải của người bán: admin và trưởng
 * kiểm duyệt.
 *
 * Ràng buộc dưới cơ sở dữ liệu cũng chỉ nhận hai vai trò đó và đòi tài khoản đang
 * hoạt động, nên chặn ở đây cho khớp chứ không thay thế được chốt đó.
 */
const APPROVER_ROLES: readonly string[] = ["admin", "reviewer"];

/** Tên hàm này được scripts/check-permissions.mjs nhận diện là cổng kiểm quyền. */
async function sponsoredManageAccess(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, "sponsored.manage")) back("forbidden", "err");
  if (!APPROVER_ROLES.includes(session.role)) back("forbidden", "err");
  return session;
}

export async function approvePushAction(fd: FormData) {
  const session = await sponsoredManageAccess();
  const id = String(fd.get("id") ?? "");
  const store = getStore();
  const pushes = await store.listAllSponsoredPushes();
  const push = pushes.find((p) => p.id === id);
  if (!push) back("missing", "err");
  if (push.status === "approved") back("noop");
  // Trả tiền không mua được quyền vượt bốn cổng công khai.
  const candidates = await eligiblePushProducts();
  if (!candidates.some((c) => c.productId === push.product_id)) back("gates", "err");
  const clash = overlapping(pushes.filter((p) => p.id !== push.id), push);
  if (clash.length >= POOL_CAP[push.surface]) back("pool", "err");
  await store.updateSponsoredPush(push.id, {
    status: "approved",
    approved_by: session.uid,
    approved_at: new Date().toISOString(),
  });
  revalidatePath(PATH);
  back("approved");
}

export async function pausePushAction(fd: FormData) {
  const session = await sponsoredManageAccess();
  const id = String(fd.get("id") ?? "");
  const store = getStore();
  const pushes = await store.listAllSponsoredPushes();
  const push = pushes.find((p) => p.id === id);
  if (!push) back("missing", "err");
  if (push.status !== "approved") back("invalid", "err");
  // Gói đã hết hạn thì tạm dừng không còn nghĩa gì.
  if (Date.now() >= Date.parse(push.ends_at)) back("ended", "err");
  await store.updateSponsoredPush(push.id, { status: "paused" });
  revalidatePath(PATH);
  back("paused");
}

export async function resumePushAction(fd: FormData) {
  const session = await sponsoredManageAccess();
  const id = String(fd.get("id") ?? "");
  const store = getStore();
  const pushes = await store.listAllSponsoredPushes();
  const push = pushes.find((p) => p.id === id);
  if (!push) back("missing", "err");
  if (push.status !== "paused") back("invalid", "err");
  if (Date.now() >= Date.parse(push.ends_at)) back("ended", "err");
  const clash = overlapping(pushes.filter((p) => p.id !== push.id), push);
  if (clash.length >= POOL_CAP[push.surface]) back("pool", "err");
  await store.updateSponsoredPush(push.id, {
    status: "approved",
    // Gói tạo tay có thể chưa có người duyệt; bật lại thì ghi người bật.
    approved_by: push.approved_by ?? session.uid,
    approved_at: push.approved_at ?? new Date().toISOString(),
  });
  revalidatePath(PATH);
  back("resumed");
}

export async function cancelDraftAction(fd: FormData) {
  await sponsoredManageAccess();
  const id = String(fd.get("id") ?? "");
  const store = getStore();
  const pushes = await store.listAllSponsoredPushes();
  const push = pushes.find((p) => p.id === id);
  if (!push) back("missing", "err");
  // Chỉ xoá gói còn ở trạng thái nháp. Gói đã duyệt thì tạm dừng, không xoá:
  // xoá đi là mất dấu đã thu tiền của khách.
  if (push.status !== "draft") back("invalid", "err");
  await store.deleteSponsoredPush(push.id);
  revalidatePath(PATH);
  back("deleted");
}

export async function createPushAction(fd: FormData) {
  await sponsoredManageAccess();
  const store = getStore();
  const productId = String(fd.get("product") ?? "");
  const surface: SponsoredPushSurface = String(fd.get("surface") ?? "category") === "home" ? "home" : "category";
  const priceText = String(fd.get("price") ?? "").replace(/[^\d]/g, "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 400);

  const candidates = await eligiblePushProducts();
  const candidate = candidates.find((c) => c.productId === productId);
  if (!candidate) back("gates", "err");

  // Gói bắt đầu ngay, không hẹn giờ. Hẹn giờ cần chọn múi giờ và một lịch chạy;
  // cả hai chưa có trong hệ thống, nên thà thiếu tính năng còn hơn ghi sai giờ.
  const start = new Date();
  const startsAt = start.toISOString();
  const endsAt = new Date(start.getTime() + GATE_HOURS * 3_600_000).toISOString();
  const pushes = await store.listAllSponsoredPushes();
  const candidateWindow = { surface, category_slug: candidate.categorySlug, starts_at: startsAt, ends_at: endsAt };
  if (overlapping(pushes, candidateWindow).length >= POOL_CAP[surface]) back("pool", "err");

  await store.createSponsoredPush({
    surface,
    category_slug: candidate.categorySlug,
    supplier_id: candidate.supplierId,
    product_id: candidate.productId,
    status: "draft",
    starts_at: startsAt,
    ends_at: endsAt,
    price_amount: priceText ? Number(priceText) : null,
    price_currency: priceText ? "VND" : null,
    note: note || null,
  });
  revalidatePath(PATH);
  back("created");
}
