"use server";

import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { guard, getSession } from "@/lib/auth/session";
import { confirmSupabaseEmail, createSupabaseUser, handOverSupabaseAccount } from "@/lib/auth/authenticate";
import { passwordProblem } from "@/lib/auth/password";
import { provisionSupplierAccount } from "@/lib/supplier-portal/provision-account";
import { handOverSupplierAccount } from "@/lib/supplier-portal/handover-account";
import { refreshCrmBadges } from "@/lib/crm/badges";

type Result = { ok: boolean; message: string };

/**
 * Nhân viên cấp tài khoản cổng NCC cho hồ sơ đã tạo sẵn trong CRM.
 * Đây là thao tác chủ động riêng, không phải hệ quả phụ của việc tạo hay công khai hồ sơ.
 */
export async function provisionSupplierAccountAction(form: FormData): Promise<Result> {
  const denied = await guard("suppliers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "reviewer")) {
    return { ok: false, message: "Chỉ quản trị và trưởng kiểm duyệt được cấp tài khoản nhà cung cấp." };
  }
  const id = String(form.get("supplier_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const email = String(form.get("email") ?? "");
  const name = String(form.get("name") ?? "");
  const secretField = "temp_password";
  const secretValue = form.get(secretField);
  const tempSecret = String(secretValue ?? "");
  try {
    const store = getStore();
    if (store.mode !== "supabase") {
      return { ok: false, message: "Chưa cấp được tài khoản khi hệ thống chưa kết nối dịch vụ đăng nhập. Báo người phụ trách kỹ thuật rồi thử lại." };
    }
    const { mode, user } = await provisionSupplierAccount(
      store,
      id,
      { email, name, tempSecret },
      { createAuthUser: createSupabaseUser, validatePassword: passwordProblem, confirmAuthUser: confirmSupabaseEmail },
    );
    await store.addAuditLog({
      actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: id,
      action: mode === "created" ? "supplier.account_provisioned" : "supplier.account_linked",
      before: { account_email: null },
      after: { account_email: user.email, user_id: user.id, mode },
    }).catch((error) => console.error("[supplier-account] audit log failed", error));
    revalidatePath(`/crm/suppliers/${id}`);
    revalidatePath("/crm/suppliers");
    refreshCrmBadges();
    return {
      ok: true,
      message: mode === "created"
        ? `Đã tạo tài khoản ${user.email} và gắn vào hồ sơ này. Hãy gửi mật khẩu tạm cho nhà cung cấp qua kênh liên hệ riêng. Nhà cung cấp đăng nhập tại trang đăng nhập chung rồi vào cổng nhà cung cấp để kiểm tra và bổ sung hồ sơ.`
        : `Đã gắn tài khoản ${user.email} vào hồ sơ này. Nhà cung cấp dùng mật khẩu đã đăng ký trước đây để đăng nhập.`,
    };
  } catch (error) {
    console.error("[supplier-account] provision failed", error);
    return { ok: false, message: error instanceof Error ? error.message : "Không cấp được tài khoản. Vui lòng thử lại." };
  }
}

/**
 * Bàn giao tài khoản cho doanh nghiệp: đổi email đăng nhập sang địa chỉ của họ và
 * đặt mật khẩu mới, không gửi thư xác nhận. Hồ sơ, giấy tờ và sản phẩm vẫn nằm
 * nguyên trên cùng một tài khoản, nên chỉ cần gửi email và mật khẩu mới là dùng được.
 */
export async function handOverSupplierAccountAction(form: FormData): Promise<Result> {
  const denied = await guard("suppliers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "reviewer")) {
    return { ok: false, message: "Chỉ quản trị và trưởng kiểm duyệt được bàn giao tài khoản nhà cung cấp." };
  }
  const id = String(form.get("supplier_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const email = String(form.get("new_email") ?? "");
  const password = String(form.get("new_password") ?? "");
  try {
    const store = getStore();
    if (store.mode !== "supabase") {
      return { ok: false, message: "Tài khoản doanh nghiệp đăng nhập qua Supabase Auth, nên chỉ bàn giao được khi hệ thống đang kết nối Supabase." };
    }
    const result = await handOverSupplierAccount(
      store, id, { email, password },
      { validatePassword: passwordProblem, handOverAuthUser: handOverSupabaseAccount },
    );
    await store.addAuditLog({
      actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: id,
      action: "supplier.account_handed_over",
      before: { account_email: result.previousEmail },
      after: { account_email: result.user.email, changed_email: result.changedEmail, password_reset: true },
    }).catch((error) => console.error("[supplier-account] audit log failed", error));
    revalidatePath(`/crm/suppliers/${id}`);
    return {
      ok: true,
      message: `Đã bàn giao tài khoản ${result.user.email}. Gửi email và mật khẩu mới cho doanh nghiệp qua kênh liên hệ riêng; họ đăng nhập được ngay, không phải xác nhận email.`,
    };
  } catch (error) {
    console.error("[supplier-account] handover failed", error);
    return { ok: false, message: error instanceof Error ? error.message : "Không bàn giao được tài khoản. Vui lòng thử lại." };
  }
}
