import type { Metadata } from "next";

import { HOME_RENDER_LANGS, type HomeRenderLang } from "@/lib/public/home-route";
import PublicHomePage, { generateMetadata as generateHomeMetadata } from "../../page";

/**
 * Bản dựng sẵn (ISR) của trang chủ cho từng ngôn ngữ. Người dùng không bao giờ thấy URL này:
 * middleware.ts viết lại "/" → /homepage/en và "/?lang=vi" → /homepage/vi (xem
 * lib/public/home-route.ts). Nội dung, metadata và JSON-LD dùng CHUNG mã với app/(public)/page.tsx
 * — chỉ khác là ngôn ngữ đến từ params cố định thay vì query string, nên Next.js dựng tĩnh được.
 */
export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams(): Array<{ lang: HomeRenderLang }> {
  return HOME_RENDER_LANGS.map((lang) => ({ lang }));
}

type Props = { params: Promise<{ lang: string }> };

async function langOf(params: Props["params"]): Promise<HomeRenderLang> {
  return (await params).lang === "vi" ? "vi" : "en";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = await langOf(params);
  return generateHomeMetadata({ searchParams: Promise.resolve({ lang }) });
}

export default async function StaticHomePage({ params }: Props) {
  const lang = await langOf(params);
  return <PublicHomePage searchParams={Promise.resolve({ lang })} />;
}
