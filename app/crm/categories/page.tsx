import { CategoriesManager } from "./categories-manager";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const session = await requirePagePermission("categories.manage", "/crm/dashboard");
  const store = getStore();
  const categories = await store.listCategories();
  const canPublish = hasPermission(session.role, "categories.publish");
  return <CategoriesManager initialCategories={categories} canPublish={canPublish} />;
}
