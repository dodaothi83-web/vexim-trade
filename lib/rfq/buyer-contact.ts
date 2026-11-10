import type { Rfq } from "@/lib/types";

/** Per-RFQ consent, not the CRM's global hide flag or a supplier suggested in a shortlist. */
export const RFQ_CONTACT_POLICY_VERSION = "rfq_contact_v2";
export type RfqBuyerContact = {
  company: string;
  contact_name: string | null;
  email: string;
  phone: string | null;
  country: string | null;
  website: string | null;
  business_type: string | null;
};

const clean = (value: unknown, max: number): string | null =>
  typeof value === "string" ? value.trim().slice(0, max) || null : null;

/** Only buyer-provided transaction contact fields. Never spread a Buyer/CRM row into an RFQ. */
export function snapshotBuyerContact(input: RfqBuyerContact): RfqBuyerContact {
  return {
    company: clean(input.company, 200) ?? "",
    contact_name: clean(input.contact_name, 160),
    email: clean(input.email, 320)?.toLowerCase() ?? "",
    phone: clean(input.phone, 80),
    country: clean(input.country, 120),
    website: clean(input.website, 500),
    business_type: clean(input.business_type, 120),
  };
}

export function buyerContactConsentSpec(contact: RfqBuyerContact, consentAt: string, source: "rfq_form" | "sourcing_form") {
  return {
    buyer_contact: snapshotBuyerContact(contact),
    buyer_contact_policy_version: RFQ_CONTACT_POLICY_VERSION,
    buyer_contact_consent_at: consentAt,
    buyer_contact_consent_source: source,
  };
}

/**
 * Explicit grant for this RFQ and recipient. The source & version prevent old checkbox/CRM
 * settings being misread as permission; a one-off historical consent must name its supplier.
 * Also accepts the projected fields of a supplier invitation (no full specs or CRM row).
 */
export function authorizedBuyerContact(
  fields: Record<string, unknown> | null | undefined,
  supplierId: string,
): RfqBuyerContact | null {
  if (!fields || !supplierId || fields.buyer_contact_policy_version !== RFQ_CONTACT_POLICY_VERSION ||
      typeof fields.buyer_contact_consent_at !== "string" ||
      !Number.isFinite(Date.parse(fields.buyer_contact_consent_at))) return null;
  const source = fields.buyer_contact_consent_source;
  if (!["rfq_form", "sourcing_form", "confirmed_by_buyer"].includes(String(source))) return null;
  if (source === "confirmed_by_buyer") {
    if (!Array.isArray(fields.buyer_contact_supplier_ids) || !fields.buyer_contact_supplier_ids.includes(supplierId)) return null;
  } else if (fields.buyer_contact_supplier_ids != null) {
    // New-form consent applies only to suppliers actually sent the RFQ, not an arbitrary allowlist.
    return null;
  }
  const raw = fields.buyer_contact;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.company !== "string" || !obj.company.trim() || typeof obj.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.email.trim())) return null;
  return snapshotBuyerContact({
    company: obj.company, contact_name: clean(obj.contact_name, 160), email: obj.email,
    phone: clean(obj.phone, 80), country: clean(obj.country, 120),
    website: clean(obj.website, 500), business_type: clean(obj.business_type, 120),
  });
}

export function rfqBuyerContact(rfq: Pick<Rfq, "specs">, supplierId: string): RfqBuyerContact | null {
  return authorizedBuyerContact(rfq.specs, supplierId);
}
