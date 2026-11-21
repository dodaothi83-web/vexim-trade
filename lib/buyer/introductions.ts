/**
 * Người mua nhận giới thiệu nhà cung cấp (đợt 1): quy tắc dùng chung, tệp thuần để script kiểm tra
 * nạp thẳng bằng Node. Công tắc là `marketing_opt_in`; ngành hàng lưu theo mã ngành (đọc từ bảng
 * categories nên thêm ngành không phải sửa code). Chỉ tính là đồng ý khi người mua tự bấm.
 */
import type { BuyerIntroductions, BuyerUser } from "../types.ts";

export const INTRO_MAX_CATEGORIES = 30;
/** Nhắc thư mời sau 14 ngày nếu chưa bấm, tối đa một lần. */
export const INTRO_REMINDER_DAYS = 14;
/** Bấm "No" ở lời mời đúng lúc: 30 ngày không hỏi lại. */
export const INTRO_PROMPT_COOLDOWN_DAYS = 30;
/** Thư chào mừng gửi khoảng 1 ngày sau khi đăng ký (nếu người mua chưa chọn ngành trên trang). */
export const INTRO_WELCOME_DELAY_HOURS = 24;
/** Thư chào mừng chỉ cho tài khoản tạo từ ngày này; người mua cũ nhận thư mời do nhân viên gửi. */
export const INTRO_WELCOME_SINCE = "2026-11-22T00:00:00Z";
/** Trong thư hiện tối đa ngần này ngành; trang chọn ngành hiện đủ. */
export const INTRO_EMAIL_MAX_CATEGORIES = 8;

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCES = new Set(["invite", "welcome", "account", "onboarding", "rfq", "saved"]);
const DATES = ["consent_at", "invite_sent_at", "invite_reminded_at", "invite_declined_at", "welcome_sent_at", "onboarding_done_at", "prompt_dismissed_at"] as const;

export function readIntroductions(raw: unknown): BuyerIntroductions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  const out: BuyerIntroductions = {};
  if (Array.isArray(value.categories)) out.categories = normalizeCategoryIds(value.categories);
  for (const key of DATES) if (typeof value[key] === "string" && !Number.isNaN(Date.parse(value[key] as string))) out[key] = value[key] as string;
  if (typeof value.consent_source === "string" && SOURCES.has(value.consent_source)) out.consent_source = value.consent_source as BuyerIntroductions["consent_source"];
  return out;
}

export function normalizeCategoryIds(list: unknown[]): string[] {
  return [...new Set(list.filter((id): id is string => typeof id === "string" && UUID.test(id)).map((id) => id.toLowerCase()))].slice(0, INTRO_MAX_CATEGORIES);
}

/** Người mua đang nhận giới thiệu: đã bật và có ít nhất một ngành. */
export function receivesIntroductions(user: Pick<BuyerUser, "marketing_opt_in" | "introductions" | "verified_at">): boolean {
  return !!user.verified_at && user.marketing_opt_in && (readIntroductions(user.introductions).categories?.length ?? 0) > 0;
}

/** Lưu đồng ý: bật công tắc, gộp (hoặc thay) ngành hàng, ghi thời điểm và nguồn. */
export function withConsent(current: BuyerIntroductions, categories: string[], source: NonNullable<BuyerIntroductions["consent_source"]>, now: Date, mode: "replace" | "add" = "replace"): BuyerIntroductions {
  const picked = normalizeCategoryIds(categories);
  const next = mode === "add" ? normalizeCategoryIds([...(current.categories ?? []), ...picked]) : picked;
  return { ...current, categories: next, consent_at: now.toISOString(), consent_source: source };
}

/** Có nên hỏi người mua (lời mời đúng lúc): chưa nhận giới thiệu, chưa từ chối, không trong 30 ngày sau khi bấm "No". */
export function canPromptIntroductions(user: Pick<BuyerUser, "marketing_opt_in" | "introductions" | "verified_at">, now: Date): boolean {
  if (receivesIntroductions(user)) return false;
  const intro = readIntroductions(user.introductions);
  if (intro.invite_declined_at) return false;
  if (intro.prompt_dismissed_at && now.getTime() - Date.parse(intro.prompt_dismissed_at) < INTRO_PROMPT_COOLDOWN_DAYS * DAY) return false;
  return true;
}

/** Bước chọn ngành trên trang tài khoản (ngay sau khi đăng ký): một lần, bấm Skip là thôi. */
export function showOnboarding(user: Pick<BuyerUser, "marketing_opt_in" | "introductions" | "verified_at">): boolean {
  const intro = readIntroductions(user.introductions);
  return !!user.verified_at && !receivesIntroductions(user) && !intro.onboarding_done_at && !intro.invite_declined_at;
}

/** Thư mời nhân viên gửi: người mua đã xác thực, chưa nhận giới thiệu, chưa từ chối, chưa được mời. */
export function inviteEligible(user: Pick<BuyerUser, "marketing_opt_in" | "introductions" | "verified_at">): boolean {
  const intro = readIntroductions(user.introductions);
  return !!user.verified_at && !receivesIntroductions(user) && !intro.invite_declined_at && !intro.invite_sent_at;
}

/** Thư nhắc: mời đã 14 ngày, chưa nhắc, vẫn chưa nhận giới thiệu, chưa từ chối. */
export function reminderDue(user: Pick<BuyerUser, "marketing_opt_in" | "introductions" | "verified_at">, now: Date): boolean {
  const intro = readIntroductions(user.introductions);
  return !!user.verified_at && !receivesIntroductions(user) && !intro.invite_declined_at && !!intro.invite_sent_at && !intro.invite_reminded_at &&
    now.getTime() - Date.parse(intro.invite_sent_at) >= INTRO_REMINDER_DAYS * DAY;
}

/** Thư chào mừng: tài khoản mới (từ ngày ra mắt), đã xác thực, đăng ký được 24 giờ, chưa gửi. */
export function welcomeDue(user: Pick<BuyerUser, "marketing_opt_in" | "introductions" | "verified_at" | "created_at">, now: Date): boolean {
  const intro = readIntroductions(user.introductions);
  return !!user.verified_at && !intro.welcome_sent_at && Date.parse(user.created_at) >= Date.parse(INTRO_WELCOME_SINCE) &&
    now.getTime() - Date.parse(user.created_at) >= INTRO_WELCOME_DELAY_HOURS * 3_600_000;
}

/** Thư chào mừng có kèm lời mời không: chỉ khi chưa nhận giới thiệu và chưa từ chối (tính là lần mời). */
export function welcomeIncludesInvite(user: Pick<BuyerUser, "marketing_opt_in" | "introductions" | "verified_at">): boolean {
  return !receivesIntroductions(user) && !readIntroductions(user.introductions).invite_declined_at;
}

/**
 * Ngành hiện trong thư: ngành người mua đã liên quan (ví dụ ngành của yêu cầu báo giá) lên đầu,
 * rồi ngành nhiều sản phẩm nhất; tối đa INTRO_EMAIL_MAX_CATEGORIES.
 */
export function emailCategories<T extends { id: string; products: number }>(all: T[], preferred: string[] = []): T[] {
  const first = preferred.map((id) => all.find((c) => c.id === id)).filter((c): c is T => !!c);
  const rest = all.filter((c) => !preferred.includes(c.id)).sort((a, b) => b.products - a.products);
  return [...first, ...rest].slice(0, INTRO_EMAIL_MAX_CATEGORIES);
}
