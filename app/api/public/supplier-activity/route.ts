import { NextRequest, NextResponse } from "next/server";

import { presenceKey, readPresence } from "@/lib/chat/presence";
import { getStore } from "@/lib/db";
import { listCachedPublicSuppliers } from "@/lib/public/product-catalog";
import { supplierActivity } from "@/lib/public/supplier-activity";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";

export const runtime = "nodejs";

/**
 * Mốc hoạt động của một nhà cung cấp đang công khai. Trang hồ sơ và trang sản phẩm là trang dựng sẵn
 * (ISR 1 giờ), nên nhãn được hỏi riêng ở trình duyệt. Chỉ trả mốc ("online", "day"...), không trả
 * giờ chính xác; nhà cung cấp chưa công khai, hồ sơ thử hoặc quá 30 ngày thì trả null.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const none = () => NextResponse.json({ activity: null }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return none();
  try {
    const supplier = (await listCachedPublicSuppliers()).find((s) => s.id === id);
    if (!supplier || isSyntheticSupplier(supplier)) return none();
    const key = presenceKey.supplier(supplier.id);
    const seen = (await readPresence(getStore(), [key]))[key];
    return NextResponse.json({ activity: supplierActivity(seen) },
      // CDN giữ 1 phút: đủ mới cho "Online now", không để mỗi lượt xem đều đọc cơ sở dữ liệu.
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch (error) {
    console.error("[supplier-activity]", error instanceof Error ? error.message : error);
    return none();
  }
}
