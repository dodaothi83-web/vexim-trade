import { NextResponse } from "next/server";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import { fieldsFor } from "@/lib/product-attributes";
import { buildTemplateWorkbook, workbookToBuffer } from "@/lib/products/excel-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tải file mẫu Excel sinh theo cấu hình thuộc tính của một danh mục. */
export async function GET(request: Request) {
  const gate = await guard("products.manage");
  if (gate) return NextResponse.json({ ok: false, message: gate.message }, { status: 403 });

  const slug = new URL(request.url).searchParams.get("category")?.trim();
  if (!slug) return NextResponse.json({ ok: false, message: "Thiếu danh mục." }, { status: 400 });
  const category = await getStore().getCategoryBySlug(slug);
  if (!category) return NextResponse.json({ ok: false, message: "Không tìm thấy danh mục." }, { status: 404 });

  const buffer = workbookToBuffer(buildTemplateWorkbook(fieldsFor(category)));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-san-pham-${slug}.xlsx"`,
    },
  });
}
