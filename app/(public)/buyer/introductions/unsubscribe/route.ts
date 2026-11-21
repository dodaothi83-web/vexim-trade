import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { verifyIntroToken } from "@/lib/buyer/introductions-server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Huỷ nhận thư giới thiệu. POST: nút "Unsubscribe" của Gmail/Outlook (huỷ một bấm, RFC 8058).
 * GET: link trong thư mở trang xác nhận (máy quét thư mở link không tự huỷ).
 */
export async function POST(request: Request) {
  const email = verifyIntroToken(new URL(request.url).searchParams.get("t"));
  if (!email) return new NextResponse("Link expired", { status: 400 });
  const store = getStore();
  const user = await store.getBuyerUserByEmail(email).catch(() => null);
  if (user) await store.updateBuyerUser(user.id, { marketing_opt_in: false }).catch((error) => console.error("[digest] unsubscribe", error));
  return new NextResponse("Unsubscribed", { status: 200 });
}

export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(`${SITE_URL}/buyer/introductions?t=${encodeURIComponent(t)}&unsubscribe=1`, 302);
}
