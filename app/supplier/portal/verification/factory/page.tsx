import { getPortalMessages } from "@/lib/i18n/server";
import { VerificationLevelPage } from "../level-page";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.verification.level.factoryTitle, robots: { index: false, follow: false } };
}

/**
 * L2 - xác thực nhà máy bằng 9 ảnh tự chụp.
 * Trang riêng, một mục menu riêng; không còn gộp chung với lịch sử xuất khẩu.
 */
export default function SupplierFactoryVerificationPage() {
  return <VerificationLevelPage level={2} />;
}
