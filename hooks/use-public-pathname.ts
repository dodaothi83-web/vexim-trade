"use client";

import { usePathname } from "next/navigation";

import { toPublicPathname } from "@/lib/public/home-route";

/**
 * usePathname() cho các component của khu công khai. Trang chủ được dựng sẵn ở route nội bộ
 * /homepage/en|vi rồi middleware viết lại từ "/" (lib/public/home-route.ts): lúc dựng sẵn,
 * usePathname() thấy đường dẫn nội bộ, còn trên trình duyệt là "/". Hook này quy cả hai về "/"
 * để HTML dựng sẵn khớp lúc hydrate (không render thừa footer, đánh dấu đúng trang chủ...).
 */
export function usePublicPathname(): string {
  return toPublicPathname(usePathname());
}
