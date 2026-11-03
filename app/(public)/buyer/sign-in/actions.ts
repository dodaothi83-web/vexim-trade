"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { checkAuthRateLimit } from "@/lib/auth/abuse-protection";
import { endBuyerSession, startBuyerSession } from "@/lib/auth/buyer-session";
import {
  buyerSignInUrl,
  isDeliverableEmail,
  issueSignInToken,
  MAX_CODE_ATTEMPTS,
  normalizeBuyerEmail,
  SIGN_IN_TTL_MS,
  verifySignInCode,
  verifySignInLink,
} from "@/lib/buyer/sign-in-token";
import { getStore } from "@/lib/db";
import { sendBuyerSignInEmail } from "@/lib/email/buyer-auth";
import { verifyFormChallenge } from "@/lib/security/challenge";
import { safeNextPath } from "@/lib/buyer/next-path";
import { SITE_URL } from "@/lib/site";

/**
 * Đăng nhập của người mua — không mật khẩu.
 *
 * Đăng ký và đăng nhập là CÙNG một bước: email chưa có thì tự tạo tài khoản khi mã/link
 * được dùng. Vì vậy phản hồi của bước "xin thư" luôn giống nhau, không tiết lộ email nào
 * đã có tài khoản.
 */

export interface BuyerSignInActionResult {
  ok: boolean;
  message: string;
  /** Chỉ để hiện lại đúng email người dùng vừa gõ khi phải nhập mã. */
  email?: string;
}

const GENERIC_SENT =
  "If that address can receive email, a sign-in code is on its way. It expires in 15 minutes.";

export async function requestBuyerSignInAction(input: {
  email: string;
  challengeToken?: string | null;
  next?: string | null;
}): Promise<BuyerSignInActionResult> {
  const email = normalizeBuyerEmail(input.email ?? "");
  if (!isDeliverableEmail(email)) {
    return { ok: false, message: "Enter a valid email address so we can send your code." };
  }

  // Challenge chống bot trước, rồi mới tới giới hạn lượt: một form bị đăng ký tự động
  // không được phép tiêu hạn mức của người thật.
  const challenge = verifyFormChallenge({ purpose: "buyer-sign-in", token: input.challengeToken ?? null });
  if (!challenge.ok) {
    return {
      ok: false,
      message: challenge.reason === "expired" || challenge.reason === "replayed"
        ? "The security check expired. Please try again."
        : "We could not verify the security check. Please try again.",
    };
  }

  const rate = await checkAuthRateLimit({ flow: "buyer-sign-in", headers: await headers(), email });
  if (rate.status === "limited") {
    return { ok: false, message: "Too many attempts. Please wait a few minutes and try again." };
  }
  // Redis hỏng thì vẫn gửi: đây là đường đăng nhập, không thể chặn người thật vì
  // hạ tầng phụ. Challenge PoW và giới hạn cục bộ vẫn đang canh.

  const { linkToken, code } = await issueSignInToken(email);
  const next = safeNextPath(input.next);
  const mail = await sendBuyerSignInEmail({
    email,
    linkUrl: `${SITE_URL}${buyerSignInUrl(linkToken, next)}`,
    code,
    minutes: Math.round(SIGN_IN_TTL_MS / 60_000),
  });

  if (!mail.ok && mail.status === "failed") {
    // Không nói chi tiết lỗi hạ tầng ra ngoài; nhân viên xem log.
    console.error("[buyer-sign-in] send failed", mail.error);
    return { ok: false, message: "We could not send the email just now. Please try again in a minute." };
  }

  return { ok: true, message: GENERIC_SENT, email };
}

export interface BuyerVerifyResult {
  ok: boolean;
  message: string;
  redirectTo?: string;
}

async function finishSignIn(email: string, next: string | null): Promise<BuyerVerifyResult> {
  const store = getStore();
  // Email chưa có tài khoản thì tạo ngay tại đây: đăng ký và đăng nhập là một bước.
  // `Tên công ty` sẽ hỏi sau, và điền sẵn từ hồ sơ CRM nếu người này đã từng gửi yêu cầu.
  let account = await store.getBuyerUserByEmail(email);
  if (!account) {
    const knownBuyer = await store.getBuyerByEmail(email).catch(() => null);
    account = await store.createBuyerUser({
      email,
      company_name: knownBuyer?.company?.trim() || null,
      verified_at: new Date().toISOString(),
    });
  } else if (!account.verified_at) {
    account = await store.updateBuyerUser(account.id, { verified_at: new Date().toISOString() });
  }
  await store.updateBuyerUser(account.id, { last_seen_at: new Date().toISOString() }).catch(() => null);

  await startBuyerSession({ uid: account.id, email: account.email });
  // `/my` được dựng ở bước 5; trong lúc chờ, đích mặc định là trang chủ công khai.
  return { ok: true, message: "Signed in.", redirectTo: safeNextPath(next) ?? "/" };
}

export async function verifyBuyerCodeAction(input: {
  email: string;
  code: string;
  next?: string | null;
}): Promise<BuyerVerifyResult> {
  const email = normalizeBuyerEmail(input.email ?? "");
  const result = await verifySignInCode(email, input.code ?? "");
  if (!result.ok) {
    const message =
      result.reason === "too_many_attempts"
        ? "Too many wrong codes. Request a new one and use it within 15 minutes."
        : result.reason === "no_token"
          ? "That code is no longer valid. Request a new one."
          : result.reason === "used"
            ? "That code was already used. Request a new one."
            : `Check the code and try again. You have ${MAX_CODE_ATTEMPTS} tries before it expires.`;
    return { ok: false, message };
  }
  return finishSignIn(result.email, safeNextPath(input.next));
}

/** Dùng cho link trong thư: route `/buyer/sign-in/verify` gọi hàm này rồi chuyển trang. */
export async function consumeBuyerLinkAction(input: {
  linkToken: string;
  next?: string | null;
}): Promise<BuyerVerifyResult> {
  const result = await verifySignInLink(input.linkToken);
  if (!result.ok) {
    const message =
      result.reason === "used"
        ? "This sign-in link was already used. If it was opened by your email scanner, request a new email and use the code inside."
        : result.reason === "expired"
          ? "This sign-in link has expired. Request a new email."
          : "This sign-in link is not valid. Request a new email.";
    return { ok: false, message };
  }
  return finishSignIn(result.email, safeNextPath(input.next));
}

export async function signOutBuyerAction(): Promise<void> {
  await endBuyerSession();
  redirect("/");
}
