import { CategoriesManager } from "./categories-manager";
import { CategoryPublicationQueue } from "./publication-queue";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const session = await requirePagePermission("categories.view", "/crm/dashboard");
  const store = getStore();
  const categories = await store.listCategories();
  const canPublish = hasPermission(session.role, "categories.publish");
  if (!hasPermission(session.role, "categories.manage")) return <CategoryPublicationQueue categories={categories} />;
  return <CategoriesManager initialCategories={categories} canPublish={canPublish} aiEnabled={!!process.env.OPENAI_API_KEY} />;
}
