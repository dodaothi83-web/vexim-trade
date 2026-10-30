import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const NON_PRODUCTION = ["preview", "development"].includes(process.env.VERCEL_ENV ?? "") || process.env.VEXIM_DEPLOY_ENV === "staging";
const INDEXABLE = !NON_PRODUCTION && process.env.PUBLIC_SITE_INDEXABLE === "true";
const LEGAL_CRAWLABLE = !NON_PRODUCTION;

// Bot AI phục vụ tìm kiếm và trích dẫn câu trả lời cho người dùng.
const AI_ANSWER_BOTS = [
  "OAI-SearchBot",      // ChatGPT Search
  "ChatGPT-User",       // ChatGPT duyệt web theo yêu cầu người dùng
  "PerplexityBot",      // Perplexity lập chỉ mục
  "Perplexity-User",    // Perplexity duyệt web theo yêu cầu người dùng
  "Claude-SearchBot",   // Claude tìm kiếm
  "Claude-User",        // Claude duyệt web theo yêu cầu người dùng
];

// Bot AI thu thập dữ liệu phục vụ huấn luyện mô hình.
const AI_TRAINING_BOTS = [
  "GPTBot",             // OpenAI
  "ClaudeBot",          // Anthropic
  "anthropic-ai",       // Anthropic (tên cũ)
  "CCBot",              // Common Crawl
  "Google-Extended",    // Google AI training
  "Applebot-Extended",  // Apple AI training
  "Meta-ExternalAgent", // Meta AI
  "cohere-ai",          // Cohere
];

export default function robots(): MetadataRoute.Robots {
  // Always-disallowed routes (RFQ flow, compare state, back-office, auth, preview, API internals)
  const alwaysDisallow = [
    "/api/",
    "/rfq",
    "/rfq/",
    "/compare",
    "/crm",
    "/crm/",
    "/auth",
    "/auth/",
    "/login",
    "/login/",
    "/_next/",
  ];

  if (INDEXABLE) {
    return {
      rules: [
        { userAgent: "*", allow: "/", disallow: alwaysDisallow },
        // Khai báo tường minh từng nhóm bot AI để sau này chỉ cần sửa tại đây
        // khi muốn đổi chính sách, thay vì đụng vào quy tắc chung.
        // Mọi bot AI vẫn bị chặn khỏi khu vực nội bộ như bot thường.
        ...AI_ANSWER_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: alwaysDisallow })),
        ...AI_TRAINING_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: alwaysDisallow })),
      ],
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }

  // Pre-launch production: OAuth reviewers can crawl the exact homepage (/$)
  // and legal disclosures. Preview/development stays fully disallowed.
  return {
    rules: LEGAL_CRAWLABLE
      ? [{ userAgent: "*", allow: ["/$", "/privacy-policy", "/cookie-policy", "/terms-of-service", "/thong-tin-chu-quan", "/quy-che-hoat-dong", "/dieu-khoan-su-dung", "/chinh-sach-bao-mat", "/khieu-nai"], disallow: "/" }]
      : [{ userAgent: "*", disallow: "/" }],
  };
}
