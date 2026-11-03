import type { Metadata } from "next";

import { AuthSplitShell } from "@/components/auth-split-shell";
import { getAuthMessages } from "@/lib/i18n/server";
import { AccountTypeChooser } from "./account-type-chooser";

/**
 * Cửa vào tài khoản: hai loại người dùng, hai luồng khác nhau.
 *
 * Nội dung giải thích đặt ở đây (ngoài form), để biểu mẫu đăng ký nhà cung cấp chỉ còn
 * đúng những ô cần điền.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAuthMessages();
  return {
    title: m.register.metaTitle,
    description:
      "Create a supplier account to list Vietnamese products, or send a sourcing request as a buyer without creating an account.",
    robots: { index: false, follow: true },
  };
}

export default async function RegisterPage() {
  const { locale, m } = await getAuthMessages();

  return (
    <AuthSplitShell caption={m.register.shellCaption} points={m.register.shellPoints}>
      <AccountTypeChooser messages={m.register} lang={locale} />

      <div className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-[12px] leading-relaxed text-ink-500">
        <p>
          <strong className="font-semibold text-ink-700">{m.register.buyerNoteLead}</strong>{" "}
          {m.register.buyerNote}
        </p>
        <p>
          <strong className="font-semibold text-ink-700">{m.register.supplierNoteLead}</strong>{" "}
          {m.register.supplierNote}
        </p>
      </div>
    </AuthSplitShell>
  );
}
