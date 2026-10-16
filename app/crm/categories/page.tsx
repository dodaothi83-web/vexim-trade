import { CategoriesManager } from "./categories-manager";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requirePagePermission("suppliers.manage", "/crm/dashboard");
  const store = getStore();
  const categories = await store.listCategories();
  return <CategoriesManager initialCategories={categories} />;
}
