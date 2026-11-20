import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getObject } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Nhân viên xem ảnh nội dung A+ trong CRM, kể cả khi sản phẩm chưa đăng. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !hasPermission(session.role, "products.view")) return new NextResponse("Not found", { status: 404 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  // Ảnh A+ sản phẩm (aplus/<nhà cung cấp>/<sản phẩm>/) và A+ doanh nghiệp (aplus/<nhà cung cấp>/company/).
  if (!/^aplus\/[a-f0-9-]{36}\/(?:[a-f0-9-]{36}|company)\/[a-f0-9-]{36}\.(jpe?g|png|webp)$/i.test(path)) return new NextResponse("Not found", { status: 404 });
  if (path.split("/")[2] === "company" && !hasPermission(session.role, "suppliers.view")) return new NextResponse("Not found", { status: 404 });
  const object = await getObject(path).catch(() => null);
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!object || !mime) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(object.data as unknown as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
