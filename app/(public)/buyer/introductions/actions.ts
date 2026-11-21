"use server";

import { revalidatePath } from "next/cache";

import { getBuyerSession } from "@/lib/auth/buyer-session";
import { getStore } from "@/lib/db";
import { canPromptIntroductions, normalizeCategoryIds, withConsent } from "@/lib/buyer/introductions";
import { introCategories, patchIntroductions, verifyIntroToken } from "@/lib/buyer/introductions-server";
import type { BuyerIntroductions } from "@/lib/types";

/**
 * Người mua đồng ý nhận giới thiệu nhà cung cấp. Chỉ tính là đồng ý khi người mua tự bấm; danh tính
 * lấy từ phiên đăng nhập hoặc link ký trong thư (không bao giờ từ mã do trình duyệt gửi lên). Ngành
 * hàng chỉ nhận ngành đang đăng.
 */
type Result = { ok: boolean; message?: string };
const FAILED = "Could not save. Please try again.";

async function sessionAccount() {
  const session = await getBuyerSession();
  if (!session) return null;
  const account = await getStore().getBuyerUserByEmail(session.email);
  return account?.verified_at ? account : null;
}

async function tokenAccount(token: string) {
  const email = verifyIntroToken(token);
  if (!email) return null;
  const account = await getStore().getBuyerUserByEmail(email);
  return account?.verified_at ? account : null;
}

/** Chỉ giữ ngành lớn đang đăng. */
async function publishedIds(ids: unknown): Promise<string[]> {
  const allowed = new Set((await introCategories()).map((c) => c.id));
  return normalizeCategoryIds(Array.isArray(ids) ? ids : []).filter((id) => allowed.has(id));
}

async function consent(userId: string, ids: string[], source: NonNullable<BuyerIntroductions["consent_source"]>, mode: "replace" | "add" = "replace", extra: (i: BuyerIntroductions) => BuyerIntroductions = (i) => i) {
  await patchIntroductions(userId, (current) => extra(withConsent(current, ids, source, new Date(), mode)), { marketing_opt_in: true });
  revalidatePath("/buyer/account");
}

/** Trang mở từ thư: chọn ngành rồi bấm Confirm. */
export async function confirmIntroductionsWithTokenAction(token: string, categoryIds: string[], frequency: "weekly" | "twice" = "twice"): Promise<Result> {
  try {
    const account = await tokenAccount(token);
    if (!account) return { ok: false, message: "This link has expired. Sign in to choose your products." };
    const ids = await publishedIds(categoryIds);
    if (!ids.length) return { ok: false, message: "Pick at least one product." };
    await consent(account.id, ids, account.introductions?.welcome_sent_at && !account.introductions?.invite_sent_at ? "welcome" : "invite", "replace",
      (i) => ({ ...i, frequency: frequency === "weekly" ? "weekly" : "twice" }));
    return { ok: true };
  } catch (error) {
    console.error("[buyer-intro] confirm", error);
    return { ok: false, message: FAILED };
  }
}

/** "Don't ask me again" trong thư. */
export async function stopInvitesWithTokenAction(token: string): Promise<Result> {
  try {
    const account = await tokenAccount(token);
    if (!account) return { ok: false, message: "This link has expired." };
    await patchIntroductions(account.id, (current) => ({ ...current, invite_declined_at: new Date().toISOString() }));
    return { ok: true };
  } catch (error) {
    console.error("[buyer-intro] stop", error);
    return { ok: false, message: FAILED };
  }
}

/** Huỷ nhận thư giới thiệu (link "Unsubscribe" trong thư, sau khi bấm xác nhận). */
export async function unsubscribeWithTokenAction(token: string): Promise<Result> {
  try {
    const account = await tokenAccount(token);
    if (!account) return { ok: false, message: "This link has expired. Sign in to change your settings." };
    await patchIntroductions(account.id, (current) => current, { marketing_opt_in: false });
    return { ok: true };
  } catch (error) {
    console.error("[buyer-intro] unsubscribe", error);
    return { ok: false, message: FAILED };
  }
}

/** Trong tài khoản: bật/tắt và đổi ngành. */
export async function saveIntroductionsAction(optIn: boolean, categoryIds: string[], frequency: "weekly" | "twice" = "twice"): Promise<Result> {
  try {
    const account = await sessionAccount();
    if (!account) return { ok: false, message: "Please sign in again." };
    if (!optIn) {
      await patchIntroductions(account.id, (current) => current, { marketing_opt_in: false });
      revalidatePath("/buyer/account");
      return { ok: true, message: "Supplier introductions are off." };
    }
    const ids = await publishedIds(categoryIds);
    if (!ids.length) return { ok: false, message: "Pick at least one product." };
    await consent(account.id, ids, "account", "replace", (i) => ({ ...i, frequency: frequency === "weekly" ? "weekly" : "twice" }));
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("[buyer-intro] account", error);
    return { ok: false, message: FAILED };
  }
}

/** Bước chọn ngành sau khi đăng ký: Confirm (với ngành đã chọn) hoặc Skip. */
export async function finishOnboardingAction(categoryIds: string[] | null): Promise<Result> {
  try {
    const account = await sessionAccount();
    if (!account) return { ok: false, message: "Please sign in again." };
    const done = (i: BuyerIntroductions) => ({ ...i, onboarding_done_at: new Date().toISOString() });
    if (categoryIds === null) {
      await patchIntroductions(account.id, done);
      revalidatePath("/buyer/account");
      return { ok: true };
    }
    const ids = await publishedIds(categoryIds);
    if (!ids.length) return { ok: false, message: "Pick at least one product." };
    await consent(account.id, ids, "onboarding", "replace", done);
    return { ok: true };
  } catch (error) {
    console.error("[buyer-intro] onboarding", error);
    return { ok: false, message: FAILED };
  }
}

/** Lời mời đúng lúc (sau báo giá, sau khi lưu sản phẩm): "Yes" thêm đúng ngành đó; "No" thì 30 ngày không hỏi lại. */
export async function answerIntroPromptAction(categoryId: string, yes: boolean, source: "rfq" | "saved"): Promise<Result> {
  try {
    const account = await sessionAccount();
    if (!account) return { ok: false, message: "Please sign in again." };
    if (!canPromptIntroductions(account, new Date())) return { ok: true };
    if (!yes) {
      await patchIntroductions(account.id, (current) => ({ ...current, prompt_dismissed_at: new Date().toISOString() }));
      return { ok: true };
    }
    const ids = await publishedIds([categoryId]);
    if (!ids.length) return { ok: false, message: FAILED };
    await consent(account.id, ids, source, "add");
    return { ok: true, message: "Done. We'll introduce matching suppliers, up to twice a week." };
  } catch (error) {
    console.error("[buyer-intro] prompt", error);
    return { ok: false, message: FAILED };
  }
}
