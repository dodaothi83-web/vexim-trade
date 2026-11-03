import type { Locale } from "../config";
import { shellMessages, type ShellMessages } from "./shell";
import { productsMessages, type ProductsMessages } from "./products";
import { productEditorMessages, type ProductEditorMessages } from "./product-editor";
import { overviewMessages, type OverviewMessages } from "./overview";
import { profileMessages, type ProfileMessages } from "./profile";
import { onboardingMessages, type OnboardingMessages } from "./onboarding";
import { sharedMessages, type SharedMessages } from "./shared";
import { verificationMessages, type VerificationMessages } from "./verification";
import { documentsMessages, type DocumentsMessages } from "./documents";
import { boostMessages, type BoostMessages } from "./boost";
import { rfqsMessages, type RfqsMessages } from "./rfqs";
import { categoriesMessages, type CategoriesMessages } from "./categories";
import { trafficMessages, type TrafficMessages } from "./traffic";
import { storefrontMessages, type StorefrontMessages } from "./storefront";
import { noticesMessages, type NoticesMessages } from "./notices";
import { quantityMessages, type QuantityMessages } from "./quantity";

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
  products: ProductsMessages;
  productEditor: ProductEditorMessages;
  profile: ProfileMessages;
  onboarding: OnboardingMessages;
  verification: VerificationMessages;
  documents: DocumentsMessages;
  boost: BoostMessages;
  rfqs: RfqsMessages;
  categories: CategoriesMessages;
  traffic: TrafficMessages;
  storefront: StorefrontMessages;
  notices: NoticesMessages;
  quantity: QuantityMessages;
};

export const portalMessages: Record<Locale, PortalMessages> = {
  en: {
    shared: sharedMessages.en,
    shell: shellMessages.en,
    overview: overviewMessages.en,
    products: productsMessages.en,
    productEditor: productEditorMessages.en,
    profile: profileMessages.en,
    onboarding: onboardingMessages.en,
    verification: verificationMessages.en,
    documents: documentsMessages.en,
    boost: boostMessages.en,
    rfqs: rfqsMessages.en,
    categories: categoriesMessages.en,
    traffic: trafficMessages.en,
    storefront: storefrontMessages.en,
    notices: noticesMessages.en,
    quantity: quantityMessages.en,
  },
  vi: {
    shared: sharedMessages.vi,
    shell: shellMessages.vi,
    overview: overviewMessages.vi,
    products: productsMessages.vi,
    productEditor: productEditorMessages.vi,
    profile: profileMessages.vi,
    onboarding: onboardingMessages.vi,
    verification: verificationMessages.vi,
    documents: documentsMessages.vi,
    boost: boostMessages.vi,
    rfqs: rfqsMessages.vi,
    categories: categoriesMessages.vi,
    traffic: trafficMessages.vi,
    storefront: storefrontMessages.vi,
    notices: noticesMessages.vi,
    quantity: quantityMessages.vi,
  },
};

export type { SharedMessages, ShellMessages, OverviewMessages, ProfileMessages, OnboardingMessages, ProductsMessages, ProductEditorMessages, VerificationMessages, DocumentsMessages, BoostMessages, RfqsMessages, CategoriesMessages, TrafficMessages, StorefrontMessages, NoticesMessages, QuantityMessages };
