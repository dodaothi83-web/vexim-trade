import { VerificationLevelPage } from "../level-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lịch sử xuất khẩu (L3) | Vexim Trade", robots: { index: false, follow: false } };

/**
 * L3 — lịch sử xuất khẩu bằng chứng từ của một lô hàng đã giao.
 * Trang riêng, một mục menu riêng; không còn gộp chung với xác thực nhà máy.
 */
export default function SupplierExportVerificationPage() {
  return <VerificationLevelPage level={3} />;
}
