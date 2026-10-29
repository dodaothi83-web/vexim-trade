import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import type { QuantityPriceSettings } from "@/lib/products/quantity-price-settings";
import { readGradePriceBounds, readQuantityPriceSettings } from "@/lib/products/quantity-price-config";
import { PageHeader } from "@/components/page-header";
import { GradeBoundsForm, SettingsForm, type GradeCategory } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cấu hình giá theo số lượng" };

export default async function QuantityPricingSettingsPage() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/crm/settings");
  let settings: QuantityPriceSettings | null = null;
  let categories: GradeCategory[] = [];
  let unavailable = false;
  try {
    const db = getSupabaseClient();
    if (!db) throw new Error("Database unavailable");
    const user = await supabaseStore.getUser(session.uid);
    if (!user?.is_active || user.role !== "admin" || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) throw new Error("Admin verification failed");
    const [loadedSettings, rawCategories, bounds] = await Promise.all([
      readQuantityPriceSettings(),
      supabaseStore.listCategories({ publishedOnly: false }),
      readGradePriceBounds(),
    ]);
    settings = loadedSettings;
    categories = rawCategories.map((category) => ({
      id: category.id,
      name: category.name_i18n.vi || category.name_i18n.en || category.slug,
      grades: standardGradesForCategory(category).map((name) => {
        const existing = bounds.find((item) => item.category_id === category.id && item.grade === name);
        return { name, min: existing ? Number(existing.min_usd_per_kg) : null, max: existing ? Number(existing.max_usd_per_kg) : null };
      }),
    })).filter((category) => category.grades.length > 0);
  } catch (error) {
    console.error("[quantity-pricing] settings page", error);
    settings = null;
    unavailable = true;
  }
  return <>
    <PageHeader title="Cấu hình giá theo số lượng" sub="Tham số và ngưỡng theo grade cho mô hình giá mới." />
    <Link href="/crm/settings" className="text-sm font-semibold text-brand-700">← Về Cài đặt</Link>
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      Đây là cấu hình chuẩn bị. Mô hình giá mới chưa được bật; lưu các giá trị này chưa thay đổi form NCC, giá buyer, email hay xếp hạng hiện tại.
    </div>
    {unavailable || !settings ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Chưa tải được cấu hình. Kiểm tra kết nối, quyền quản trị và migration 20261053; không có dữ liệu mặc định thay thế.</p> :
      <div className="mt-4 space-y-5"><SettingsForm settings={settings} /><GradeBoundsForm categories={categories} /></div>}
  </>;
}
