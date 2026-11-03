import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthSplitShell } from "@/components/auth-split-shell";
import { BuyerSignInForm } from "@/components/buyer-sign-in-form";
import { getBuyerSession } from "@/lib/auth/buyer-session";
import { safeNextPath } from "@/lib/buyer/next-path";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in · Vexim Trade",
  robots: { index: false, follow: false },
};

/** Lỗi từ route xử lý link trong thư, đổi sang câu người dùng hiểu được. */
const LINK_ERRORS: Record<string, string> = {
  used: "That sign-in link was already used. Request a new email and use the 6-digit code inside.",
  expired: "That sign-in link has expired. Request a new email.",
  invalid: "That sign-in link is not valid. Request a new email.",
};

/** Lỗi từ luồng "Continue with Google", cũng đổi sang câu người dùng hiểu được. */
const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled. You can try again, or use an email code below.",
  unverified: "That Google account has no verified email, so we cannot sign you in. Use your work email instead.",
  unavailable: "Google sign-in is not available right now. Use your work email instead.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  failed: "We could not finish signing you in with Google. Please try again, or use your work email.",
  origin: "Google sign-in was not started from Vexim Trade. Please try again from this page.",
};

export default async function BuyerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; oauth?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  // Đã đăng nhập rồi thì không bắt đăng nhập lại.
  if (await getBuyerSession()) redirect(next ?? "/");

  const error = sp.error ? LINK_ERRORS[sp.error] ?? null : null;
  const oauthError = sp.oauth ? OAUTH_ERRORS[sp.oauth] ?? null : null;

  return (
    <AuthSplitShell
      caption="Send one request, compare every quote"
      lede="Create a free account to send your request. Vexim checks the suppliers, collects their quotes and puts them side by side for you."
      points={[
        "Your contact details stay private until you choose to connect",
        "One place for every request, quote and saved product",
        "Sign in by email code. No password to remember",
      ]}
      note="Sending a request needs an account so you can come back to it, forward it to a colleague, and keep your details in one place."
    >
      <h1 className="text-[18px] font-black text-ink-900">Sign in or create your account</h1>
      <p className="mt-1 mb-5 text-[12.5px] leading-relaxed text-ink-500">
        We email you a 6-digit code. It works once and expires in 15 minutes.
      </p>

      <BuyerSignInForm next={next} initialError={error} initialOauthError={oauthError} />

      <p className="mt-6 border-t border-ink-100 pt-4 text-[12px] leading-relaxed text-ink-500">
        Selling to buyers instead?{" "}
        <Link href="/login" prefetch={false} className="font-semibold text-brand-700 underline">
          Supplier sign in
        </Link>
      </p>
    </AuthSplitShell>
  );
}
