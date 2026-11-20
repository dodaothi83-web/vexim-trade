/**
 * Cron dọn ảnh A+ và video tải lên cho sản phẩm mới nhưng nhà cung cấp không lưu (quá 24 giờ).
 * Được gọi gộp trong `/api/cron/rfq-sla` nên không bắt buộc tạo job riêng.
 *   - URL:     https://www.veximtrade.com/api/cron/pending-media
 *   - Headers: Authorization: Bearer <CRON_SECRET>
 */
import { NextResponse } from "next/server";

import { cleanupPendingUploads } from "@/lib/supplier-portal/pending-media";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const result = await cleanupPendingUploads();
  return NextResponse.json({ ok: true, ...result });
}
