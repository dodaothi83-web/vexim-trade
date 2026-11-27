/**
 * Chủ đề bài hướng dẫn nhà cung cấp (nguồn duy nhất). Thêm chủ đề mới ở đây; mã lưu trong
 * cột `supplier_guides.topic`, không đổi mã cũ để bài đã đăng không mất chủ đề.
 */
import type { VeximIconName } from "@/components/brand/vexim-icons";

export interface GuideTopic {
  slug: string;
  /** Biểu tượng nghiệp vụ đã duyệt (hướng 02, docs/brand-identity.md) cho bìa thẻ và lộ trình. */
  icon: VeximIconName;
  label: { vi: string; en: string };
  description: { vi: string; en: string };
}

export const GUIDE_TOPICS: GuideTopic[] = [
  { slug: "bat-dau", icon: "account", label: { vi: "Bắt đầu", en: "Getting started" },
    description: { vi: "Tạo tài khoản, điền hồ sơ và những việc cần làm trong tuần đầu.", en: "Your account, your profile and what to do in the first week." } },
  { slug: "ho-so-xac-minh", icon: "inspection", label: { vi: "Hồ sơ & xác minh", en: "Profile & verification" },
    description: { vi: "Hoàn thiện hồ sơ doanh nghiệp, chuẩn bị giấy tờ và các bước xác minh.", en: "Complete your company profile, prepare documents and get verified." } },
  { slug: "san-pham", icon: "samples", label: { vi: "Đăng sản phẩm", en: "Listing products" },
    description: { vi: "Đăng sản phẩm, ảnh, quy cách, giá và nội dung A+.", en: "Products, photos, specifications, prices and A+ content." } },
  { slug: "bao-gia", icon: "sourcing-request", label: { vi: "Yêu cầu báo giá", en: "Quote requests" },
    description: { vi: "Nhận, trả lời yêu cầu báo giá và trao đổi với người mua.", en: "Receive and answer quote requests and talk with buyers." } },
  { slug: "goi-dich-vu", icon: "platform-support", label: { vi: "Gói dịch vụ & quảng bá", en: "Plans & promotion" },
    description: { vi: "Quyền lợi các gói, đẩy sản phẩm và tăng lượt xem gian hàng.", en: "Plan benefits, product boosts and more storefront views." } },
];

export const GUIDE_TOPIC_SLUGS = GUIDE_TOPICS.map((topic) => topic.slug);
export const DEFAULT_GUIDE_TOPIC = GUIDE_TOPICS[0].slug;

export function guideTopic(slug: string): GuideTopic | null {
  return GUIDE_TOPICS.find((topic) => topic.slug === slug) ?? null;
}
