import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import brandColors from "@/lib/brand/colors.json";

/**
 * Ảnh xem trước khi chia sẻ link trang chủ (Zalo, Facebook, LinkedIn, Google, ChatGPT…).
 *
 * Trước đây trang chủ dùng ảnh hạt điều (ảnh hero dự phòng), nên link sàn đa ngành trông như trang
 * chỉ bán hạt điều. Ảnh này chỉ dùng nhận diện có sẵn: logo V gốc (không vẽ lại), nền navy 700 và
 * chữ Be Vietnam Pro (docs/brand-identity.md). Câu chữ khớp tiêu đề/mô tả trang chủ.
 *
 * Dựng một lần lúc build (route force-static). Kích thước chuẩn 1200 x 630.
 */
export const HOME_SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export type HomeShareLang = "en" | "vi";

export const HOME_SHARE_IMAGE_PATH: Record<HomeShareLang, string> = {
  en: "/og/home-en.png",
  vi: "/og/home-vi.png",
};

const COPY: Record<HomeShareLang, { headline: string; line: string; alt: string }> = {
  en: {
    headline: "Find verified food & agricultural suppliers in Vietnam",
    line: "Request a quote from the supplier you choose, or ask us to look for one.",
    alt: "Vexim Trade – Find verified food & agricultural suppliers in Vietnam",
  },
  vi: {
    headline: "Tìm nhà cung cấp nông sản & thực phẩm Việt Nam đã xác minh",
    line: "Gửi yêu cầu báo giá cho nhà cung cấp bạn chọn, hoặc nhờ chúng tôi tìm giúp.",
    alt: "Vexim Trade – Tìm nhà cung cấp nông sản & thực phẩm Việt Nam đã xác minh",
  },
};

export const HOME_SHARE_IMAGE_ALT: Record<HomeShareLang, string> = { en: COPY.en.alt, vi: COPY.vi.alt };

/**
 * Font Be Vietnam Pro bản đầy đủ (SIL OFL, kèm OFL.txt). Không dùng hai bộ cắt nhỏ latin + tiếng
 * Việt của @fontsource: trình dựng ảnh ghép hai bộ thì đo sai khoảng trắng cạnh chữ có dấu.
 */
const FONT_DIR = join(process.cwd(), "assets", "fonts", "be-vietnam-pro");

export async function homeShareImage(lang: HomeShareLang): Promise<ImageResponse> {
  const copy = COPY[lang];
  const [logo, semiBold, extraBold] = await Promise.all([
    readFile(join(process.cwd(), "public", "logo-vexim-white-mark.png"), "base64"),
    readFile(join(FONT_DIR, "BeVietnamPro-SemiBold.ttf")),
    readFile(join(FONT_DIR, "BeVietnamPro-ExtraBold.ttf")),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "56px 80px 64px", backgroundColor: brandColors.primary, color: "#FFFFFF", fontFamily: "Be Vietnam Pro" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginLeft: -14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${logo}`} width={112} height={112} alt="" />
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.5 }}>Vexim Trade</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: lang === "vi" ? 58 : 62, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1, maxWidth: 1040 }}>{copy.headline}</div>
          <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.35, color: brandColors.selected, maxWidth: 960 }}>{copy.line}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: brandColors.selected }}>www.veximtrade.com</div>
      </div>
    ),
    {
      ...HOME_SHARE_IMAGE_SIZE,
      fonts: [
        { name: "Be Vietnam Pro", data: semiBold, weight: 600, style: "normal" },
        { name: "Be Vietnam Pro", data: extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
