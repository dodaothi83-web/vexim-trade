"use client";

import { PublicSignInLink } from "@/components/public-sign-in-link";
import { usePublicSession } from "@/lib/buyer/public-session-context";

/**
 * `PublicSignInLink` tự lấy trạng thái đăng nhập người mua qua /api/public/session thay vì
 * nhận từ layout server — dùng ở những nơi chỉ cần đúng icon/link tài khoản, không cần toàn
 * bộ PublicHeaderControls (ví dụ header của /blog).
 */
export function BuyerSignInStatus({ lang = "en" }: { lang?: "en" | "vi" }) {
  const { buyerEmail, buyerCompanyName } = usePublicSession();
  return <PublicSignInLink lang={lang} buyerEmail={buyerEmail} buyerCompanyName={buyerCompanyName} />;
}
