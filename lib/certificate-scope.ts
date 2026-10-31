/**
 * Phạm vi chứng nhận: giấy nào áp cho sản phẩm/danh mục nào.
 *
 * Mỗi dòng phạm vi là **hoặc** một danh mục (`category_id`) **hoặc** một sản phẩm
 * (`product_id`). Phạm vi do nhân viên xác nhận nên có `verified_by`/`verified_at`;
 * dòng chưa xác nhận không tính khi hiển thị cho người mua.
 *
 * Sản phẩm nằm trong danh mục đã có phạm vi thì **thừa hưởng** giấy. Nhà cung cấp bỏ
 * tick một giấy cho một sản phẩm thì ghi vào `product_certificate_optouts`; riêng dòng
 * phạm vi gắn thẳng sản phẩm là quyết định của nhân viên nên không bị opt-out ghi đè.
 *
 * Module thuần, không import gì, để script kiểm tra nạp thẳng bằng node.
 */

import type { CertificateScheme } from "./certificate-scheme";
import { isScopeableCertificateScheme } from "./certificate-scheme";

export interface CertificateScopeRow {
  id: string;
  certificate_id: string;
  category_id?: string | null;
  product_id?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
}

export interface CertificateOptoutRow {
  product_id: string;
  certificate_id: string;
}

/** Phần của sản phẩm mà phạm vi cần: danh mục hiện tại và các danh mục cha. */
export interface ScopeProduct {
  id: string;
  categoryId?: string | null;
  /** Danh mục của sản phẩm + danh mục cha, để phạm vi ở nhóm cha vẫn phủ nhóm con. */
  categoryPath?: readonly string[];
}

/** Phần của chứng nhận mà phạm vi cần (đọc được cả dữ liệu cũ). */
export interface ScopedCertificate {
  id: string;
  certificate_scheme?: CertificateScheme | string | null;
  approved_product_ids?: string[] | null;
  superseded_by_certificate_id?: string | null;
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueIds(values: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/** Chỉ giấy chất lượng đã xếp loại mới được gắn phạm vi sản phẩm. */
export function isScopeableCertificate(certificate: ScopedCertificate): boolean {
  return isScopeableCertificateScheme(certificate.certificate_scheme ?? null);
}

/** Phạm vi đã được nhân viên xác nhận mới có hiệu lực. */
export function isVerifiedScope(scope: CertificateScopeRow): boolean {
  return clean(scope.verified_at).length > 0;
}

/** Dòng phạm vi có đúng một đích: hoặc danh mục, hoặc sản phẩm. */
export function scopeTarget(scope: CertificateScopeRow): { kind: "category" | "product"; id: string } | null {
  const category = clean(scope.category_id);
  const product = clean(scope.product_id);
  if (category && !product) return { kind: "category", id: category };
  if (product && !category) return { kind: "product", id: product };
  return null;
}

export function optoutKey(productId: string, certificateId: string): string {
  return `${productId}::${certificateId}`;
}

export function optoutKeys(optouts: readonly CertificateOptoutRow[] = []): Set<string> {
  const keys = new Set<string>();
  for (const row of optouts) {
    if (row?.product_id && row?.certificate_id) keys.add(optoutKey(row.product_id, row.certificate_id));
  }
  return keys;
}

export interface ScopeMatch {
  /** Sản phẩm nhận giấy vì chính sản phẩm được ghi trong phạm vi. */
  direct: boolean;
  /** Sản phẩm thừa hưởng giấy từ danh mục (hoặc danh mục cha). */
  inherited: boolean;
}

/**
 * Giấy có áp cho sản phẩm này không, và áp theo đường nào.
 *
 * `scopes` là toàn bộ phạm vi của các giấy đang xét (hàm tự lọc theo `certificate_id`).
 * Giấy chưa có dòng phạm vi nào (dữ liệu trước khi có bảng phạm vi) dùng
 * `approved_product_ids` cũ — đúng như bản đã duyệt trước đây.
 */
export function certificateScopeMatch(
  certificate: ScopedCertificate,
  scopes: readonly CertificateScopeRow[],
  product: ScopeProduct,
  optouts: ReadonlySet<string> = new Set(),
): ScopeMatch {
  const productId = clean(product.id);
  if (!productId) return { direct: false, inherited: false };
  if (!isScopeableCertificate(certificate)) return { direct: false, inherited: false };
  if (clean(certificate.superseded_by_certificate_id).length > 0) return { direct: false, inherited: false };

  const own = scopes.filter((scope) => scope.certificate_id === certificate.id && isVerifiedScope(scope));
  const optedOut = optouts.has(optoutKey(productId, certificate.id));

  if (own.length === 0) {
    // Dữ liệu cũ: chưa chuyển sang bảng phạm vi, vẫn dùng danh sách sản phẩm đã duyệt.
    const legacy = uniqueIds(certificate.approved_product_ids);
    return { direct: legacy.includes(productId), inherited: false };
  }

  const path = new Set<string>([clean(product.categoryId), ...(product.categoryPath ?? []).map(clean)].filter(Boolean));
  let direct = false;
  let inherited = false;
  for (const scope of own) {
    const target = scopeTarget(scope);
    if (!target) continue;
    if (target.kind === "product") {
      if (target.id === productId) direct = true;
      continue;
    }
    if (path.has(target.id) && !optedOut) inherited = true;
  }
  return { direct, inherited };
}

export function certificateAppliesToProduct(
  certificate: ScopedCertificate,
  scopes: readonly CertificateScopeRow[],
  product: ScopeProduct,
  optouts: ReadonlySet<string> = new Set(),
): boolean {
  const match = certificateScopeMatch(certificate, scopes, product, optouts);
  return match.direct || match.inherited;
}

/** Phạm vi danh mục áp cho một danh mục (kể cả nhóm cha) — dùng cho form thêm sản phẩm. */
export function certificateAppliesToCategory(
  certificate: ScopedCertificate,
  scopes: readonly CertificateScopeRow[],
  categoryPath: readonly string[],
): boolean {
  if (!isScopeableCertificate(certificate)) return false;
  if (clean(certificate.superseded_by_certificate_id).length > 0) return false;
  const path = new Set(categoryPath.map(clean).filter(Boolean));
  if (path.size === 0) return false;
  return scopes.some((scope) => {
    if (scope.certificate_id !== certificate.id || !isVerifiedScope(scope)) return false;
    const target = scopeTarget(scope);
    return target?.kind === "category" && path.has(target.id);
  });
}

/** Danh mục của phạm vi, để hiện câu "phạm vi Cashew kernels". */
export function scopeLabel(
  scope: CertificateScopeRow,
  names: { category?: (id: string) => string | null; product?: (id: string) => string | null } = {},
): string {
  const target = scopeTarget(scope);
  if (!target) return "Phạm vi không hợp lệ";
  if (target.kind === "category") return names.category?.(target.id) ?? `Danh mục ${target.id}`;
  return names.product?.(target.id) ?? `Sản phẩm ${target.id}`;
}

/**
 * Bản gia hạn: khi nhân viên duyệt bản mới, phạm vi của bản cũ chuyển sang bản mới.
 * Trả về các dòng phạm vi cần tạo cho bản mới (không giữ id cũ).
 */
export function renewalScopeRows(
  previousCertificateId: string,
  nextCertificateId: string,
  scopes: readonly CertificateScopeRow[],
  actor: { id: string | null; at: string },
): Array<Omit<CertificateScopeRow, "id">> {
  if (!clean(previousCertificateId) || !clean(nextCertificateId)) return [];
  return scopes
    .filter((scope) => scope.certificate_id === previousCertificateId && scopeTarget(scope) !== null)
    .map((scope) => {
      const target = scopeTarget(scope)!;
      return {
        certificate_id: nextCertificateId,
        category_id: target.kind === "category" ? target.id : null,
        product_id: target.kind === "product" ? target.id : null,
        verified_by: actor.id,
        verified_at: actor.at,
      };
    });
}

/** Bản đang chờ duyệt không thay bản cũ: chỉ bản đã duyệt mới phủ sản phẩm. */
export function isCertificateVersionCurrent(certificate: ScopedCertificate): boolean {
  return clean(certificate.superseded_by_certificate_id).length === 0;
}
