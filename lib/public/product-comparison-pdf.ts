import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { PublicComparedProduct } from "@/lib/public/product-comparison-data";
import { productComparisonWarnings } from "@/lib/public/product-comparison";
import { verificationLabel } from "@/lib/verification-status";

/** A4 landscape, 15mm content margins. Text stays searchable, with embedded Unicode fonts. */
export const COMPARISON_PDF_MARGIN = 15 * 72 / 25.4;
export function comparisonPdfDefinition(products: PublicComparedProduct[], origin: string, generatedAt = new Date()): TDocumentDefinitions {
  if (products.length < 2 || products.length > 3) throw new Error("Select 2 or 3 public products");
  const sameCategory = new Set(products.map((p) => p.categorySlug)).size === 1;
  const body: TableCell[][] = [[
    { text: "Criterion", bold: true, color: "#FFFFFF", fillColor: "#203D70" },
    ...products.map((p) => ({ stack: [{ text: p.name, bold: true, link: new URL(p.href, origin).href }, { text: p.supplierName, margin: [0, 4, 0, 0] as [number, number, number, number] }], color: "#FFFFFF", fillColor: "#203D70" })),
  ]];
  const value = (input: string | null | undefined) => input?.trim() || "Not provided";
  const row = (label: string, get: (p: PublicComparedProduct) => string) => body.push([{ text: label, bold: true }, ...products.map((p) => ({ text: get(p) }))]);
  const section = (label: string) => body.push([{ text: label, colSpan: products.length + 1, bold: true, fillColor: "#EDF1F7", color: "#203D70" }, ...products.map(() => ({}))]);
  section("Product");
  row("Category", (p) => value(p.categoryName));
  if (sameCategory) {
    row("Grade", (p) => value(p.grade));
    const keys = new Map<string, string>();
    products.forEach((p) => p.specifications.forEach((s) => { if (!keys.has(s.key)) keys.set(s.key, s.label); }));
    keys.forEach((label, key) => row(label, (p) => value(p.specifications.find((s) => s.key === key)?.value)));
  }
  section("Commercial terms");
  row("Reference price", (p) => p.price || "On request");
  row("Price valid until", (p) => p.price ? value(p.priceValidUntil) : "On request");
  row("MOQ", (p) => value(p.moq));
  row("Packaging", (p) => value(p.packaging));
  row("Lead time", (p) => p.leadTimeText?.trim() || (p.leadTimeDays !== null ? `${p.leadTimeDays} days` : "On request"));
  row("Incoterm", (p) => value(p.incoterm));
  row("Named place", (p) => value(p.incotermPlace));
  row("Loading port", (p) => value(p.exportPort));
  row("Monthly capacity", (p) => value(p.monthlyCapacity));
  row("Payment terms", (p) => value(p.paymentTerms));
  section("Product options stated by the supplier");
  row("OEM", (p) => p.oem ? "Yes" : "Not provided");
  row("ODM", (p) => p.odm ? "Yes" : "Not provided");
  row("Samples", (p) => p.samples ? "Yes" : "Not provided");
  section("Supplier");
  row("Location", (p) => p.province ? `${p.province}, Vietnam` : "Not provided");
  row("Raw material region", (p) => value(p.rawMaterialRegion));
  row("Input material origin", (p) => value(p.inputMaterialOrigin));
  row("Vexim verification", (p) => ([1, 2, 3] as const).map((level) => `${verificationLabel(level, p.l2Scope)}: ${p.verificationSteps.includes(level) ? "Approved" : "Not approved"}`).join("\n"));
  row("Public supplier certificates", (p) => p.certificates.length ? p.certificates.map((c) => `${c.name}\nValid until ${c.validUntil}\n${c.holderMatch === "owner" ? "Registered to supplier" : `Third-party holder: ${c.holderName}`}`).join("\n\n") : "No public certificates");
  row("Product link", (p) => new URL(p.href, origin).href);
  const warnings = productComparisonWarnings(products);
  const content: Content[] = [
    { text: "Product comparison", fontSize: 19, bold: true, color: "#203D70", margin: [0, 0, 0, 6] },
    { text: `Generated ${generatedAt.toISOString().slice(0, 10)} (UTC) | ${products.length} products`, color: "#536174", margin: [0, 0, 0, 10] },
    ...(warnings.length ? [{ text: "Comparison cautions", bold: true, margin: [0, 0, 0, 4] } as Content, { ul: warnings, fontSize: 9, margin: [0, 0, 0, 12] } as Content] : []),
    { table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: false, widths: [105, ...products.map(() => "*" as const)], body }, layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5,
      hLineColor: () => "#D5DCE6", vLineColor: () => "#D5DCE6",
      paddingLeft: () => 7, paddingRight: () => 7, paddingTop: () => 7, paddingBottom: () => 7,
    } },
    { text: "Product details and reference prices are supplier-provided. Prices may apply to different MOQs. Confirm your target quantity, specifications, availability and final terms in your RFQ.", fontSize: 9, color: "#536174", margin: [0, 12, 0, 4] },
    { text: "Supplier verification and certificates have their own scope. They do not certify these products or a specific lot.", fontSize: 9, color: "#536174" },
  ];
  return {
    pageSize: "A4", pageOrientation: "landscape",
    pageMargins: [COMPARISON_PDF_MARGIN, COMPARISON_PDF_MARGIN, COMPARISON_PDF_MARGIN, COMPARISON_PDF_MARGIN],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.15, color: "#172033" },
    info: { title: "Vexim Trade | Product comparison", author: "Vexim Trade" },
    header: { text: "Vexim Trade | Product comparison", fontSize: 8, color: "#536174", margin: [COMPARISON_PDF_MARGIN, 18, COMPARISON_PDF_MARGIN, 0] },
    footer: (page, count) => ({ columns: [{ text: "veximtrade.com", alignment: "left" }, { text: `${page} / ${count}`, alignment: "right" }], fontSize: 8, color: "#536174", margin: [COMPARISON_PDF_MARGIN, 14, COMPARISON_PDF_MARGIN, 0] }),
    content,
  };
}
