import { VerificationLevelPage } from "../level-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xác thực nhà máy (L2)", robots: { index: false, follow: false } };

/**
 * L2 — xác thực nhà máy bằng 9 ảnh tự chụp.
 * Trang riêng, một mục menu riêng; không còn gộp chung với lịch sử xuất khẩu.
 */
export default function SupplierFactoryVerificationPage() {
  return <VerificationLevelPage level={2} />;
}
