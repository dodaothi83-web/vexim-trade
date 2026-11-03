import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Factory, ShoppingBag } from "lucide-react";

import { Breadcrumbs } from "@/components/ui";

/**
 * Cửa vào tài khoản: tách rõ hai loại người dùng ngay từ đầu.
 *
 * Trước đây header chỉ có "Supplier sign in", nên một người mua quốc tế bấm vào sẽ gặp
 * biểu mẫu đăng ký bán hàng bằng tiếng Việt. Trang này là chỗ sửa lỗi dẫn nhầm đó: người
 * mua được dẫn tới đúng việc họ cần (gửi yêu cầu báo giá, không cần tài khoản), người bán
 * tới biểu mẫu đăng ký nhà cung cấp hiện có.
 *
 * Chưa có tài khoản người mua: trang KHÔNG được hứa hẹn một biểu mẫu chưa tồn tại, và
 * không được chặn phễu báo giá bằng cách bắt đăng nhập.
 */
export const metadata: Metadata = {
  title: "Create an account | Veximtrade",
  description:
    "Choose a supplier account to list Vietnamese products, or send a sourcing request as a buyer without creating an account.",
  robots: { index: false, follow: true },
};

type Option = {
  id: "buyer" | "supplier";
  eyebrow: string;
  title: string;
  summary: string;
  points: string[];
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
  note: string;
  icon: React.ReactNode;
};

const OPTIONS: Option[] = [
  {
    id: "buyer",
    eyebrow: "For importers, brands and distributors",
    title: "Buyer",
    summary:
      "Send a request for a quote and compare offers from matched Vietnamese suppliers. Free, and no account needed to start.",
    points: [
      "Send a request for a quote in about two minutes",
      "Suppliers are matched on your requirements only",
      "Your contact details stay private until you approve an introduction",
    ],
    primary: { href: "/rfq", label: "Send a quote request" },
    secondary: { href: "/how-it-works", label: "How it works" },
    note:
      "Buyer accounts are still being built. Until they open, your request and its private status link work without signing in.",
    icon: <ShoppingBag className="h-5 w-5" aria-hidden="true" />,
  },
  {
    id: "supplier",
    eyebrow: "For Vietnamese manufacturers and exporters",
    title: "Supplier",
    summary:
      "Create an account, complete your company profile and receive buyer requests for quotes once Vexim has reviewed it.",
    points: [
      "Account first, company profile second",
      "Vexim reviews the profile before portal tools open",
      "Requests land in your inbox and the supplier dashboard",
    ],
    primary: { href: "/supplier/register", label: "Create supplier account" },
    secondary: { href: "/how-we-verify", label: "How we verify" },
    note: "The supplier application form is in Vietnamese.",
    icon: <Factory className="h-5 w-5" aria-hidden="true" />,
  },
];

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Create an account" }]} />

      <h1 className="mt-4 text-[30px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[38px]">
        Create an account
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-700">
        Two kinds of account. Pick the one that matches what you do, or keep reading if you only want
        to buy.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <section
            key={option.id}
            aria-labelledby={`register-${option.id}`}
            className="card flex flex-col p-5 sm:p-6"
          >
            <span className="inline-flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wider text-brand-700">
              {option.icon}
              {option.eyebrow}
            </span>
            <h2 id={`register-${option.id}`} className="mt-3 text-[22px] font-bold text-ink-900">
              {option.title}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-700">{option.summary}</p>

            <ul className="mt-4 space-y-2">
              {option.points.map((point) => (
                <li key={point} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={option.primary.href}
                prefetch={false}
                className="btn btn-primary min-h-11 justify-center px-5 text-[14px] font-bold"
              >
                {option.primary.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href={option.secondary.href}
                className="text-[13px] font-semibold text-brand-700 underline underline-offset-2"
              >
                {option.secondary.label}
              </Link>
            </div>

            <p className="mt-4 border-t border-ink-100 pt-3 text-[12px] leading-relaxed text-ink-500">
              {option.note}
            </p>
          </section>
        ))}
      </div>

      <p className="mt-8 text-[13.5px] text-ink-700">
        Already have an account?{" "}
        <Link href="/login" prefetch={false} className="font-semibold text-brand-700 underline underline-offset-2">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-500">
        Buying is free. Vexim never holds your payment: you sign the contract directly with the
        supplier you choose.
      </p>
    </div>
  );
}
