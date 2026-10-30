import "server-only";
import { translateProductContent, translationConfigured } from "@/lib/ai/translate-content";

/** Translate only the name, never prices or other private product details. */
export async function translateProductName(name: string): Promise<string | null> {
  const source = name.trim();
  if (source.length < 3 || source.length > 180 || !translationConfigured()) return null;
  const { translation } = await translateProductContent({ name: source });
  const result = translation.name.trim();
  return result && result.length <= 180 ? result : null;
}
