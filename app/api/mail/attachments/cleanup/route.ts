import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { cleanupOrphanAttachments } from "@/lib/mail/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dọn tệp đính kèm mồ côi (đã tải lên nhưng chưa gắn email nào, cũ hơn 24 giờ).
 * Chỉ quản trị viên chạy được; upload mới cũng tự dọn định kỳ nên không cần gọi tay.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Chưa đăng nhập." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, message: "Chỉ quản trị viên được dọn tệp mồ côi." },
      { status: 403 },
    );
  }

  try {
    const res = await cleanupOrphanAttachments();
    return NextResponse.json({
      ok: true,
      ...res,
      message: res.removed
        ? `Đã xoá ${res.removed} tệp mồ côi (đã kiểm tra ${res.scanned} tệp).`
        : `Không có tệp mồ côi nào cần xoá (đã kiểm tra ${res.scanned} tệp).`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Không dọn được tệp mồ côi." },
      { status: 500 },
    );
  }
}
