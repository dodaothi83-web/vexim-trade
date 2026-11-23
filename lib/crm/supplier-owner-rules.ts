/**
 * Quy tắc thuần cho người phụ trách nhà cung cấp (không truy cập CSDL, kiểm thử được).
 *
 * - "Chia đều": nhà cung cấp mới vào tay nhân viên kinh doanh đang hoạt động có ít NCC nhất;
 *   bằng nhau thì ai lâu chưa được giao hơn nhận trước, rồi theo tên.
 * - Cùng mã số thuế với một hồ sơ đã có người phụ trách thì giao luôn cho người đó,
 *   để một doanh nghiệp chỉ có một đầu mối.
 */
import { taxIdDigits, taxIdKey } from "@/lib/crm/supplier-tax-id";

export interface OwnerCandidate {
  id: string;
  name: string | null;
  email: string;
  role: string;
  is_active: boolean;
}

export interface OwnedSupplierRow {
  id: string;
  name?: string | null;
  tax_id?: string | null;
  owner_user_id?: string | null;
  owner_assigned_at?: string | null;
  is_demo?: boolean;
}

/** Nhân viên có thể nhận phụ trách nhà cung cấp. */
export function ownerCandidates<T extends OwnerCandidate>(users: T[]): T[] {
  return users
    .filter((u) => u.is_active && u.role === "sale")
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "vi") || a.id.localeCompare(b.id));
}

/** NCC tính là "chưa giao" khi chưa có người phụ trách hoặc người đó không còn nhận được việc. */
export function isUnassigned(row: OwnedSupplierRow, candidateIds: ReadonlySet<string>): boolean {
  return !row.owner_user_id || !candidateIds.has(row.owner_user_id);
}

/** Hồ sơ khác đã dùng đúng mã số thuế này (so dãy chữ số đầy đủ, kể cả đuôi chi nhánh). */
export function sameTaxIdSupplier<T extends OwnedSupplierRow>(rows: T[], taxId: string | null | undefined, excludeId?: string | null): T | null {
  const digits = taxIdDigits(taxId);
  if (!taxIdKey(digits)) return null;
  return rows.find((row) => row.id !== excludeId && taxIdDigits(row.tax_id) === digits) ?? null;
}

/**
 * Chọn người nhận cho một nhà cung cấp mới. Trả null khi chưa có nhân viên kinh doanh nào.
 * `rows` là toàn bộ NCC hiện có để đếm tải; `taxId` dùng để giữ một đầu mối cho cùng MST.
 */
export function pickBalancedOwner(
  candidates: OwnerCandidate[],
  rows: OwnedSupplierRow[],
  options: { taxId?: string | null; excludeId?: string | null } = {},
): string | null {
  const pool = ownerCandidates(candidates);
  if (!pool.length) return null;
  const ids = new Set(pool.map((u) => u.id));
  const twin = sameTaxIdSupplier(rows, options.taxId, options.excludeId);
  if (twin?.owner_user_id && ids.has(twin.owner_user_id)) return twin.owner_user_id;
  const load = new Map<string, { count: number; last: string }>(pool.map((u) => [u.id, { count: 0, last: "" }]));
  for (const row of rows) {
    if (row.id === options.excludeId || !row.owner_user_id) continue;
    const entry = load.get(row.owner_user_id);
    if (!entry) continue;
    entry.count += 1;
    if ((row.owner_assigned_at ?? "") > entry.last) entry.last = row.owner_assigned_at ?? "";
  }
  let best = pool[0];
  for (const user of pool.slice(1)) {
    const a = load.get(user.id)!;
    const b = load.get(best.id)!;
    if (a.count < b.count || (a.count === b.count && a.last < b.last)) best = user;
  }
  return best.id;
}

/**
 * Kế hoạch chia đều các NCC chưa giao (bỏ qua NCC mẫu). Trả danh sách [supplierId, ownerId]
 * theo thứ tự tên NCC; tải được cộng dồn sau mỗi lần giao để chia đều thật.
 */
export function planDistribution(candidates: OwnerCandidate[], rows: OwnedSupplierRow[], now = new Date().toISOString()): Array<[string, string]> {
  const pool = ownerCandidates(candidates);
  if (!pool.length) return [];
  const ids = new Set(pool.map((u) => u.id));
  const working = rows.map((row) => ({ ...row, owner_user_id: row.owner_user_id && ids.has(row.owner_user_id) ? row.owner_user_id : null }));
  const pending = working
    .filter((row) => !row.owner_user_id && !row.is_demo)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "vi") || a.id.localeCompare(b.id));
  const plan: Array<[string, string]> = [];
  for (const row of pending) {
    const owner = pickBalancedOwner(pool, working, { taxId: row.tax_id, excludeId: row.id });
    if (!owner) break;
    row.owner_user_id = owner;
    row.owner_assigned_at = now;
    plan.push([row.id, owner]);
  }
  return plan;
}
