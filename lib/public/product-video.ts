import type { MediaAsset } from "@/lib/types";
import { isExpired } from "@/lib/media/readiness";
import { withoutDirectContacts } from "@/lib/public/product-selection";

export type PublicProductVideo = { embedUrl: string; title: string };

/** Only known video hosts may be embedded; never turn arbitrary staff-entered URLs into iframes. */
export function safeProductVideoEmbed(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = host.endsWith("youtu.be") ? parts[0] :
        url.pathname === "/watch" ? url.searchParams.get("v") :
          ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : null;
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
    }
    if (host === "drive.google.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[0] === "file" && parts[1] === "d" ? parts[2] :
        url.pathname === "/open" ? url.searchParams.get("id") : null;
      return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null;
    }
  } catch { /* Invalid URL. */ }
  return null;
}

/** A video is public only if staff intentionally marked this product-owned link buyer-shareable. */
export function shareableProductVideo(media: readonly MediaAsset[], productId: string): PublicProductVideo | null {
  const sorted = media.filter((m) => m.owner_type === "product" && m.product_id === productId &&
    m.kind === "video" && m.audience === "buyer" && !isExpired(m))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  for (const item of sorted) {
    const embedUrl = safeProductVideoEmbed(item.external_url);
    if (embedUrl) return { embedUrl, title: withoutDirectContacts(item.caption || "Product video") };
  }
  return null;
}
