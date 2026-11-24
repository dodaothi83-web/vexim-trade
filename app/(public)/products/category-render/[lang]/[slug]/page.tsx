import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CATEGORY_RENDER_LANGS, type CategoryRenderLang } from "@/lib/public/category-route";
import { enablePrebuiltCategoryRender } from "@/lib/public/category-render-mode";
import CategoryPage, { generateMetadata as generateCategoryMetadata } from "../../../[slug]/page";

/**
 * Bản dựng sẵn (ISR) của trang danh mục cho khách. Người dùng không bao giờ thấy URL này:
 * middleware.ts viết lại /products/<slug> (và ?lang=vi) sang đây khi không lọc, không phân trang và
 * không có phiên đăng nhập (xem lib/public/category-route.ts). Nội dung, metadata và JSON-LD dùng
 * CHUNG mã với app/(public)/products/[slug]/page.tsx — chỉ khác là ngôn ngữ đến từ params cố định
 * thay vì query string, và trang không đọc phiên, nên Next.js dựng tĩnh được.
 *
 * Làm mới mỗi giờ (khớp trang chi tiết sản phẩm) và ngay khi CRM/cổng NCC gọi
 * revalidatePath("/products", "layout").
 */
// 1 giờ (chủ dự án duyệt 24/11/2026); NCC/nhân viên sửa thì làm mới ngay (revalidatePath/Tag).
export const revalidate = 3600;

/** Không dựng trước lúc build (cần CSDL); trang được dựng ở lượt xem đầu rồi cache. */
export function generateStaticParams(): Array<{ lang: CategoryRenderLang; slug: string }> {
  return [];
}

type Props = { params: Promise<{ lang: string; slug: string }> };

async function resolveParams(params: Props["params"]) {
  const { lang, slug } = await params;
  if (!(CATEGORY_RENDER_LANGS as readonly string[]).includes(lang)) notFound();
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(lang === "vi" ? { lang: "vi" } : {}),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  enablePrebuiltCategoryRender();
  return generateCategoryMetadata(await resolveParams(params));
}

export default async function PrebuiltCategoryPage({ params }: Props) {
  enablePrebuiltCategoryRender();
  return <CategoryPage {...await resolveParams(params)} />;
}
