import { NextResponse } from "next/server";

import { getBuyerSession, getBuyerUser } from "@/lib/auth/buyer-session";
import { googleOneTapClientId, hasOneTapSession } from "@/lib/auth/google-one-tap";

export const runtime = "nodejs";

/**
 * Trạng thái cá nhân hoá của phần công khai (header đăng nhập, Google One Tap).
 *
 * Trước đây app/(public)/layout.tsx đọc cookie (getBuyerSession/hasOneTapSession) NGAY
 * lúc render layout — việc đó buộc Next.js coi TOÀN BỘ trang công khai là render động
 * (force-dynamic), nên không trang nào cache/ISR được. Giờ layout render tĩnh (ISR), còn
 * phần hiển thị theo từng người dùng (avatar đăng nhập ở header, gợi ý Google One Tap)
 * do client tự gọi route này SAU khi trang đã hiển thị — đúng tinh thần "cá nhân hoá sau
 * khi render" thay vì "chặn render để cá nhân hoá".
 *
 * `no-store`: đây là dữ liệu riêng theo cookie của từng trình duyệt, không được cache chung.
 */
export async function GET() {
  const buyerSession = await getBuyerSession();
  const buyerAccount = buyerSession ? await getBuyerUser().catch(() => null) : null;
  const oneTapClientId = googleOneTapClientId();
  const showOneTap = Boolean(oneTapClientId) && !buyerSession && !(await hasOneTapSession());

  return NextResponse.json(
    {
      buyerEmail: buyerSession?.email ?? null,
      buyerCompanyName: buyerAccount?.company_name ?? null,
      oneTapClientId,
      showOneTap,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
