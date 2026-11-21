import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { staffAplusPreview, staffAplusUpload } from "@/lib/products/aplus-staff-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nhân viên tải/xem tệp khi soạn A+ doanh nghiệp hộ nhà cung cấp. */
async function target(id: string) {
  const supplier = await getStore().getSupplier(id).catch(() => null);
  return supplier ? { supplierId: supplier.id, productId: null } : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  const t = await target((await params).supplierId);
  if (!t) return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
  return staffAplusUpload(request, t, "suppliers.manage");
}

export async function GET(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  const t = await target((await params).supplierId);
  if (!t) return new NextResponse("Not found", { status: 404 });
  return staffAplusPreview(request, t, "suppliers.view");
}
