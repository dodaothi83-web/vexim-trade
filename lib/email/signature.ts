import { COMPANY } from "@/lib/config";

/** Chữ ký mặc định chèn vào email do đội ngũ tự soạn */
export function buildSignature(owner?: string | null): string {
  return [
    `<p>Best regards / Trân trọng,</p>`,
    `<p><strong>${owner || COMPANY.name}</strong><br/>`,
    `Export Department &middot; ${COMPANY.name}<br/>`,
    `${COMPANY.phone} &middot; ${COMPANY.email}<br/>`,
    `${COMPANY.website}</p>`,
  ].join("");
}
