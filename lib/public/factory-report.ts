import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

/**
 * Báo cáo xác minh nhà máy L2 mà người mua đã đăng nhập tải về.
 *
 * Chỉ chứa phần công khai: tên doanh nghiệp, tỉnh/thành, phương thức, ngày, thời lượng,
 * họ tên người kiểm, trạng thái từng mục và ảnh do người kiểm chọn. Không có ghi chú
 * nội bộ, số điện thoại, địa chỉ chi tiết, hợp đồng hay ảnh không được chọn.
 */
export interface FactoryReportItem { key: string; group: string; groupLabel: string; label: string; status: "seen" | "not_seen" | "not_applicable" | "not_recorded" }

export interface FactoryReportData {
  code: string;
  supplierName: string;
  partnerFactoryName: string | null;
  partner: boolean;
  region: string | null;
  method: string;
  reviewedAt: string;
  durationMinutes: number | null;
  inspectorName: string;
  approvedAt: string;
  items: FactoryReportItem[];
  verifyUrl: string;
  supplierUrl: string | null;
}

export interface FactoryReportPhoto { dataUrl: string; caption: string }

const STATUS_TEXT: Record<FactoryReportItem["status"], string> = {
  seen: "Seen", not_seen: "Not seen", not_applicable: "Not applicable", not_recorded: "Not recorded",
};
const STATUS_COLOR: Record<FactoryReportItem["status"], string> = {
  seen: "#047857", not_seen: "#B91C1C", not_applicable: "#64748B", not_recorded: "#64748B",
};

/** Lấy tỉnh/thành từ địa chỉ: phần cuối sau dấu phẩy, bỏ "Việt Nam". Không công khai địa chỉ chi tiết. */
export function regionFromAddress(address: string | null | undefined): string | null {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean)
    .filter((part) => !/^(viet ?nam|việt nam|vn)$/i.test(part));
  const last = parts.at(-1);
  return last && !/\d{3,}/.test(last) ? last.slice(0, 80) : null;
}

export function factoryReportPdfDefinition(report: FactoryReportData, photos: FactoryReportPhoto[]): TDocumentDefinitions {
  const navy = "#1F3E74";
  const meta = (label: string, value: string): Content => ({ columns: [
    { width: 130, text: label, color: "#475569" },
    { width: "*", text: value, bold: true },
  ], margin: [0, 2, 0, 2] });
  const groups = [...new Set(report.items.map((item) => item.groupLabel))];
  const checklist: Content[] = groups.flatMap((group) => [
    { text: group, bold: true, color: navy, margin: [0, 8, 0, 3] } as Content,
    {
      table: { widths: ["*", 90], body: report.items.filter((item) => item.groupLabel === group).map((item) => [
        { text: item.label },
        { text: STATUS_TEXT[item.status], bold: true, color: STATUS_COLOR[item.status], alignment: "right" },
      ]) },
      layout: { hLineColor: () => "#E2E8F0", vLineWidth: () => 0, hLineWidth: (i: number) => i === 0 ? 0 : 0.5, paddingTop: () => 4, paddingBottom: () => 4 },
    } as Content,
  ]);
  // Ảnh xếp 2 ảnh một hàng, cùng chiều rộng.
  const rows: Content[] = [];
  for (let i = 0; i < photos.length; i += 2) {
    const pair = photos.slice(i, i + 2);
    rows.push({ columns: pair.map((photo) => ({ width: "*", stack: [
      { image: photo.dataUrl, fit: [245, 184], alignment: "center" },
      { text: photo.caption, fontSize: 8, color: "#475569", alignment: "center", margin: [0, 3, 0, 0] },
    ] })).concat(pair.length === 1 ? [{ width: "*", text: "" } as never] : []), columnGap: 12, margin: [0, 6, 0, 6] } as Content);
  }
  return {
    pageSize: "A4",
    pageMargins: [40, 48, 40, 56],
    info: { title: `Vexim factory review ${report.code}`, author: "Vexim Trade", subject: report.supplierName },
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: "#0F172A", lineHeight: 1.2 },
    footer: (page: number, pages: number) => ({ columns: [
      { text: `Report ${report.code} · verify at ${report.verifyUrl.replace(/^https?:\/\/(www\.)?/, "")}`, fontSize: 7.5, color: "#64748B" },
      { text: `${page}/${pages}`, alignment: "right", fontSize: 7.5, color: "#64748B" },
    ], margin: [40, 16, 40, 0] }),
    content: [
      { columns: [
        { width: "*", stack: [
          { text: "VEXIM TRADE", bold: true, color: navy, fontSize: 10, characterSpacing: 1.5 },
          { text: report.partner ? "Partner factory review" : "Factory review", bold: true, fontSize: 18, margin: [0, 4, 0, 2] },
          { text: report.supplierName, fontSize: 12, bold: true },
          ...(report.partner && report.partnerFactoryName ? [{ text: `Partner factory: ${report.partnerFactoryName}`, margin: [0, 2, 0, 0] } as Content] : []),
        ] },
        { width: 90, stack: [
          { qr: report.verifyUrl, fit: 82, alignment: "right" },
          { text: report.code, fontSize: 7.5, alignment: "right", margin: [0, 3, 0, 0], color: "#475569" },
        ] },
      ] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#CBD5E1" }], margin: [0, 10, 0, 8] },
      meta("Method", report.method),
      meta("Review date", report.reviewedAt + (report.durationMinutes ? ` · ${report.durationMinutes} min` : "")),
      meta("Reviewed by", `${report.inspectorName}, Vexim review lead`),
      ...(report.region ? [meta("Province / city", report.region)] : []),
      meta("Approved", report.approvedAt),
      { text: "What was observed", bold: true, fontSize: 12, margin: [0, 14, 0, 0] },
      ...checklist,
      ...(photos.length ? [
        { text: "Photos selected by the reviewer", bold: true, fontSize: 12, margin: [0, 16, 0, 2], pageBreak: "before" } as Content,
        { text: "Screenshots or on-site photos taken by Vexim during the review. They show the facility at that time only.", color: "#475569", margin: [0, 0, 0, 4] } as Content,
        ...rows,
      ] : []),
      { text: "Scope of this report", bold: true, fontSize: 11, margin: [0, 16, 0, 4] },
      { ul: [
        "This is Vexim's own review, carried out by the named staff member. It is not an independent third-party audit.",
        "It records what was observed during the call or visit on the review date. It does not certify products, quality, capacity or future shipments.",
        report.partner ? "The supplier's contract with this partner factory was reviewed. This does not mean the supplier owns the factory." : "Supplier business type is not verification; only the items marked Seen were observed.",
        `Check that this report is genuine at ${report.verifyUrl}`,
      ], color: "#334155" },
    ],
  };
}
