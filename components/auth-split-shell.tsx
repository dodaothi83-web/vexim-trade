import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand-logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { getAuthMessages } from "@/lib/i18n/server";

/**
 * Khung hai cột cho các trang tài khoản (đăng nhập, đăng ký, chọn loại tài khoản).
 *
 * Cột trái là ảnh thật của đội Vexim trong xưởng ở Việt Nam, kèm vài dòng nói rõ Vexim
 * làm gì. Ảnh chỉ để tạo bối cảnh, không phải bằng chứng: mọi khẳng định về xác minh vẫn
 * nằm ở trang /how-we-verify. Cột phải là form thuần, không nhồi đoạn văn dài vào trong.
 *
 * Ảnh là một tấm bo góc, thụt vào so với mép trên và hai bên (kiểu Alibaba): trang không
 * bị "dán" ảnh sát thanh địa chỉ, mà vẫn giữ được bối cảnh rộng khi cuộn.
 *
 * Mobile: ảnh ẩn, chỉ còn logo + form, để người dùng tập trung vào việc cần làm.
 * Ngôn ngữ đọc từ cookie nên mọi chuỗi trong khung đổi cùng lúc với phần form.
 */
export async function AuthSplitShell({
  children,
  caption,
  lede,
  points,
  note,
}: {
  children: ReactNode;
  /** Tiêu đề trên ảnh, hiện đè lên ảnh ở cột trái. */
  caption?: string;
  /** Một câu dẫn dưới tiêu đề: lợi ích cụ thể, không phải mô tả quy trình. */
  lede?: string;
  points?: readonly string[];
  /**
   * Ghi chú ngắn dưới thẻ, hiện ở mọi cỡ màn hình. Dùng cho thông tin người dùng phải biết
   * mà không được nhồi vào form (ví dụ hồ sơ nhà cung cấp cần Vexim duyệt trước).
   */
  note?: string;
}) {
  const { locale, m } = await getAuthMessages();

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:min-h-[calc(100vh_-_4rem)] lg:grid-cols-2 lg:gap-10 lg:p-8">
        <aside aria-hidden="true" className="relative hidden overflow-hidden rounded-3xl lg:block">
          {/* Ảnh có sẵn của site: đội Vexim dẫn người mua tham quan xưởng. */}
          <img
            src="/images/hero-scene.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900/85 via-ink-900/35 to-ink-900/10" />
          <div className="relative flex h-full flex-col justify-between p-8">
            <Link href="/" aria-label="Veximtrade home" className="flex items-center gap-3">
              <Logo tone="white" className="h-12 w-12" />
              <span className="text-[15px] font-black tracking-tight text-white">VEXIM TRADE</span>
            </Link>

            <div className="max-w-sm">
              <p className="border-l-2 border-white/60 pl-3 text-[20px] font-bold leading-snug text-white">
                {caption ?? m.register.shellCaption}
              </p>
              {lede && <p className="mt-2.5 pl-3 text-[13px] leading-relaxed text-white/85">{lede}</p>}
              <ul className="mt-4 space-y-1.5">
                {(points ?? m.register.shellPoints).map((point) => (
                  <li key={point} className="text-[12.5px] leading-relaxed text-white/80">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <div className="flex flex-col justify-center px-4 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-6 flex items-center justify-between gap-3">
              <Link href="/" aria-label="Veximtrade home" className="flex items-center gap-3">
                <Logo className="h-11 w-11" />
                <span className="text-[15px] font-black tracking-tight text-ink-900 lg:hidden">
                  VEXIM TRADE
                </span>
              </Link>
              <LocaleSwitch locale={locale} label={m.shell.languageLabel} />
            </div>
            <div className="card p-6 shadow-pop sm:p-7">{children}</div>
            {note && <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-600">{note}</p>}
            <nav
              aria-label={m.shell.languageLabel}
              className="mt-5 flex justify-center gap-5 text-xs font-medium text-ink-500"
            >
              <Link href="/chinh-sach-bao-mat" className="hover:text-ink-800 hover:underline">
                {m.shell.privacy}
              </Link>
              <Link href="/dieu-khoan-su-dung" className="hover:text-ink-800 hover:underline">
                {m.shell.terms}
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
