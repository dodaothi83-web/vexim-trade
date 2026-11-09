import { fieldsFor } from "@/lib/product-attributes";
import { UNSPECIFIED_SOURCING_REGION } from "@/lib/public/product-detail-display";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";
import { classifyMoqFilterGroup } from "@/lib/products/grade-pricing";
import type { Category, SupplierType } from "@/lib/types";
import { matchesVerificationFilter, type PublicL2Scope } from "@/lib/verification-status";

/** Search facets are derived only from buyer-visible product cards and approved supplier checks. */
export type SearchParam = string | string[] | undefined;
export type SearchSupplierFilterData = {
  id: string;
  location: string;
  type: SupplierType | null;
  typeLabel: string;
  verificationSteps: number[];
  l2Scope: PublicL2Scope;
};
export type SearchFilterOptions = {
  grades: string[];
  attributes: Array<{ key: string; label: string; options: string[]; showWhen?: { key: string; value: string } }>;
  incoterms: string[];
  sourceRegions: string[];
  certificates: string[];
  supplierLocations: string[];
  supplierTypes: Array<{ value: SupplierType; label: string }>;
};
export type SearchFilters = {
  grades: string[];
  attributes: Record<string, string>;
  moq: string;
  leadTime: string;
  incoterm: string;
  sourceRegion: string;
  verified: number;
  certificates: string[];
  oemOdm: boolean;
  samples: boolean;
  supplierLocation: string;
  supplierType: SupplierType | "";
};

/** Match the category grid: do not turn custom grade rows into grade filter options. */
function productGrades(product: PublicCategoryProduct): string[] {
  if (product.quantityOffer?.customGrade) return [];
  return product.grades?.length ? product.grades : product.grade ? [product.grade] : [];
}

export function searchFilterOptions(
  products: readonly PublicCategoryProduct[],
  suppliers: readonly SearchSupplierFilterData[],
  category: Pick<Category, "product_fields"> | null,
): SearchFilterOptions {
  const sorted = (values: Array<string | null | undefined>) => [...new Set(values.filter((v): v is string => !!v?.trim()))].sort((a, b) => a.localeCompare(b));
  const grades = sorted(products.flatMap((product) => productGrades(product)));
  const attributes = fieldsFor(category).filter((field) => field.filterable && field.type === "select" &&
    field.key !== "grade" && field.key !== "product_type").map((field) => ({
    key: field.key, label: field.label,
    options: field.options.filter((option) => products.some((product) => product.attributes?.[field.key] === option)),
    ...(field.showWhen ? { showWhen: field.showWhen } : {}),
  })).filter((field) => field.options.length > 0);
  const types = new Map<SupplierType, string>();
  for (const supplier of suppliers) if (supplier.type) types.set(supplier.type, supplier.typeLabel);
  return {
    grades, attributes,
    incoterms: sorted(products.map((p) => p.incoterm)),
    sourceRegions: sorted(products.map((p) => p.province).filter((p) => p !== UNSPECIFIED_SOURCING_REGION)),
    certificates: sorted(products.flatMap((p) => p.certificates ?? [])),
    supplierLocations: sorted(suppliers.map((s) => s.location)),
    supplierTypes: [...types].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function first(value: SearchParam): string {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}
function oneOf(raw: SearchParam, allowed: readonly string[]): string {
  const value = first(raw);
  return allowed.includes(value) ? value : "";
}
function someOf(raw: SearchParam, allowed: readonly string[]): string[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return [...new Set(values.filter((value) => allowed.includes(value)))].slice(0, 30);
}

/** Only allow values that exist on the public cards; stale/tampered filters never broaden access. */
export function parseSearchFilters(params: Record<string, SearchParam> | undefined, options: SearchFilterOptions): SearchFilters {
  const attributes: Record<string, string> = {};
  for (const field of options.attributes) {
    const value = oneOf(params?.[`attr.${field.key}`], field.options);
    if (value) attributes[field.key] = value;
  }
  const grades = someOf(params?.grade, options.grades);
  for (const field of options.attributes) {
    if (!field.showWhen || !attributes[field.key]) continue;
    const parent = field.showWhen.key === "grade" || field.showWhen.key === "product_type"
      ? grades : [attributes[field.showWhen.key]];
    if (parent.length > 0 && !parent.includes(field.showWhen.value)) delete attributes[field.key];
  }
  const supplierType = oneOf(params?.supplierType, options.supplierTypes.map((type) => type.value));
  return {
    grades, attributes,
    moq: oneOf(params?.moq, ["small", "medium", "large", "container", "ask"]),
    leadTime: oneOf(params?.lead, ["15", "30", "45"]),
    incoterm: oneOf(params?.incoterm, options.incoterms),
    sourceRegion: oneOf(params?.region, options.sourceRegions),
    verified: Number(oneOf(params?.verified, ["1", "2", "3", "4"])) || 0,
    certificates: someOf(params?.certificate, options.certificates),
    oemOdm: first(params?.oem) === "1",
    samples: first(params?.samples) === "1",
    supplierLocation: oneOf(params?.location, options.supplierLocations),
    supplierType: supplierType as SupplierType | "",
  };
}

export function hasProductSearchFilters(filters: SearchFilters): boolean {
  return filters.grades.length > 0 || Object.values(filters.attributes).some(Boolean) || !!filters.moq || !!filters.leadTime ||
    !!filters.incoterm || !!filters.sourceRegion || filters.certificates.length > 0 || filters.oemOdm || filters.samples;
}
export function hasSearchFilters(filters: SearchFilters): boolean {
  return hasProductSearchFilters(filters) || filters.verified > 0 || !!filters.supplierLocation || !!filters.supplierType;
}

/** Reuse the category page's per-grade MOQ grouping; a single qualifying grade row is enough. */
function matchesMoq(product: PublicCategoryProduct, group: string): boolean {
  const classify = (moqUnit: PublicCategoryProduct["moqUnit"] | undefined, moqMtEquivalent: number | null | undefined, moqText: string) =>
    classifyMoqFilterGroup({ moqUnit, moqMtEquivalent, moqText }) === group;
  if (product.gradeRows?.length) return product.gradeRows.some((row) => classify(row.moqUnit, row.moqMtEquivalent, row.moq));
  return classify(product.moqUnit, product.moqMtEquivalent, product.moq);
}

/** All selected offer facets must match the SAME public listing, never separate products of a supplier. */
export function matchesSearchOffer(product: PublicCategoryProduct, filters: SearchFilters): boolean {
  return (
    (!filters.grades.length || filters.grades.some((grade) => productGrades(product).includes(grade))) &&
    Object.entries(filters.attributes).every(([key, value]) => !value || product.attributes?.[key] === value) &&
    (!filters.moq || matchesMoq(product, filters.moq)) &&
    (!filters.leadTime || (product.leadTimeDays !== null && product.leadTimeDays <= Number(filters.leadTime))) &&
    (!filters.incoterm || product.incoterm === filters.incoterm) &&
    (!filters.sourceRegion || product.province === filters.sourceRegion) &&
    (!filters.certificates.length || filters.certificates.some((cert) => product.certificates?.includes(cert))) &&
    (!filters.oemOdm || product.oem || product.odm) &&
    (!filters.samples || product.samples)
  );
}

export function matchesSearchSupplier(supplier: SearchSupplierFilterData, filters: SearchFilters): boolean {
  return (!filters.supplierLocation || supplier.location === filters.supplierLocation) &&
    (!filters.supplierType || supplier.type === filters.supplierType) &&
    matchesVerificationFilter(supplier.verificationSteps, supplier.l2Scope, filters.verified);
}

export function matchesSearchProduct(product: PublicCategoryProduct, supplier: SearchSupplierFilterData | undefined, filters: SearchFilters): boolean {
  return !!supplier && matchesSearchSupplier(supplier, filters) &&
    matchesVerificationFilter(product.verificationSteps, product.l2Scope, filters.verified) &&
    matchesSearchOffer(product, filters);
}

/** Keep facets in tab/pagination URLs; changing any filter resets pagination via the GET form. */
export function appendSearchFilterParams(params: URLSearchParams, filters: SearchFilters): void {
  for (const grade of filters.grades) params.append("grade", grade);
  for (const [key, value] of Object.entries(filters.attributes)) if (value) params.set(`attr.${key}`, value);
  if (filters.moq) params.set("moq", filters.moq);
  if (filters.leadTime) params.set("lead", filters.leadTime);
  if (filters.incoterm) params.set("incoterm", filters.incoterm);
  if (filters.sourceRegion) params.set("region", filters.sourceRegion);
  if (filters.verified) params.set("verified", String(filters.verified));
  for (const cert of filters.certificates) params.append("certificate", cert);
  if (filters.oemOdm) params.set("oem", "1");
  if (filters.samples) params.set("samples", "1");
  if (filters.supplierLocation) params.set("location", filters.supplierLocation);
  if (filters.supplierType) params.set("supplierType", filters.supplierType);
}
