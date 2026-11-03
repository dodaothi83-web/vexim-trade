"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, Factory, ShoppingBag } from "lucide-react";

import { cx } from "@/components/ui";

/**
 * Chọn loại tài khoản (Buyer / Supplier) ngay trong màn đăng ký.
 *
 * Đích đến khác nhau nên không thể gộp một form: người mua không cần tài khoản, họ đi
 * thẳng vào phễu báo giá; người bán đi vào biểu mẫu đăng ký nhà cung cấp hiện có. Nút
 * Continue là một Link thật nên vẫn dùng được khi JavaScript chưa tải xong.
 */
type Choice = "buyer" | "supplier";

const OPTIONS: Array<{
  id: Choice;
  title: string;
  summary: string;
  href: string;
  icon: React.ReactNode;
}> = [
  {
    id: "buyer",
    title: "Buyer",
    summary: "Send a quote request and compare offers from matched Vietnamese suppliers. No account needed.",
    href: "/rfq",
    icon: <ShoppingBag className="h-5 w-5" aria-hidden="true" />,
  },
  {
    id: "supplier",
    title: "Supplier",
    summary: "Create an account, complete your company profile and receive buyer requests once Vexim reviews it.",
    href: "/supplier/register?type=supplier",
    icon: <Factory className="h-5 w-5" aria-hidden="true" />,
  },
];

export function AccountTypeChooser() {
  const [choice, setChoice] = useState<Choice>("buyer");
  const name = useId();
  const target = OPTIONS.find((option) => option.id === choice) ?? OPTIONS[0];

  return (
    <div>
      <fieldset>
        <legend className="text-[17px] font-black leading-snug text-ink-900">
          Which account would you like to create?
        </legend>
        <div className="mt-4 space-y-3">
          {OPTIONS.map((option) => {
            const selected = choice === option.id;
            return (
              <label
                key={option.id}
                className={cx(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
                  selected ? "border-brand-600 bg-brand-50/60 ring-1 ring-brand-600" : "border-ink-200 hover:border-ink-400",
                )}
              >
                <input
                  type="radio"
                  name={`account-type-${name}`}
                  value={option.id}
                  checked={selected}
                  onChange={() => setChoice(option.id)}
                  className="mt-1 h-4 w-4 shrink-0 border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[14.5px] font-bold text-ink-900">
                    <span className={selected ? "text-brand-700" : "text-ink-400"}>{option.icon}</span>
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-600">{option.summary}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Link
        href={target.href}
        className="btn btn-primary mt-5 min-h-12 w-full justify-center text-[15px] font-bold"
      >
        Continue
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>

      <p className="mt-4 text-center text-[12.5px] text-ink-600">
        Already have an account?{" "}
        <Link href="/login" prefetch={false} className="font-semibold text-brand-700 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
