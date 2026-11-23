import "server-only";

import type { DataStore } from "@/lib/db/types";
import { pickBalancedOwner, planDistribution, sameTaxIdSupplier } from "@/lib/crm/supplier-owner-rules";
import type { Supplier } from "@/lib/types";

/**
 * Giao người phụ trách nhà cung cấp và ghi nhật ký (ai giao, giao cho ai, vì sao).
 * Quy tắc chọn người nằm ở lib/crm/supplier-owner-rules.ts.
 */
export interface OwnerActor {
  id?: string | null;
  email?: string | null;
}

export type OwnerReason = "created_by_staff" | "auto_new_supplier" | "manual" | "distribute";

export async function setSupplierOwner(
  store: DataStore,
  supplier: Pick<Supplier, "id" | "owner_user_id">,
  ownerId: string | null,
  actor: OwnerActor | null,
  reason: OwnerReason,
): Promise<void> {
  if ((supplier.owner_user_id ?? null) === ownerId) return;
  const now = new Date().toISOString();
  await store.updateSupplier(supplier.id, { owner_user_id: ownerId, owner_assigned_at: ownerId ? now : null });
  await store.addAuditLog({
    actor_id: actor?.id ?? null,
    actor_email: actor?.email ?? (reason === "auto_new_supplier" ? "he-thong:chia-deu" : null),
    entity: "supplier",
    entity_id: supplier.id,
    action: "supplier.owner_changed",
    before: { owner_user_id: supplier.owner_user_id ?? null },
    after: { owner_user_id: ownerId, reason },
  }).catch((error) => console.error("[supplier-owner] audit failed", error));
}

/** Giao NCC mới cho nhân viên kinh doanh theo nguyên tắc chia đều. Lỗi không chặn luồng gọi. */
export async function autoAssignSupplierOwner(store: DataStore, supplierId: string): Promise<string | null> {
  try {
    const [users, suppliers] = await Promise.all([store.listUsers(), store.listSuppliers()]);
    const supplier = suppliers.find((s) => s.id === supplierId) ?? await store.getSupplier(supplierId);
    if (!supplier || supplier.owner_user_id) return supplier?.owner_user_id ?? null;
    const owner = pickBalancedOwner(users, suppliers, { taxId: supplier.tax_id, excludeId: supplier.id });
    if (!owner) return null;
    await setSupplierOwner(store, supplier, owner, null, "auto_new_supplier");
    return owner;
  } catch (error) {
    console.error("[supplier-owner] auto assign failed", error);
    return null;
  }
}

/** Chia đều toàn bộ NCC chưa giao (hoặc người phụ trách đã nghỉ). Trả số NCC đã giao. */
export async function distributeUnassignedSuppliers(store: DataStore, actor: OwnerActor): Promise<number> {
  const [users, suppliers] = await Promise.all([store.listUsers(), store.listSuppliers()]);
  const plan = planDistribution(users, suppliers);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  let done = 0;
  for (const [supplierId, ownerId] of plan) {
    const supplier = byId.get(supplierId);
    if (!supplier) continue;
    await setSupplierOwner(store, supplier, ownerId, actor, "distribute");
    done += 1;
  }
  return done;
}

/**
 * Hồ sơ khác đã dùng đúng mã số thuế này, kèm tên người đang phụ trách,
 * để chặn nhập trùng một doanh nghiệp vào hai hồ sơ.
 */
export async function taxIdConflict(store: DataStore, taxId: string | null | undefined, excludeId?: string | null): Promise<{ supplier: Supplier; ownerName: string | null } | null> {
  if (!taxId) return null;
  const suppliers = await store.listSuppliers();
  const twin = sameTaxIdSupplier(suppliers, taxId, excludeId);
  if (!twin) return null;
  let ownerName: string | null = null;
  if (twin.owner_user_id) {
    const owner = await store.getUser(twin.owner_user_id).catch(() => null);
    ownerName = owner ? (owner.name?.trim() || owner.email) : null;
  }
  return { supplier: twin, ownerName };
}

export function taxIdConflictMessage(conflict: { ownerName: string | null }, canSeeIt: boolean, supplierName: string): string {
  const who = conflict.ownerName ? `đang do ${conflict.ownerName} phụ trách` : "chưa giao cho ai";
  return canSeeIt
    ? `Mã số thuế này đã có ở hồ sơ "${supplierName}" (${who}). Mở hồ sơ đó thay vì tạo mới.`
    : `Mã số thuế này đã có trong hệ thống (${who}). Liên hệ người phụ trách hoặc quản trị để được chuyển giao.`;
}
