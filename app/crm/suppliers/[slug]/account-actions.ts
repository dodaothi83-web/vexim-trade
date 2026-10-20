"use server";

import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { guard, getSession } from "@/lib/auth/session";
import { createSupabaseUser } from "@/lib/auth/authenticate";
import { passwordProblem } from "@/lib/auth/password";
import { provisionSupplierAccount } from "@/lib/supplier-portal/provision-account";

type Result = { ok: boolean; message: string };

/**
 * Nhân viên cấp tài khoản cổng NCC cho hồ sơ đã tạo sẵn trong CRM.
 * Đây là thao tác chủ động riêng, không phải hệ quả phụ của việc tạo hay công khai hồ sơ.
 */
export async function provisionSupplierAccountAction(form: FormData): Promise<Result> {
  const denied = await guard("suppliers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "sourcing")) {
    return { ok: false, message: "Chỉ quản trị và thu mua được cấp tài khoản NCC." };
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
      return { ok: false, message: "Chỉ cấp được tài khoản NCC khi hệ thống đang kết nối Supabase, vì tài khoản doanh nghiệp đăng nhập qua Supabase Auth." };
    }
    const { mode, user } = await provisionSupplierAccount(
      store,
      id,
      { email, name, tempSecret },
      { createAuthUser: createSupabaseUser, validatePassword: passwordProblem },
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
