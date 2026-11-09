import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import { GoogleTag } from "@/components/google-tag";
import { COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { safeJsonLd } from "@/lib/public/supplier-seo";
import HomeContent from "./home";
import { HOME_META_DESCRIPTION, HOME_META_DESCRIPTION_VI } from "@/lib/public/meta-copy";

// Chuyển hướng nhân viên đã đăng nhập (→ /crm/dashboard) và host nội bộ
// (crm.*, *.vercel.app → /login) giờ nằm ở middleware.ts, chạy TRƯỚC khi chạm
// cache — nên bản thân trang này không còn lý do gì phải buộc render động nữa
// (đã bỏ "force-dynamic" cũ từng nằm ở đây).
//
// KHÔNG đặt `export const revalidate` (ISR) ở đây: trang vẫn đọc `searchParams`
// (q/cat/lang) để dựng bản tiếng Việt khi có "?lang=vi" — và việc đọc searchParams
// tự nó LUÔN buộc Next.js render động (bất kể có revalidate hay không), vì bản
// tĩnh được chốt lúc build nên không thể tuỳ biến theo query string của từng
// request. Gỡ "?lang=vi" để đổi sang ISR toàn trang sẽ làm mất bản tiếng Việt của
// trang chủ — không đánh đổi. Thay vào đó, phần TỐN KÉM thật sự (liệt kê + xếp
// hạng danh mục/nhà cung cấp) được cache riêng bằng unstable_cache ngay trong
// home.tsx — vẫn đạt mục tiêu giảm tải, không phải dựng lại từ đầu mỗi request,
// mà không phải hy sinh tính năng song ngữ.

/**
 * Ảnh nền trang chủ do mình tự đặt: thả một trong các tệp dưới vào đúng thư mục là trang
 * dùng ngay, không phải sửa mã. Chưa có tệp nào thì giữ ảnh thật trên Pexels.
 * Kích thước nên xuất: 1600x1067, WebP hoặc JPG dưới 300 KB, chủ thể lệch phải.
 * Xem thêm public/images/home/README.md.
 */
const HOME_HERO_LOCAL_FILES = [
  "/images/home/hero-farmer.webp",
  "/images/home/hero-farmer.jpg",
  "/images/home/hero-farmer.png",
] as const;

const HOME_TITLE = "Vexim Trade – Find Verified Food & Agricultural Products and Suppliers in Vietnam";
const HOME_TITLE_VI = "Vexim Trade – Tìm Nhà Cung Cấp Nông Sản & Thực Phẩm Việt Nam Đã Xác Minh";
const HOME_DESCRIPTION = HOME_META_DESCRIPTION;
const HOME_DESCRIPTION_VI = HOME_META_DESCRIPTION_VI;
const HOME_IMAGE = "/images/home/hero-cashew-texture.jpg";

/**
 * Trang chủ đọc `?lang=vi` để dựng bản tiếng Việt (xem HomeContent/home.tsx) — metadata
 * phải động theo cùng tham số đó, nếu không bản tiếng Việt vẫn hiện tiêu đề/mô tả tiếng
 * Anh trên kết quả tìm kiếm Google dù nội dung trang đã là tiếng Việt. `alternates.languages`
 * khai hreflang en/vi/x-default để Google biết đây là hai biến thể ngôn ngữ của cùng một
 * trang, không phải nội dung trùng lặp.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const isVi = params?.lang === "vi";
  const title = isVi ? HOME_TITLE_VI : HOME_TITLE;
  const description = isVi ? HOME_DESCRIPTION_VI : HOME_DESCRIPTION;
  const canonical = isVi ? "/?lang=vi" : "/";
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical,
      languages: { en: "/", vi: "/?lang=vi", "x-default": "/" },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Vexim Trade",
      type: "website",
      locale: isVi ? "vi_VN" : "en_US",
      images: [{ url: HOME_IMAGE, alt: "Verified Vietnamese food & agricultural products on Vexim Trade" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [HOME_IMAGE],
    },
  };
}

/**
 * Root công khai (/) — trang chủ Vexim Trade đa ngành (song ngữ Anh - Việt, mặc định Tiếng Anh).
 * - Đã đăng nhập / host nội bộ (crm.*, *.vercel.app) → chuyển hướng ở middleware.ts, trước
 *   khi chạm tới trang này (xem middleware.ts để biết lý do tách ra khỏi đây).
 * - render HomeContent (hero đa ngành + CTA tới /rfq).
 * Layout của group (public) tự wrap header + footer.
 */
export default async function PublicHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; cat?: string; lang?: string }>;
}) {
  // Đọc mỗi lần render: thả ảnh vào public/images/home là trang đổi ngay, không phải restart.
  // Lưu ý: với revalidate=300, "mỗi lần render" ở đây là mỗi lần tái tạo trang tĩnh
  // (tối đa 1 lần/5 phút khi có traffic), không phải mỗi request — vẫn đổi ảnh được
  // ngay vì ISR revalidate theo thời gian, không cache vĩnh viễn.
  const heroLocal = HOME_HERO_LOCAL_FILES.find((file) =>
    existsSync(join(process.cwd(), "public", file))) ?? null;
  const params = searchParams ? await searchParams : {};
  const query = typeof params?.q === "string" ? params.q.trim().slice(0, 120) : "";
  const categoryFilter = typeof params?.cat === "string" ? params.cat.trim().slice(0, 60) : "";
  const lang: "en" | "vi" = params?.lang === "vi" ? "vi" : "en";
  // Schema nền cho trang chủ: tổ chức + website. Không khai SearchAction vì site không có trang tìm kiếm công khai.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: COMPANY.name,
        legalName: COMPANY.legalName,
        description:
          "Vexim Trade connects international and domestic buyers with verified Vietnamese food & agricultural suppliers across core product categories and sub-groups. Buyers can browse supplier listings, request a quote from a supplier they choose, or send requirements and we look for suppliers that match. Supplier verification covers business documents, automated certificate holder (Owner vs. Partner Entity) & expiration recognition, factory photo evidence, and export delivery history. Vexim also provides Vietnamese manufacturers with free marketplace listing, international trade website design, business banner advertising consultations, and US FDA compliance consulting. After an introduction, buyers contract directly with the chosen supplier; Vexim does not hold buyer payments.",
        url: SITE_URL,
        logo: `${SITE_URL}/logo-vexim.png`,
        email: COMPANY.contactEmail,
        telephone: COMPANY.phone,
        address: { "@type": "PostalAddress", streetAddress: COMPANY.address, addressCountry: "VN" },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: COMPANY.name,
        inLanguage: lang,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
  return (
    <>
      <GoogleTag />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <HomeContent query={query} categoryFilter={categoryFilter} lang={lang} heroSrc={heroLocal} />
    </>
  );
}
