"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { eligiblePushProducts, isPushProductEligible } from "@/lib/sponsored/eligibility";
import { POOL_CAP, overlapping } from "@/lib/sponsored/admin";
import type { SponsoredPush } from "@/lib/types";

const PATH = "/crm/sponsored";
/** Gói danh mục mới có thời hạn 168 giờ; không nhận số giờ từ trình duyệt. */
const GATE_HOURS = 168;

function back(code: string, kind: "ok" | "err" = "ok"): never {
  redirect(`${PATH}?${kind}=${code}`);
}

/** Chỉ admin hoặc trưởng kiểm duyệt đang có quyền mới thao tác. */
const APPROVER_ROLES: readonly string[] = ["admin", "reviewer"];

/** Tên hàm này được scripts/check-permissions.mjs nhận diện là cổng kiểm quyền. */
async function sponsoredManageAccess(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, "sponsored.manage")) back("forbidden", "err");
  if (!APPROVER_ROLES.includes(session.role)) back("forbidden", "err");
  return session;
}

/** Gói đã bán, kể cả đang tạm dừng, vẫn giữ chỗ tới hết hạn. */
function ensureAvailable(pushes: SponsoredPush[], candidate: SponsoredPush): void {
  const others = pushes.filter((p) => p.id !== candidate.id);
  if (overlapping(others, candidate).length >= POOL_CAP[candidate.surface]) back("pool", "err");
  const from = Date.parse(candidate.starts_at);
  const to = Date.parse(candidate.ends_at);
  if (others.some((p) => p.status !== "draft" && p.product_id === candidate.product_id &&
    Date.parse(p.starts_at) < to && from < Date.parse(p.ends_at))) back("duplicate", "err");
}

/** Trigger kiểm lại dưới khóa khi có hai phiên duyệt cùng lúc. */
function translateWriteError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/Sponsored pool is full/i.test(message)) back("pool", "err");
  if (/already has a sponsored push/i.test(message)) back("duplicate", "err");
  if (/home.*not supported/i.test(message)) back("unsupported", "err");
  throw error;
}

export async function approvePushAction(fd: FormData) {
  const session = await sponsoredManageAccess();
  const id = String(fd.get("id") ?? "");
  const store = getStore();
  const pushes = await store.listAllSponsoredPushes();
  const push = pushes.find((p) => p.id === id);
  if (!push) back("missing", "err");
  if (push.surface !== "category") back("unsupported", "err");
  if (push.status === "approved") back("noop");
  if (push.status !== "draft") back("invalid", "err");
  // Trả tiền không mua được quyền vượt các điều kiện công khai hoặc đổi danh mục.
  if (!await isPushProductEligible(push)) back("gates", "err");

  // Mốc trên nháp chỉ là dữ liệu tạm do schema yêu cầu. Duyệt mới mở đủ 168 giờ.
  // Trigger trong migration mới đặt lại theo đồng hồ CSDL trước khi kiểm bể.
  const start = new Date();
  const startsAt = start.toISOString();
  const endsAt = new Date(start.getTime() + GATE_HOURS * 3_600_000).toISOString();
  ensureAvailable(pushes, { ...push, starts_at: startsAt, ends_at: endsAt });
  const updated = await store.updateSponsoredPushIfStatus(push.id, "draft", {
    status: "approved", starts_at: startsAt, ends_at: endsAt,
    approved_by: session.uid, approved_at: startsAt,
  }).catch(translateWriteError);
  if (!updated) back("changed", "err");
  revalidatePath(PATH);
  back("approved");
}

export async function pausePushAction(fd: FormData) {
  await sponsoredManageAccess();
  const id = String(fd.get("id") ?? "");
  const store = getStore();
  const pushes = await store.listAllSponsoredPushes();
  const push = pushes.find((p) => p.id === id);
  if (!push) back("missing", "err");
  if (push.status !== "approved") back("invalid", "err");
  if (Date.now() >= Date.parse(push.ends_at)) back("ended", "err");
  // Cho phép tạm dừng gói trang chủ cũ, nhưng không được duyệt/chạy lại.
  if (!await store.updateSponsoredPushIfStatus(push.id, "approved", { status: "paused" })) back("changed", "err");
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
  if (push.surface !== "category") back("unsupported", "err");
  if (push.status !== "paused") back("invalid", "err");
  if (Date.now() >= Date.parse(push.ends_at)) back("ended", "err");
  if (!await isPushProductEligible(push)) back("gates", "err");
  // Chạy lại giữ nguyên thời hạn đã bán, không tự gia hạn các gói cũ.
  ensureAvailable(pushes, push);
  const updated = await store.updateSponsoredPushIfStatus(push.id, "paused", {
    status: "approved",
    approved_by: push.approved_by ?? session.uid,
    approved_at: push.approved_at ?? new Date().toISOString(),
  }).catch(translateWriteError);
  if (!updated) back("changed", "err");
  revalidatePath(PATH);
  back("resumed");
}

export async function cancelDraftAction(fd: FormData) {
  await sponsoredManageAccess();
  const id = String(fd.get("id") ?? "");
  const store = getStore();
  // Kiểm trạng thái ngay trong DELETE, tránh xoá nhầm gói vừa được duyệt.
  if (!await store.deleteSponsoredDraft(id)) back("changed", "err");
  revalidatePath(PATH);
  back("deleted");
}

export async function createPushAction(fd: FormData) {
  await sponsoredManageAccess();
  const store = getStore();
  const productId = String(fd.get("product") ?? "");
  const surface = String(fd.get("surface") ?? "category");
  // Form giả mạo cũng không thể tạo gói trang chủ hoặc bề mặt chưa hỗ trợ.
  if (surface !== "category") back("unsupported", "err");
  const priceText = String(fd.get("price") ?? "").replace(/[^\d]/g, "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 400);

  const candidate = (await eligiblePushProducts()).find((c) => c.productId === productId);
  if (!candidate) back("gates", "err");

  // Schema hiện bắt buộc hai mốc ngay cả ở nháp. Đây chỉ là mốc tạm, không giữ
  // chỗ và không tính thời hạn; lúc duyệt sẽ kiểm lại bể theo khoảng mới.
  const start = new Date();
  await store.createSponsoredPush({
    surface: "category",
    category_slug: candidate.categorySlug,
    supplier_id: candidate.supplierId,
    product_id: candidate.productId,
    status: "draft",
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + GATE_HOURS * 3_600_000).toISOString(),
    price_amount: priceText ? Number(priceText) : null,
    price_currency: priceText ? "VND" : null,
    note: note || null,
  });
  revalidatePath(PATH);
  back("created");
}
