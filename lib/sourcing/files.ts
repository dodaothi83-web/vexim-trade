export const SOURCING_MAX_FILES = 3;
export const SOURCING_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const SOURCING_MAX_BODY_BYTES = 7 * 1024 * 1024;

/** Determine allowed type from bytes, never the browser's extension or MIME. */
export function sourcingMime(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10)) return "image/png";
  if (starts(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
  return null;
}
export const sourcingUuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function sourcingFilename(name: string) { return name.replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(0, 160) || "attachment"; }
