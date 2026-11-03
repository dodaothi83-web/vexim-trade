import type { Metadata } from "next";

import { AuthSplitShell } from "@/components/auth-split-shell";
import { AccountTypeChooser } from "./account-type-chooser";

/**
 * Cửa vào tài khoản: hai loại người dùng, hai luồng khác nhau.
 *
 * Nội dung giải thích đặt ở đây (ngoài form), để biểu mẫu đăng ký nhà cung cấp chỉ còn
 * đúng những ô cần điền.
 */
export const metadata: Metadata = {
  title: "Create an account | Veximtrade",
  description:
    "Create a supplier account to list Vietnamese products, or send a sourcing request as a buyer without creating an account.",
  robots: { index: false, follow: true },
};

export default function RegisterPage() {
  return (
    <AuthSplitShell
      caption="Meet the team that checks the factory before you do."
      points={[
        "Buyers: send a request for a quote and get offers from matched Vietnamese suppliers.",
        "Suppliers: create an account, then complete the company profile for Vexim to review.",
        "Buyers pay nothing and contract directly with the supplier they choose.",
      ]}
    >
      <AccountTypeChooser />

      <div className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-[12px] leading-relaxed text-ink-500">
        <p>
          <strong className="font-semibold text-ink-700">Buyer accounts are still being built.</strong>{" "}
          Until they open, your quote request and its private status link work without signing in.
        </p>
        <p>
          <strong className="font-semibold text-ink-700">Supplier accounts</strong> start with an account
          and an email or Google confirmation. The account only opens the overview and the company
          profile form; Vexim reviews the profile before product management and RFQs are enabled. The
          supplier application form is in Vietnamese.
        </p>
      </div>
    </AuthSplitShell>
  );
}
