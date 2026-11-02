import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Keep saved links working; product review is the single CRM workspace. */
export default async function ProductDetailPage({ params }: {
  params: Promise<{ slug: string }>;
}) {
  await requirePagePermission("products.view", "/crm/dashboard");
  const { slug } = await params;
  redirect(`/crm/products/${encodeURIComponent(slug)}/edit`);
}
