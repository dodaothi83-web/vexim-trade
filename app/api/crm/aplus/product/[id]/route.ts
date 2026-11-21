import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { staffAplusPreview, staffAplusUpload } from "@/lib/products/aplus-staff-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nhân viên tải/xem tệp khi soạn A+ hộ nhà cung cấp cho một sản phẩm. */
async function target(id: string) {
  const product = await getStore().getProduct(id).catch(() => null);
  return product?.supplier_id ? { supplierId: product.supplier_id, productId: product.id } : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await target((await params).id);
  if (!t) return NextResponse.json({ ok: false, message: "Không tìm thấy sản phẩm." }, { status: 404 });
  return staffAplusUpload(request, t, "products.manage");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await target((await params).id);
  if (!t) return new NextResponse("Not found", { status: 404 });
  return staffAplusPreview(request, t, "products.view");
}
