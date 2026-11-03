import "server-only";

import { FROM_ADDRESS } from "@/lib/config";
import { transport, type TransportResult } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";

/**
 * Thư đăng nhập của người mua.
 *
 * Gửi qua `transport()` — cửa gửi duy nhất của hệ thống — để thư đăng nhập cũng được
 * kiểm danh sách ngừng nhận (bounce cứng, báo cáo thư rác) như mọi thư khác. Gọi thẳng
 * Resend ở đây sẽ tạo một đường thứ hai không ai kiểm soát.
 *
 * Nội dung tiếng Anh vì người mua là người mua quốc tế; nhân viên không nhận thư này.
 */

export interface BuyerSignInMailInput {
  email: string;
  /** URL tuyệt đối tới `/buyer/sign-in/verify?t=…` */
  linkUrl: string;
  code: string;
  /** Số phút còn hiệu lực, in vào thư để người đọc biết phải làm nhanh. */
  minutes: number;
}

function buildMail(input: BuyerSignInMailInput) {
  const subject = `${input.code} is your Vexim sign-in code`;
  const body = `
    <p style="margin:0 0 14px;">Use this code to sign in — it expires in ${input.minutes} minutes:</p>
    <p style="margin:0 0 18px;font-size:30px;font-weight:800;letter-spacing:8px;font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(input.code)}</p>
    <p style="margin:0 0 18px;">Or open this link on the same device:</p>
    <p style="margin:0 0 20px;"><a href="${escapeHtml(input.linkUrl)}" style="display:inline-block;padding:11px 20px;background:#0f766e;color:#ffffff;border-radius:8px;font-weight:700;text-decoration:none;">Sign in to Vexim</a></p>
    <p style="margin:0 0 10px;color:#475569;font-size:13px;">The link and the code both work once, and both expire in ${input.minutes} minutes. If the link has already been opened by your email security scanner, use the code above.</p>
    <p style="margin:0;color:#475569;font-size:13px;">Didn't request this? You can ignore this email — nothing happens until the code or link is used.</p>`;
  const text = [
    "Sign in to Vexim",
    "",
    `Your code (expires in ${input.minutes} minutes): ${input.code}`,
    "",
    `Or open this link: ${input.linkUrl}`,
    "",
    "The link and the code both work once, and both expire.",
    "If the link was already opened by your email security scanner, use the code above.",
    "Didn't request this? Ignore this email — nothing happens until the code or link is used.",
  ].join("\n");

  return {
    to: [input.email],
    from: FROM_ADDRESS,
    subject,
    html: wrapPlainEmail({ title: "Sign in to Vexim", body, preheader: `${input.code} — expires in ${input.minutes} minutes` }),
    text,
  };
}

export async function sendBuyerSignInEmail(input: BuyerSignInMailInput): Promise<TransportResult> {
  return transport(buildMail(input));
}
