import type { Locale } from "../config";
import { shellMessages, type ShellMessages } from "./shell";
import { overviewMessages, type OverviewMessages } from "./overview";

/**
 * Từ điển cổng nhà cung cấp, chia theo cụm để chuyển dần (giai đoạn 2).
 *
 * Mỗi cụm là một file riêng: `shell` (khung + menu), `overview` (trang tổng quan). Cụm mới
 * thì thêm một file và một khoá ở đây, không sửa file cũ.
 */
export type PortalMessages = {
  shell: ShellMessages;
  overview: OverviewMessages;
};

export const portalMessages: Record<Locale, PortalMessages> = {
  en: { shell: shellMessages.en, overview: overviewMessages.en },
  vi: { shell: shellMessages.vi, overview: overviewMessages.vi },
};

export type { ShellMessages, OverviewMessages };
