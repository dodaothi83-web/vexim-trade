import { NextResponse } from "next/server";

import { readClick, recordClick } from "@/lib/buyer/digest-server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Link trong thư giới thiệu: đếm một lượt bấm (số tổng theo mục, không lưu ai bấm) rồi chuyển tới trang Vexim. */
export async function GET(request: Request) {
  const click = readClick(new URL(request.url).searchParams.get("d"));
  if (!click) return NextResponse.redirect(SITE_URL, 302);
  await recordClick(click).catch(() => null);
  return NextResponse.redirect(`${SITE_URL}${click.u}`, 302);
}
