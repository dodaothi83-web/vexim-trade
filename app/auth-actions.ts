"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { authenticate, createSupabaseUser } from "@/lib/auth/authenticate";
import { endSession, getSession, guard, startSession } from "@/lib/auth/session";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types";

export interface AuthResult {
  ok: boolean;
  message: string;
  details?: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRole(value: unknown): value is UserRole {
  return ROLES.some((r) => r.value === value);
}

/* ------------------------------ ĐĂNG NHẬP ------------------------------ */

export async function loginAction(email: string, password: string): Promise<AuthResult> {
  const clean = (email ?? "").trim();
  if (!EMAIL_RE.test(clean)) return { ok: false, message: "Email không hợp lệ." };
  if (!password) return { ok: false, message: "Chưa nhập mật khẩu." };

  let result;
  try {
    result = await authenticate(clean, password);
  } catch (err) {
    return {
      ok: false,
      message: "Không đăng nhập được.",
      details: [err instanceof Error ? err.message : String(err)],
    };
  }

  if (!result.ok) return { ok: false, message: result.message, details: result.details };

  await startSession({
    uid: result.user.id,
    email: result.user.email,
    name: result.user.name ?? result.user.email,
    role: result.user.role,
    via: result.via,
  });

  try {
    await getStore().touchUserLogin(result.user.id);
  } catch {
    /* không quan trọng */
  }

  revalidatePath("/", "layout");
  return { ok: true, message: result.notice ?? "Đăng nhập thành công." };
}

export async function logoutAction(): Promise<void> {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/login");
}

/* ------------------- THIẾT LẬP TÀI KHOẢN QUẢN TRỊ ĐẦU TIÊN ------------------- */

export async function setupAdminAction(
  email: string,
  name: string,
  password: string,
  password2: string,
): Promise<AuthResult> {
  const store = getStore();

  const existing = await store.countUsers();
  if (existing > 0) {
    return { ok: false, message: "Hệ thống đã có tài khoản — hãy đăng nhập." };
  }

  const clean = (email ?? "").trim();
  if (!EMAIL_RE.test(clean)) return { ok: false, message: "Email không hợp lệ." };
  const problem = passwordProblem(password ?? "");
  if (problem) return { ok: false, message: problem };
  if (password !== password2) return { ok: false, message: "Hai lần nhập mật khẩu không khớp." };

  const details: string[] = [];
  const supabaseId = await createSupabaseUser(clean, password);
  if (!supabaseId) {
    details.push(
      "Chưa tạo được tài khoản bên Supabase Auth (không kết nối được hoặc email đã tồn tại). " +
        "Tài khoản nội bộ vẫn dùng được ngay; khi có mạng hãy tạo lại bên Supabase ở Cài đặt → Người dùng.",
    );
  }

  try {
    const created = await store.createUser({
      email: clean,
      name: (name ?? "").trim() || null,
      role: "admin",
      auth_provider: supabaseId ? "supabase" : "local",
      password_hash: await hashPassword(password),
      is_active: true,
    });

    await startSession({
      uid: created.id,
      email: created.email,
      name: created.name ?? created.email,
      role: created.role,
      via: supabaseId ? "supabase" : "local",
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Đã tạo tài khoản quản trị và đăng nhập.", details };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/* ------------------------- QUẢN LÝ NGƯỜI DÙNG ------------------------- */

export async function createUserAction(input: {
  email: string;
  name?: string;
  role: UserRole;
  password: string;
  alsoSupabase?: boolean;
}): Promise<AuthResult> {
  const gate = await guard("users.manage");
  if (gate) return gate;

  const clean = (input.email ?? "").trim();
  if (!EMAIL_RE.test(clean)) return { ok: false, message: "Email không hợp lệ." };
  if (!isRole(input.role)) return { ok: false, message: "Vai trò không hợp lệ." };
  const problem = passwordProblem(input.password ?? "");
  if (problem) return { ok: false, message: problem };

  const store = getStore();
  const existing = await store.getUserByEmail(clean);
  if (existing) return { ok: false, message: `Email ${clean} đã có tài khoản.` };

  const details: string[] = [];
  let supabaseId: string | null = null;
  if (input.alsoSupabase !== false) {
    supabaseId = await createSupabaseUser(clean, input.password);
    if (!supabaseId) {
      details.push(
        "Chưa tạo được tài khoản bên Supabase Auth (không kết nối được, hoặc Supabase chưa có user này). " +
          "Tài khoản nội bộ đã tạo xong và dùng được ngay.",
      );
    }
  }

  try {
    await store.createUser({
      email: clean,
      name: (input.name ?? "").trim() || null,
      role: input.role,
      auth_provider: supabaseId ? "supabase" : "local",
      password_hash: await hashPassword(input.password),
      is_active: true,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `Đã tạo tài khoản ${clean}.`, details };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function updateUserAction(
  id: string,
  patch: { name?: string | null; role?: UserRole; is_active?: boolean },
): Promise<AuthResult> {
  const gate = await guard("users.manage");
  if (gate) return gate;

  const store = getStore();
  const target = await store.getUser(id);
  if (!target) return { ok: false, message: "Không tìm thấy tài khoản." };

  const session = await getSession();
  if (patch.role && !isRole(patch.role)) return { ok: false, message: "Vai trò không hợp lệ." };

  // Không cho tự hạ quyền / tự khoá chính mình
  if (session?.uid === id) {
    if (patch.role && patch.role !== "admin") {
      return { ok: false, message: "Không thể tự hạ quyền quản trị của chính mình." };
    }
    if (patch.is_active === false) {
      return { ok: false, message: "Không thể tự khoá tài khoản đang đăng nhập." };
    }
  }

  // Luôn phải còn ít nhất một quản trị viên đang hoạt động
  const losingAdmin =
    target.role === "admin" && (patch.role && patch.role !== "admin" || patch.is_active === false);
  if (losingAdmin) {
    const users = await store.listUsers();
    const activeAdmins = users.filter(
      (u) => u.role === "admin" && u.is_active && u.id !== id,
    ).length;
    if (activeAdmins === 0) {
      return { ok: false, message: "Hệ thống cần ít nhất một quản trị viên đang hoạt động." };
    }
  }

  try {
    await store.updateUser(id, patch);
    revalidatePath("/", "layout");
    return { ok: true, message: "Đã cập nhật tài khoản." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

export async function resetUserPasswordAction(
  id: string,
  password: string,
  password2: string,
): Promise<AuthResult> {
  const gate = await guard("users.manage");
  if (gate) return gate;

  const problem = passwordProblem(password ?? "");
  if (problem) return { ok: false, message: problem };
  if (password !== password2) return { ok: false, message: "Hai lần nhập mật khẩu không khớp." };

  const store = getStore();
  const target = await store.getUser(id);
  if (!target) return { ok: false, message: "Không tìm thấy tài khoản." };

  try {
    await store.updateUser(id, { password_hash: await hashPassword(password) });
    const alsoSupabase = await updateSupabasePasswordSilent(target.email, password);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: alsoSupabase
        ? "Đã đổi mật khẩu (cả Supabase và mật khẩu nội bộ)."
        : "Đã đổi mật khẩu nội bộ. (Chưa đổi được bên Supabase — không kết nối được.)",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

async function updateSupabasePasswordSilent(email: string, password: string): Promise<boolean> {
  const { updateSupabasePassword } = await import("@/lib/auth/authenticate");
  return updateSupabasePassword(email, password);
}

export async function deleteUserAction(id: string): Promise<AuthResult> {
  const gate = await guard("users.manage");
  if (gate) return gate;

  const session = await getSession();
  if (session?.uid === id) return { ok: false, message: "Không thể xoá tài khoản đang đăng nhập." };

  const store = getStore();
  const target = await store.getUser(id);
  if (!target) return { ok: false, message: "Không tìm thấy tài khoản." };

  if (target.role === "admin") {
    const users = await store.listUsers();
    const otherAdmins = users.filter((u) => u.role === "admin" && u.id !== id).length;
    if (otherAdmins === 0) {
      return { ok: false, message: "Hệ thống cần ít nhất một quản trị viên." };
    }
  }

  try {
    await store.deleteUser(id);
    revalidatePath("/", "layout");
    return { ok: true, message: `Đã xoá tài khoản ${target.email}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định" };
  }
}

/* -------- Đặt mật khẩu dự phòng cho tài khoản chỉ có bên Supabase -------- */

export async function setLocalPasswordAction(
  id: string,
  password: string,
  password2: string,
): Promise<AuthResult> {
  return resetUserPasswordAction(id, password, password2);
}
