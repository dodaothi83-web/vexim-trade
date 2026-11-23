"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { distributeUnassignedSuppliers, setSupplierOwner } from "@/lib/crm/supplier-owner";
import { ownerCandidates } from "@/lib/crm/supplier-owner-rules";

type Result = { ok: boolean; message: string };

/** Quản trị chia đều các nhà cung cấp chưa giao (hoặc người phụ trách đã nghỉ) cho nhân viên kinh doanh. */
export async function distributeSuppliersAction(): Promise<Result> {
  const denied = await guard("suppliers.assign");
  if (denied) return denied;
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  const store = getStore();
  try {
    const candidates = ownerCandidates(await store.listUsers());
    if (!candidates.length) return { ok: false, message: "Chưa có nhân viên kinh doanh nào đang hoạt động để giao." };
    const done = await distributeUnassignedSuppliers(store, { id: session.uid, email: session.email });
    revalidatePath("/crm/suppliers");
    return { ok: true, message: done ? `Đã chia đều ${done} nhà cung cấp cho ${candidates.length} nhân viên kinh doanh.` : "Không còn nhà cung cấp nào chưa giao." };
  } catch (error) {
    console.error("[supplier-owner] distribute failed", error);
    return { ok: false, message: "Chưa chia được. Kiểm tra cột owner_user_id đã có trong CSDL rồi thử lại." };
  }
}

/** Quản trị giao hoặc chuyển người phụ trách một nhà cung cấp. Để trống = trả về "Chưa giao". */
export async function assignSupplierOwnerAction(form: FormData): Promise<Result> {
  const denied = await guard("suppliers.assign");
  if (denied) return denied;
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  const supplierId = String(form.get("supplier_id") ?? "");
  const ownerId = String(form.get("owner_id") ?? "").trim() || null;
  if (!/^[0-9a-f-]{36}$/i.test(supplierId) || (ownerId && !/^[0-9a-f-]{36}$/i.test(ownerId))) {
    return { ok: false, message: "Yêu cầu không hợp lệ." };
  }
  const store = getStore();
  try {
    const [supplier, users] = await Promise.all([store.getSupplier(supplierId), store.listUsers()]);
    if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
    const owner = ownerId ? ownerCandidates(users).find((u) => u.id === ownerId) : null;
    if (ownerId && !owner) return { ok: false, message: "Chỉ giao được cho nhân viên kinh doanh đang hoạt động." };
    if ((supplier.owner_user_id ?? null) === ownerId) return { ok: true, message: "Người phụ trách không đổi." };
    await setSupplierOwner(store, supplier, ownerId, { id: session.uid, email: session.email }, "manual");
    revalidatePath("/crm/suppliers");
    revalidatePath(`/crm/suppliers/${supplierId}`);
    return { ok: true, message: owner ? `Đã giao cho ${owner.name?.trim() || owner.email}.` : "Đã chuyển về Chưa giao." };
  } catch (error) {
    console.error("[supplier-owner] assign failed", error);
    return { ok: false, message: "Chưa lưu được người phụ trách. Vui lòng thử lại." };
  }
}
