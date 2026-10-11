import type { Buyer, EmailMessage } from "@/lib/types";
import { isOwnedBy } from "@/lib/auth/scope";

export const UNASSIGNED = "Chưa phân công";

export interface OwnerKpi {
  owner: string;
  /** Số buyer đang phụ trách (tính hiện tại) */
  buyers: number;
  /** Số buyer đã được gửi email trong tháng */
  buyersContacted: number;
  /** Số email đã gửi cho buyer trong tháng */
  emailsSent: number;
  /** Số buyer duy nhất có thư đến trong tháng */
  buyersReplied: number;
  /** Số thư đến từ buyer trong tháng */
  replies: number;
  /** Buyer được liên hệ trong tháng và có phản hồi / buyer được liên hệ trong tháng; null nếu chưa liên hệ ai */
  replyRate: number | null;
  /** Số buyer đang được gán nhà cung cấp */
  buyersWithSupplier: number;
}

export interface KpiInput {
  buyers: Buyer[];
  messages: EmailMessage[];
  monthStart: Date;
  monthEnd: Date;
  /** Tên người phụ trách cần lọc; null = tất cả */
  scope: string | null;
}

/** Đầu và cuối tháng theo giờ Việt Nam (UTC+7) của thời điểm `now`. */
export function vietnamMonthRange(now: Date = new Date()): { monthStart: Date; monthEnd: Date } {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1) - 7 * 60 * 60 * 1000);
  const monthEnd = new Date(Date.UTC(y, m + 1, 1) - 7 * 60 * 60 * 1000);
  return { monthStart, monthEnd };
}

function inMonth(iso: string | null | undefined, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= start.getTime() && t < end.getTime();
}

/**
 * Tính KPI theo người phụ trách buyer. Mọi thư được quy về buyer rồi về owner của buyer,
 * nên số liệu không phụ thuộc vào ai bấm gửi.
 */
export function computeOwnerKpis({ buyers, messages, monthStart, monthEnd, scope }: KpiInput): OwnerKpi[] {
  const ownerOf = (b: Buyer) => (b.owner ?? "").trim() || UNASSIGNED;
  const visible = buyers.filter((b) => isOwnedBy(b.owner, scope));
  const buyerOwner = new Map(visible.map((b) => [b.id, ownerOf(b)]));

  const byOwner = new Map<string, OwnerKpi & { _contacted: Set<string>; _replied: Set<string> }>();
  const ensure = (owner: string) => {
    let row = byOwner.get(owner);
    if (!row) {
      row = {
        owner,
        buyers: 0,
        buyersContacted: 0,
        emailsSent: 0,
        buyersReplied: 0,
        replies: 0,
        replyRate: null,
        buyersWithSupplier: 0,
        _contacted: new Set(),
        _replied: new Set(),
      };
      byOwner.set(owner, row);
    }
    return row;
  };

  for (const b of visible) {
    const row = ensure(ownerOf(b));
    row.buyers += 1;
    if (b.supplier_id) row.buyersWithSupplier += 1;
  }

  for (const m of messages) {
    if (!m.buyer_id) continue;
    const owner = buyerOwner.get(m.buyer_id);
    if (owner === undefined) continue; // buyer ngoài phạm vi
    if (m.direction !== "buyer") continue;
    const row = ensure(owner);
    if (m.status === "received") {
      if (inMonth(m.created_at, monthStart, monthEnd)) {
        row.replies += 1;
        row._replied.add(m.buyer_id);
      }
    } else if ((m.status === "sent" || m.status === "simulated") && inMonth(m.sent_at ?? m.created_at, monthStart, monthEnd)) {
      row.emailsSent += 1;
      row._contacted.add(m.buyer_id);
    }
  }

  return [...byOwner.values()]
    .map(({ _contacted, _replied, ...row }) => {
      const buyersContacted = _contacted.size;
      const buyersReplied = _replied.size;
      // Tỷ lệ chỉ tính trên buyer được liên hệ trong tháng, tránh vượt 100% khi buyer trả lời thư cũ
      const repliedContacted = [..._contacted].filter((id) => _replied.has(id)).length;
      return {
        ...row,
        buyersContacted,
        buyersReplied,
        replyRate: buyersContacted > 0 ? repliedContacted / buyersContacted : null,
      };
    })
    .sort((a, b) => b.emailsSent - a.emailsSent || a.owner.localeCompare(b.owner, "vi"));
}
