"use server";

import { revalidatePath } from "next/cache";
import { getBuyerSession } from "@/lib/auth/buyer-session";
import { getStore } from "@/lib/db";
import { getPublicProductRecordsByIds } from "@/lib/public/product-catalog";

async function currentAccount() {
  const session = await getBuyerSession();
  if (!session) return null;
  // Resolve from the verified cookie email, never from a browser-supplied ID.
  const account = await getStore().getBuyerUserByEmail(session.email);
  return account?.verified_at ? account : null;
}

export async function getSavedProductsState() {
  const account = await currentAccount();
  return { authenticated: !!account, ids: account?.saved.products.map((p) => p.id) ?? [] };
}

export async function setSavedProductAction(id: string, saved: boolean) {
  if (typeof id !== "string" || id.length > 100 || !id.trim() || typeof saved !== "boolean") return { ok: false };
  try {
    const account = await currentAccount();
    if (!account) return { ok: false };
    const store = getStore();
    const record = saved ? (await getPublicProductRecordsByIds([id]))[0] : null;
    if (saved && !record) return { ok: false };
    const product = record ? {
      id: record.card.id, name: record.card.name,
      href: `/products/${encodeURIComponent(record.category.slug)}/${encodeURIComponent(record.card.id)}`,
      imagePath: record.card.cardImagePath ?? record.card.imagePaths[0] ?? null,
      categorySlug: record.category.slug,
    } : { id, name: "", href: "", imagePath: null, categorySlug: "" };
    await store.setBuyerSavedProduct(account.id, product, saved);
    revalidatePath("/buyer/account");
    return { ok: true };
  } catch (error) {
    console.error("[buyer-saved] update failed", error instanceof Error ? error.message : "unknown");
    return { ok: false };
  }
}

export async function updateBuyerCompanyAction(company: string) {
  if (typeof company !== "string" || company.trim().length > 160) return { ok: false };
  try {
    const account = await currentAccount();
    if (!account) return { ok: false };
    await getStore().updateBuyerUser(account.id, { company_name: company.trim() || null });
    revalidatePath("/buyer/account");
    return { ok: true };
  } catch { return { ok: false }; }
}
