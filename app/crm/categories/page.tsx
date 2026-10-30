import { CategoriesManager, type CategoryStats } from "./categories-manager";
import { CategoryPublicationQueue } from "./publication-queue";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { harvestReviewQueue } from "@/lib/public/harvest";

export const dynamic = "force-dynamic";

/**
 * Ngày hôm nay theo giờ Việt Nam, không theo giờ máy chủ.
 * Ngưỡng rà soát tính bằng tháng nên lệch múi giờ không đổi kết quả, nhưng ngày
 * hiển thị trong CRM thì phải là ngày người dùng đang sống.
 */
function todayInVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function CategoriesPage() {
  const session = await requirePagePermission("categories.view", "/crm/dashboard");
  const store = getStore();
  const categories = await store.listCategories();
  const canPublish = hasPermission(session.role, "categories.publish");
  if (!hasPermission(session.role, "categories.manage")) return <CategoryPublicationQueue categories={categories} />;

  // Số sản phẩm / NCC theo từng danh mục (khoá theo slug như trường `category`
  // trên sản phẩm) để danh sách trả lời ngay "danh mục này đang có gì".
  // Lỗi đọc sản phẩm không được làm sập trang danh mục — khi đó hiển thị 0.
  const stats: Record<string, { products: number; suppliers: number; supplierIds: string[] }> = {};
  const products = await store.listProducts().catch(() => []);
  for (const p of products) {
    // Slug đã được nhân viên chốt khi duyệt sản phẩm là căn cứ chính xác nhất;
    // chưa duyệt thì dùng trường category (lưu slug sau khi hệ thống tự gán ngành).
    const slug = (p.reviewed_category_slug ?? p.category ?? "").toLowerCase();
    if (!slug) continue;
    const row = (stats[slug] ??= { products: 0, suppliers: 0, supplierIds: [] });
    row.products += 1;
    if (p.supplier_id && !row.supplierIds.includes(p.supplier_id)) {
      row.supplierIds.push(p.supplier_id);
      row.suppliers = row.supplierIds.length;
    }
  }
  const cleanStats: Record<string, CategoryStats> = Object.fromEntries(
    Object.entries(stats).map(([slug, s]) => [slug, { products: s.products, suppliers: s.suppliers }]),
  );

  // Mùa vụ không tự cập nhật, nên danh mục có lịch nhưng ngày rà soát trống hoặc
  // đã cũ được đưa lên đầu trang. Sửa và lưu là dòng nhắc tự mất, vì danh sách
  // tính lại từ dữ liệu mỗi lần tải trang.
  const harvestReview = harvestReviewQueue(categories, todayInVietnam());

  return (
    <CategoriesManager
      initialCategories={categories}
      harvestReview={harvestReview}
      canPublish={canPublish}
      aiEnabled={!!process.env.OPENAI_API_KEY}
      stats={cleanStats}
      currentUserId={session.uid}
      isAdmin={session.role === "admin"}
    />
  );
}
