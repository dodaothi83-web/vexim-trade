/**
 * A supplier's website is self-declared. Only turn a usable public http(s) URL
 * into a buyer-facing link; never treat a stored value as a trusted href.
 */
export function publicSupplierWebsite(raw: string | null | undefined): { href: string; domain: string } | null {
  const value = raw?.trim();
  if (!value || value.length > 250 || /[\s\\<>"']/.test(value) || value.startsWith("//")) return null;
  // Bare domains are present in older CRM records. Reject other URI schemes,
  // malformed http(s) schemes, credentials and internal/non-domain destinations.
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^(http:|https:)$/.test(url.protocol) || url.username || url.password ||
        (url.port && url.port !== "80" && url.port !== "443")) return null;
    const host = url.hostname.toLowerCase();
    const labels = host.split(".");
    if (labels.length < 2 || labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) ||
        labels.at(-1)!.length < 2 || /^\d+$/.test(labels.at(-1)!) ||
        ["localhost", "local", "internal", "test"].includes(labels.at(-1)!)) return null;
    return { href: url.href, domain: host.replace(/^www\./, "") };
  } catch {
    return null;
  }
}
