import type { Metadata } from "next";

import { enableStaffProductView } from "@/lib/public/product-staff-view";
import PublicProductDetail, { generateMetadata as generateProductMetadata } from "../../../products/[slug]/[productId]/page";

/**
 * Bản ĐỘNG của trang chi tiết sản phẩm cho người có cookie phiên hợp lệ (nhân viên / nhà cung
 * cấp). Không ai thấy URL này: middleware.ts viết lại /products/<slug>/<id> sang đây khi có phiên
 * (xem lib/public/product-route.ts). Dùng CHUNG mã với trang công khai, chỉ bật cờ để trang được
 * đọc phiên: xem trước danh mục chưa công khai và không đếm lượt xem của chính mình.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; productId: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  enableStaffProductView();
  return generateProductMetadata(props);
}

export default async function StaffProductDetail(props: Props) {
  enableStaffProductView();
  return <PublicProductDetail {...props} />;
}
