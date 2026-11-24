"use server";

import { revalidatePath } from "next/cache";

import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { deleteObject } from "@/lib/media/storage";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPlanRules } from "@/lib/supplier-plans";
import {
  moveShowcaseBlock, normalizeShowcaseBlocks, SHOWCASE_BODY_MAX, SHOWCASE_TITLE_MAX, showcaseTextProblem,
} from "@/lib/supplier-showcase";
import { revalidatePublicCatalog } from "@/lib/public/revalidate-public";

type Result = { ok: boolean; message?: string };

async function context() {
  const { m } = await getPortalMessages();
  const e = m.showcase.errors;
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return { e, error: e.signIn } as const;
  return { e, access, blocks: normalizeShowcaseBlocks(access.supplier.showcase_blocks) } as const;
}

function refresh(slug: string) {
  revalidatePath("/supplier/portal/storefront");
  revalidatePublicCatalog();
  revalidatePath(`/suppliers/${slug}`);
}

/** Sửa tiêu đề, mô tả. Gói hết hạn vẫn sửa được nội dung đã có (không hiện công khai). */
export async function updateShowcaseBlockAction(id: string, title: string, body: string): Promise<Result> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { e, access, blocks } = ctx;
  if (!supplierPlanRules(access.supplier).premiumStorefront) return { ok: false, message: e.plan };
  const problem = showcaseTextProblem(String(title ?? ""), String(body ?? ""));
  if (problem) return { ok: false, message: problem === "titleTooLong" ? fill(e.titleTooLong, { max: SHOWCASE_TITLE_MAX })
    : problem === "bodyTooLong" ? fill(e.bodyTooLong, { max: SHOWCASE_BODY_MAX }) : e[problem] };
  if (!blocks.some((block) => block.id === id)) return { ok: false, message: e.notFound };
  try {
    await access.store.updateSupplier(access.supplier.id, {
      showcase_blocks: blocks.map((block) => block.id === id ? { ...block, title: title.trim(), body: body.trim() } : block),
    });
  } catch (error) {
    console.error("[showcase] update failed", error);
    return { ok: false, message: e.failed };
  }
  refresh(access.supplier.slug || access.supplier.id);
  return { ok: true };
}

/** Gỡ khối và xoá ảnh khỏi kho tệp. Luôn cho phép, kể cả khi gói đã hết hạn. */
export async function deleteShowcaseBlockAction(id: string): Promise<Result> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { e, access, blocks } = ctx;
  const target = blocks.find((block) => block.id === id);
  if (!target) return { ok: false, message: e.notFound };
  try {
    await access.store.updateSupplier(access.supplier.id, { showcase_blocks: blocks.filter((block) => block.id !== id) });
  } catch (error) {
    console.error("[showcase] delete failed", error);
    return { ok: false, message: e.failed };
  }
  // Chỉ xoá tệp nằm trong thư mục của chính nhà cung cấp này.
  if (target.image_path.startsWith(`suppliers/${access.supplier.id}/showcase-`)) await deleteObject(target.image_path).catch(() => null);
  await access.store.addAuditLog({
    actor_id: access.user.id, actor_email: access.user.email, entity: "supplier", entity_id: access.supplier.id,
    action: "supplier.showcase_removed", before: { block_id: id, title: target.title }, after: null,
  }).catch((error) => console.error("[showcase] audit", error));
  refresh(access.supplier.slug || access.supplier.id);
  return { ok: true };
}

export async function moveShowcaseBlockAction(id: string, direction: -1 | 1): Promise<Result> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, message: ctx.error };
  const { e, access, blocks } = ctx;
  const next = moveShowcaseBlock(blocks, id, direction === -1 ? -1 : 1);
  if (next === blocks) return { ok: true };
  try {
    await access.store.updateSupplier(access.supplier.id, { showcase_blocks: next });
  } catch (error) {
    console.error("[showcase] move failed", error);
    return { ok: false, message: e.failed };
  }
  refresh(access.supplier.slug || access.supplier.id);
  return { ok: true };
}
