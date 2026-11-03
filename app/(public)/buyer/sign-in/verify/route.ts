import { NextResponse, type NextRequest } from "next/server";

import { consumeBuyerLinkAction } from "@/app/(public)/buyer/sign-in/actions";

export const dynamic = "force-dynamic";

/**
 * Đích của LINK trong thư đăng nhập.
 *
 * Là route GET chứ không phải trang, để: (1) mở link là đăng nhập xong ngay, không cần
 * bấm thêm nút; (2) không có HTML mang token nằm trong lịch sử/cache.
 *
 * Token chỉ tiêu được một lần. Máy quét link của công ty mở trước thì người dùng nhận
 * đúng câu "link đã dùng, xin thư mới và dùng mã 6 số" — vì thế mà thư luôn có cả mã.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const next = request.nextUrl.searchParams.get("next");
  const result = await consumeBuyerLinkAction({ linkToken: token, next });

  if (result.ok && result.redirectTo) {
    return NextResponse.redirect(new URL(result.redirectTo, request.nextUrl.origin));
  }

  // Không chuyển thẳng câu lỗi qua URL dài dòng: trang đăng nhập đã có bảng câu tương ứng.
  const reason = /already used/i.test(result.message) ? "used" : /expired/i.test(result.message) ? "expired" : "invalid";
  const url = new URL("/buyer/sign-in", request.nextUrl.origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}
