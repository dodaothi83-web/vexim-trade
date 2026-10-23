import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { isPushId, recordPushEvent } from "@/lib/sponsored/events";

export const runtime = "nodejs";

/**
 * Nhận lượt hiển thị và lượt mở thẻ của vùng đẩy sản phẩm.
 *
 * Cửa vào cố tình hẹp: cùng nguồn gốc, đúng kiểu JSON, thân nhỏ, không nhận máy
 * tìm kiếm và không nhận người đang đăng nhập (nhân viên mở trang để kiểm tra thì
 * không phải lượt hiển thị bán được). Mọi trường hợp bị từ chối đều trả 204 để
 * không ai dò được gói nào đang chạy.
 */
export async function POST(request: NextRequest) {
  let sameOrigin = false;
  try {
    sameOrigin = new URL(request.headers.get("origin") || "").host === request.headers.get("host");
  } catch { /* Origin thiếu hoặc sai định dạng. */ }
  if (!sameOrigin || !request.headers.get("content-type")?.startsWith("application/json") ||
    Number(request.headers.get("content-length") || 0) > 600) return new NextResponse(null, { status: 403 });

  const userAgent = request.headers.get("user-agent") || "";
  if (!userAgent || /bot|crawler|spider|preview|lighthouse|headless|curl|wget/i.test(userAgent) ||
    await getSession()) return new NextResponse(null, { status: 204 });

  let pushId: unknown;
  let event: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 600) return new NextResponse(null, { status: 413 });
    ({ pushId, event } = JSON.parse(raw));
  } catch { return new NextResponse(null, { status: 400 }); }

  if (event !== "impression" && event !== "click") return new NextResponse(null, { status: 400 });
  if (!isPushId(pushId)) return new NextResponse(null, { status: 400 });

  try {
    await recordPushEvent(pushId, event);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("sponsored push metric unavailable", error);
    return new NextResponse(null, { status: 503 });
  }
}
