export interface ProductSpecificationRow {
  key: string;
  label: string;
  value: string;
}

const SPEC_LABELS: Record<string, string> = {
  "quality / grade": "Quality",
  "size classification (grade)": "Available grades",
  "broken rate": "Broken rate",
  "safety certification": "Safety certification",
  "production & processing": "Processing",
  "shelf life": "Shelf life",
  "packaging specification": "Packaging options",
  "minimum order quantity (moq)": "MOQ",
};

export function productSpecificationKey(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Turn supplier-authored lines such as "Color: Ivory white" into scannable
 * rows. Unstructured lines are preserved instead of being silently discarded.
 */
export function parseProductSpecification(spec: string | null | undefined): ProductSpecificationRow[] {
  const rows: ProductSpecificationRow[] = [];
  const additional: string[] = [];
  for (const rawLine of (spec ?? "").split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*•]\s*/, "").trim();
    if (!line) continue;
    const match = line.match(/^([^:]{2,80}):\s*(.+)$/);
    if (!match) {
      additional.push(line);
      continue;
    }
    const key = productSpecificationKey(match[1]);
    const value = match[2].trim();
    if (!key || !value) continue;
    rows.push({ key, label: SPEC_LABELS[key] ?? match[1].trim(), value });
  }
  if (additional.length) rows.push({ key: "additional details", label: "Additional details", value: additional.join("\n") });
  return rows;
}

/** Use an English label for known port aliases; keep unknown supplier input unchanged. */
export function publicExportPortDisplay(port: string | null | undefined): string {
  const value = (port ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized.includes("tctt") && normalized.includes("thi vai")) {
    return "TCTT (Tan Cang - Thi Vai International Port)";
  }
  return value;
}
