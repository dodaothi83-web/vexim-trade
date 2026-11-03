import type { Locale } from "../config";
import { shellMessages, type ShellMessages } from "./shell";
import { overviewMessages, type OverviewMessages } from "./overview";
import { profileMessages, type ProfileMessages } from "./profile";
import { onboardingMessages, type OnboardingMessages } from "./onboarding";
import { sharedMessages, type SharedMessages } from "./shared";

/**
 * Từ điển cổng nhà cung cấp, chia theo cụm để chuyển dần (giai đoạn 2).
 *
 * Mỗi cụm là một file riêng: `shell` (khung + menu), `overview` (trang tổng quan). Cụm mới
 * thì thêm một file và một khoá ở đây, không sửa file cũ.
 */
export type PortalMessages = {
  shared: SharedMessages;
  shell: ShellMessages;
  overview: OverviewMessages;
  profile: ProfileMessages;
  onboarding: OnboardingMessages;
};

export const portalMessages: Record<Locale, PortalMessages> = {
  en: {
    shared: sharedMessages.en,
    shell: shellMessages.en,
    overview: overviewMessages.en,
    profile: profileMessages.en,
    onboarding: onboardingMessages.en,
  },
  vi: {
    shared: sharedMessages.vi,
    shell: shellMessages.vi,
    overview: overviewMessages.vi,
    profile: profileMessages.vi,
    onboarding: onboardingMessages.vi,
  },
};

export type { SharedMessages, ShellMessages, OverviewMessages, ProfileMessages, OnboardingMessages };
