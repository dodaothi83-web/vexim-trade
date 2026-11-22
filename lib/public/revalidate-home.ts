import "server-only";

import { revalidatePath } from "next/cache";

import { HOME_RENDER_PREFIX } from "@/lib/public/home-route";

/**
 * Làm mới trang chủ sau khi dữ liệu hiển thị trên đó đổi (duyệt sản phẩm, công bố danh mục...).
 * Trang chủ có hai bản: bản động ở "/" (khi lọc ?q=/?cat=) và bản dựng sẵn theo ngôn ngữ ở
 * /homepage/[lang] mà middleware viết lại từ "/" — revalidatePath("/") một mình KHÔNG xoá bản
 * dựng sẵn, nên mọi nơi muốn làm mới trang chủ gọi hàm này thay cho revalidatePath("/").
 */
export function revalidateHomePage(): void {
  revalidatePath("/");
  revalidatePath(`${HOME_RENDER_PREFIX}/[lang]`, "page");
}
