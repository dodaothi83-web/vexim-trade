import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { authSecretStatus } from "@/lib/auth/secret";
import { dataStatus, getStore } from "@/lib/db";
import { supabaseKeyRole, supabaseUrl } from "@/lib/db/supabase";

export interface DiagRow {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}

/**
 * Soi nhanh cấu hình xác thực để biết vì sao bị đẩy về trang đăng nhập.
 * Hiện ở trang đăng nhập (thu gọn), không hiện trong các trang CRM.
 */
export async function authDiagnostics(): Promise<DiagRow[]> {
  const rows: DiagRow[] = [];

  // 1. Khoá ký phiên
  const secret = authSecretStatus();
  const SECRET_LABEL: Record<string, string> = {
    env: "AUTH_SECRET trong biến môi trường",
    file: "sinh tự động ở data/auth-secret",
    derived: "suy ra từ khoá Supabase (nên đặt AUTH_SECRET)",
    random: "ngẫu nhiên mỗi tiến trình — PHIÊN SẼ MẤT",
  };
  rows.push({
    label: "Khoá ký phiên",
    value: SECRET_LABEL[secret.source] ?? secret.source,
    ok: secret.source === "env" || secret.source === "file",
    hint: secret.warn ?? undefined,
  });

  // 2. Cookie phiên trong chính request này
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) {
    // Bình thường khi khách chưa đăng nhập — không tính là lỗi
    rows.push({
      label: "Cookie phiên",
      value: "chưa có (bình thường nếu bạn chưa đăng nhập)",
      ok: true,
    });
  } else {
    const payload = verifySessionToken(raw);
    rows.push({
      label: "Cookie phiên",
      value: payload ? `hợp lệ (${payload.email})` : "CÓ nhưng SAI CHỮ KÝ → bị coi là chưa đăng nhập",
      ok: Boolean(payload),
      hint: payload
        ? undefined
        : "Khoá ký phiên đã thay đổi giữa các lần chạy/máy chủ. Đặt AUTH_SECRET cố định trong biến môi trường (Vercel → Settings → " +
          "Environment Variables) rồi deploy lại; sau đó đăng nhập lại một lần.",
    });
  }

  // 3. Khoá Supabase
  const keyRole = supabaseKeyRole();
  rows.push({
    label: "Khoá Supabase của máy chủ",
    value: keyRole === "service_role" ? "service_role (bỏ qua RLS)" : keyRole === "anon" ? "anon (KHÔNG đọc được bảng bật RLS)" : keyRole === "unknown" ? "không rõ loại" : "chưa cấu hình",
    ok: keyRole === "service_role",
    hint:
      keyRole === "anon"
        ? "Thêm SUPABASE_SERVICE_ROLE_KEY vào biến môi trường của máy chủ rồi deploy lại."
        : undefined,
  });

  // 4. Chế độ dữ liệu
  try {
    const db = dataStatus();
    rows.push({
      label: "Nguồn dữ liệu",
      value:
        db.mode === "supabase"
          ? `Supabase ${db.projectRef ?? ""}`.trim()
          : db.degraded
            ? "kho local (mất kết nối Supabase)"
            : "kho local (chưa cấu hình Supabase)",
      ok: db.mode === "supabase",
      hint:
        db.mode === "supabase"
          ? undefined
          : "Máy chủ đang đọc dữ liệu từ kho local. Trên Vercel ổ đĩa chỉ đọc nên dữ liệu không lưu lại được — kiểm tra SUPABASE_URL và khoá Supabase.",
    });
  } catch (err) {
    rows.push({
      label: "Nguồn dữ liệu",
      value: `lỗi: ${err instanceof Error ? err.message : String(err)}`,
      ok: false,
    });
  }

  // 5. Đọc được bảng app_users không
  try {
    const users = await getStore().listUsers();
    rows.push({
      label: "Bảng app_users",
      value: `đọc được ${users.length} tài khoản`,
      ok: users.length > 0,
      hint:
        users.length === 0
          ? "Bảng đọc được nhưng KHÔNG thấy dòng nào — nếu bạn chắc chắn đã có tài khoản thì đây là dấu hiệu RLS đang ẩn dữ liệu (cần khoá service_role)."
          : undefined,
    });
  } catch (err) {
    rows.push({
      label: "Bảng app_users",
      value: `lỗi: ${err instanceof Error ? err.message : String(err)}`,
      ok: false,
      hint: "Chạy lại supabase/schema.sql (mục 5c tạo bảng app_users) rồi thử lại.",
    });
  }

  // 6. Supabase URL có đúng dự án không
  const url = supabaseUrl();
  rows.push({
    label: "SUPABASE_URL",
    value: url ?? "chưa cấu hình",
    ok: Boolean(url),
  });

  return rows;
}

/** true khi có ít nhất một mục cần xử lý */
export function hasProblem(rows: DiagRow[]): boolean {
  return rows.some((r) => !r.ok);
}
