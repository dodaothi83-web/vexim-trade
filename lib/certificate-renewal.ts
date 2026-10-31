import type { DataStore } from "@/lib/db/types";
import type { Certificate } from "@/lib/types";
import { renewalScopeRows, scopeTarget } from "@/lib/certificate-scope";

/**
 * Duyệt bản gia hạn thì phạm vi đi theo bản mới.
 *
 * Bản cũ vẫn hiệu lực cho tới bước này: nó chỉ bị đánh dấu `superseded_by_certificate_id`
 * sau khi bản mới đã được duyệt, và phạm vi của nó được sao sang bản mới trước khi cắt.
 * Nhờ vậy sản phẩm không rơi khỏi chip trong lúc chờ duyệt.
 */
export async function transferRenewalScope(
  store: DataStore,
  renewed: Certificate,
  actor: { id: string | null; email: string | null; at: string },
): Promise<{ copied: number; superseded: boolean }> {
  const previousId = renewed.supersedes_certificate_id;
  if (!previousId) return { copied: 0, superseded: false };
  const [previousScopes, nextScopes] = await Promise.all([
    store.listCertificateScopes([previousId]),
    store.listCertificateScopes([renewed.id]),
  ]);
  const existing = new Set(nextScopes.map((scope) => {
    const target = scopeTarget(scope);
    return target ? `${target.kind}:${target.id}` : "";
  }));
  const rows = renewalScopeRows(previousId, renewed.id, previousScopes, {
    id: actor.email ?? actor.id,
    at: actor.at,
  }).filter((row) => {
    const key = row.category_id ? `category:${row.category_id}` : `product:${row.product_id}`;
    return !existing.has(key);
  });
  for (const row of rows) await store.createCertificateScope(row);
  await store.updateCertificate(previousId, { superseded_by_certificate_id: renewed.id });
  return { copied: rows.length, superseded: true };
}
