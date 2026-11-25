import { homeShareImage } from "@/lib/og/home-share-image";

/** Ảnh chia sẻ trang chủ (bản vi), dựng một lần lúc build. Xem lib/og/home-share-image.tsx. */
export const dynamic = "force-static";

export function GET() {
  return homeShareImage("vi");
}
