"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import {
  authenticate,
  createSupabaseUser,
  describeAppUsersError,
  isMissingUsersTable,
} from "@/lib/auth/authenticate";
import { endSession, getSession, guard, startSession } from "@/lib/auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
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
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return { ok: false, message: raw };
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
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    const hint = isMissingUsersTable(err)
      ? "Chưa có bảng app_users trong Supabase — chạy lại supabase/schema.sql rồi thử lại."
      : describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return { ok: false, message: raw };
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
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return { ok: false, message: raw };
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
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return { ok: false, message: raw };
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
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return { ok: false, message: raw };
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

/* -------- Tự đổi mật khẩu của chính người đang đăng nhập -------- */

export async function changeMyPasswordAction(
  current: string,
  password: string,
  password2: string,
): Promise<AuthResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đã hết hạn, hãy đăng nhập lại." };

  const problem = passwordProblem(password ?? "");
  if (problem) return { ok: false, message: problem };
  if (password !== password2) {
    return { ok: false, message: "Hai lần nhập mật khẩu mới không khớp." };
  }

  const store = getStore();
  const me = await store.getUserByEmail(session.email);
  if (!me) return { ok: false, message: "Không tìm thấy tài khoản của bạn." };

  // Kiểm tra mật khẩu hiện tại: so hash nội bộ nếu có; tài khoản chỉ sống bên
  // Supabase (chưa có hash nội bộ) thì xác thực qua kênh auth Supabase.
  if (me.password_hash) {
    const okCurrent = await verifyPassword(current ?? "", me.password_hash);
    if (!okCurrent) return { ok: false, message: "Mật khẩu hiện tại không đúng." };
  } else {
    const probe = await authenticate(session.email, current ?? "");
    if (!probe.ok) return { ok: false, message: "Mật khẩu hiện tại không đúng." };
  }

  try {
    await store.updateUser(me.id, { password_hash: await hashPassword(password) });
    const alsoSupabase = await updateSupabasePasswordSilent(me.email, password);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: alsoSupabase
        ? "Đã đổi mật khẩu (cả Supabase và mật khẩu nội bộ)."
        : "Đã đổi mật khẩu nội bộ. (Chưa đổi được bên Supabase — không kết nối được.)",
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return { ok: false, message: raw };
  }
}

/* -------- Chữ ký email cá nhân (kiểu Gmail/Zoho: mỗi người tự sửa) -------- */

const MAX_SIGNATURE_CHARS = 8000;

/**
 * Lưu chữ ký của chính người đang đăng nhập.
 * - html = chuỗi HTML chữ ký tuỳ chỉnh ("" = không dùng chữ ký).
 * - html = null => xoá chữ ký tuỳ chỉnh, quay lại chữ ký tự động của hệ thống.
 */
export async function saveMySignatureAction(html: string | null): Promise<AuthResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đã hết hạn, hãy đăng nhập lại." };
  if (html !== null && html.length > MAX_SIGNATURE_CHARS) {
    return { ok: false, message: `Chữ ký quá dài (tối đa ${MAX_SIGNATURE_CHARS.toLocaleString("vi-VN")} ký tự).` };
  }
  const store = getStore();
  const me = await store.getUserByEmail(session.email);
  if (!me) return { ok: false, message: "Không tìm thấy tài khoản của bạn." };
  try {
    await store.updateUser(me.id, { signature_html: html });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    return {
      ok: false,
      message:
        "Không lưu được chữ ký. Nếu dùng Supabase, hãy chạy câu ALTER thêm cột signature_html trong supabase/schema.sql (mục 5c).",
      details: ["Lỗi gốc: " + raw],
    };
  }
  revalidatePath("/mail/compose");
  return {
    ok: true,
    message:
      html === null
        ? "Đã xoá chữ ký tuỳ chỉnh — quay lại chữ ký tự động."
        : "Đã lưu chữ ký của bạn. Thư soạn mới sẽ dùng chữ ký này.",
  };
}

/* -------- Sửa thông tin tài khoản của chính mình (tên, email) -------- */

const MAX_NAME_CHARS = 80;

/**
 * Đổi tên hiển thị và/hoặc email của người đang đăng nhập.
 * - Đổi email bắt buộc nhập mật khẩu hiện tại.
 * - Đổi tên sẽ chuyển luôn buyer/prospect đang phụ trách theo tên cũ sang tên mới,
 *   vì phụ trách đang lưu bằng tên hiển thị.
 * - Đổi email đồng bộ cả Supabase Auth (nếu tài khoản có ở đó) để vẫn đăng nhập được.
 */
export async function updateMyProfileAction(input: {
  name: string;
  email: string;
  currentPassword?: string;
}): Promise<AuthResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đã hết hạn, hãy đăng nhập lại." };

  const name = (input.name ?? "").trim().replace(/\s+/g, " ");
  const email = (input.email ?? "").trim().toLowerCase();
  if (!name) return { ok: false, message: "Vui lòng nhập tên hiển thị." };
  if (name.length > MAX_NAME_CHARS) {
    return { ok: false, message: `Tên tối đa ${MAX_NAME_CHARS} ký tự.` };
  }
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Email không hợp lệ." };

  const store = getStore();
  const me = await store.getUserByEmail(session.email);
  if (!me) return { ok: false, message: "Không tìm thấy tài khoản của bạn." };

  const oldName = (me.name ?? "").trim();
  const oldEmail = me.email.trim().toLowerCase();
  const nameChanged = name !== oldName;
  const emailChanged = email !== oldEmail;
  if (!nameChanged && !emailChanged) return { ok: true, message: "Không có thay đổi nào." };

  const users = await store.listUsers();
  if (emailChanged && users.some((u) => u.id !== me.id && u.email.trim().toLowerCase() === email)) {
    return { ok: false, message: "Email này đã được dùng bởi tài khoản khác." };
  }
  // Phụ trách buyer/prospect lưu theo tên, nên tên không được trùng với người khác
  if (
    nameChanged &&
    users.some(
      (u) =>
        u.id !== me.id &&
        u.is_active &&
        (u.name ?? "").trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    return {
      ok: false,
      message: "Tên này đã có người khác dùng. Hãy thêm chữ để phân biệt (ví dụ thêm tên đệm hoặc chức danh).",
    };
  }

  if (emailChanged) {
    const current = input.currentPassword ?? "";
    if (!current) return { ok: false, message: "Nhập mật khẩu hiện tại để đổi email." };
    if (me.password_hash) {
      if (!(await verifyPassword(current, me.password_hash))) {
        return { ok: false, message: "Mật khẩu hiện tại không đúng." };
      }
    } else {
      const probe = await authenticate(oldEmail, current);
      if (!probe.ok) return { ok: false, message: "Mật khẩu hiện tại không đúng." };
    }
  }

  const { updateSupabaseEmail } = await import("@/lib/auth/authenticate");
  if (emailChanged) {
    const sb = await updateSupabaseEmail(oldEmail, email);
    if (sb === "error") {
      return {
        ok: false,
        message: "Không đổi được email bên Supabase Auth, chưa thay đổi gì. Thử lại sau.",
      };
    }
  }

  try {
    await store.updateUser(me.id, { name, email: emailChanged ? email : me.email });
  } catch (err) {
    if (emailChanged) await updateSupabaseEmail(email, oldEmail).catch(() => "error" as const);
    const raw = err instanceof Error ? err.message : "Lỗi không xác định";
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return { ok: false, message: raw };
  }

  let moved = 0;
  if (nameChanged && oldName) {
    moved = await renameOwnerEverywhere(oldName, name);
  }

  // Cấp lại phiên với tên/email mới để giao diện và phân quyền khớp ngay
  const { exp: _exp, ...rest } = session;
  void _exp;
  await startSession({ ...rest, email: emailChanged ? email : session.email, name });

  revalidatePath("/", "layout");
  const notes: string[] = [];
  if (nameChanged && moved > 0) notes.push(`đã chuyển ${moved} buyer/khách hàng mục tiêu sang tên mới`);
  return {
    ok: true,
    message: ["Đã cập nhật thông tin tài khoản", ...notes].join("; ") + ".",
  };
}

/** Đổi tên phụ trách trên toàn bộ buyer và prospect đang dùng tên cũ. Trả về số bản ghi đã đổi. */
async function renameOwnerEverywhere(oldName: string, newName: string): Promise<number> {
  const store = getStore();
  const key = oldName.trim().toLowerCase();
  const matches = (owner: string | null | undefined) => (owner ?? "").trim().toLowerCase() === key;
  let count = 0;
  for (const b of await store.listBuyers()) {
    if (matches(b.owner)) {
      await store.updateBuyer(b.id, { owner: newName });
      count += 1;
    }
  }
  for (const p of await store.listProspects()) {
    if (matches(p.owner)) {
      await store.updateProspect(p.id, { owner: newName });
      count += 1;
    }
  }
  return count;
}
