import type { CategoryFilter } from "./types";

/**
 * `categories.filters` is a jsonb column, so the row can come back with more
 * shapes than the `CategoryFilter[]` we write: a JSON string (double-encoded
 * imports), a `{ grade: [...] }` map from an older editor, or one filter object
 * instead of a list. Reading `.find` straight off the column crashed the public
 * RFQ page with `a.filters?.find is not a function`, so every reader goes
 * through this normaliser instead of trusting the declared type.
 */

type RawOption = { value?: unknown; label?: unknown } | string | null | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function maybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return value;
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/** Options may be `{ value, label }` objects, bare strings, or an older `values` list. */
function normalizeOptions(raw: unknown): { value: string; label: string }[] {
  const list = Array.isArray(raw) ? raw : [];
  const options: { value: string; label: string }[] = [];
  for (const option of list as RawOption[]) {
    if (typeof option === "string") {
      const text = option.trim();
      if (text) options.push({ value: text, label: text });
      continue;
    }
    const record = asRecord(option);
    if (!record) continue;
    const value = record.value ?? record.label;
    if (typeof value !== "string" || !value.trim()) continue;
    const label = typeof record.label === "string" && record.label.trim() ? record.label : value;
    options.push({ value, label });
  }
  return options;
}

/** Bản CRM cũ lưu số nhiều; form RFQ và bộ lọc đọc đúng số ít. */
const FILTER_KEY_ALIASES: Record<string, string> = {
  grades: "grade",
  certs: "certifications",
  certificates: "certifications",
};

function canonicalKey(key: string): string {
  return FILTER_KEY_ALIASES[key] ?? key;
}

function normalizeFilter(raw: unknown, fallbackKey?: string): CategoryFilter | null {
  const record = asRecord(raw);
  if (!record) return null;
  const stored = typeof record.key === "string" && record.key.trim() ? record.key : fallbackKey;
  if (!stored) return null;
  const key = canonicalKey(stored);
  const options = normalizeOptions(record.options ?? record.values ?? record.items);
  const label = typeof record.label === "string" && record.label.trim() ? record.label : stored;
  return { key, label, options };
}

/**
 * Always returns a filter list, whatever the column holds this time.
 * Unknown shapes degrade to "no filters" instead of throwing inside a page.
 */
export function normalizeCategoryFilters(raw: unknown): CategoryFilter[] {
  const value = maybeJson(raw);
  if (Array.isArray(value)) {
    return value
      .map((filter) => normalizeFilter(filter))
      .filter((filter): filter is CategoryFilter => filter !== null);
  }
  const record = asRecord(value);
  if (!record) return [];
  // A single filter saved without its wrapping list.
  if (typeof record.key === "string") {
    const single = normalizeFilter(record);
    return single ? [single] : [];
  }
  // An older `{ grade: [...] }` / `{ grade: { label, options } }` map.
  return Object.entries(record)
    .map(([key, entry]) => normalizeFilter(Array.isArray(entry) ? { key, options: entry } : entry, key))
    .filter((filter): filter is CategoryFilter => filter !== null);
}

/** Values of one filter key, de-duplicated and safe on any stored shape. */
export function categoryFilterValues(raw: unknown, key: string): string[] {
  const filter = normalizeCategoryFilters(raw).find((entry) => entry.key === key);
  if (!filter) return [];
  return [...new Set(filter.options.map((option) => option.value))];
}
