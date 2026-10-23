import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { eligiblePushProducts } from "@/lib/sponsored/eligibility";
import {
  clickRate,
  dayKeyDaysAgo,
  hoursLeft,
  poolUsage,
  pushState,
  summarize,
  totalsByPush,
} from "@/lib/sponsored/admin";
import type { SponsoredPush, SponsoredPushDaily } from "@/lib/types";
import { SponsoredBoard, type BoardRow, type PoolView, type SeriesPoint } from "./sponsored-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đẩy sản phẩm" };

/** Giờ hiển thị theo giờ máy chủ, giống phần còn lại của CRM. */
function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function priceLabel(push: SponsoredPush): string {
  if (push.price_amount == null) return "—";
  const amount = new Intl.NumberFormat("vi-VN").format(push.price_amount);
  return push.price_currency === "VND" ? `${amount} ₫` : `${amount} ${push.price_currency ?? ""}`.trim();
}

const MESSAGES: Record<string, { text: string; bad: boolean }> = {
  created: { text: "Đã tạo gói. Gói chờ duyệt nên chưa hiện với buyer.", bad: false },
  approved: { text: "Đã duyệt. Gói bắt đầu hiện với buyer ở lượt dựng trang kế tiếp.", bad: false },
  paused: { text: "Đã tạm dừng. Gói rời vùng đẩy ở lượt dựng trang kế tiếp.", bad: false },
  resumed: { text: "Đã chạy lại gói.", bad: false },
  deleted: { text: "Đã xoá gói nháp.", bad: false },
  noop: { text: "Gói này đã được duyệt trước đó.", bad: false },
  forbidden: { text: "Chỉ quản trị mới duyệt được gói.", bad: true },
  gates: { text: "Sản phẩm không còn đủ bốn điều kiện công khai nên không duyệt được.", bad: true },
  pool: { text: "Bể đã đủ gói trong khoảng thời gian này. Không bán thêm.", bad: true },
  ended: { text: "Gói đã hết hạn.", bad: true },
  invalid: { text: "Trạng thái gói không cho phép thao tác này.", bad: true },
  missing: { text: "Không tìm thấy gói.", bad: true },
};

export default async function SponsoredPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const session = await requireSession();
  if (!hasPermission(session.role, "sponsored.view")) redirect("/crm/dashboard");
  // Duyệt gói: admin và trưởng kiểm duyệt. Quyền lấy từ bảng phân quyền, không
  // viết cứng tên vai trò ở đây để chỗ này không lệch với lib/auth/permissions.ts.
  const canManage = hasPermission(session.role, "sponsored.manage");
  const sp = await searchParams;
  const flash = MESSAGES[sp.ok ?? ""] ?? MESSAGES[sp.err ?? ""] ?? null;

  const store = getStore();
  const now = Date.now();

  let pushes: SponsoredPush[] = [];
  let loadError: string | null = null;
  try {
    pushes = await store.listAllSponsoredPushes();
  } catch {
    loadError = "Chưa đọc được bảng gói. Kiểm tra migration 20261028_sponsored_push.sql đã áp chưa.";
  }

  let daily: SponsoredPushDaily[] = [];
  if (pushes.length) {
    try {
      // Bảy ngày gần nhất, tính cả hôm nay.
      daily = await store.listSponsoredPushDaily(pushes.map((p) => p.id), dayKeyDaysAgo(now, 6));
    } catch {
      /* Không có bảng số liệu thì bảng gói vẫn dùng được, chỉ thiếu cột lượt. */
    }
  }

  const [products, suppliers, categories, candidates] = await Promise.all([
    store.listProducts().catch(() => []),
    store.listSuppliers().catch(() => []),
    store.listCategories({ publishedOnly: false }).catch(() => []),
    canManage ? eligiblePushProducts().catch(() => []) : Promise.resolve([]),
  ]);
  const productName = new Map(products.map((p) => [p.id, p.name_i18n?.en || p.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.display_name || s.trade_name || s.name]));
  const categoryName = new Map(categories.map((c) => [c.slug, c.name_i18n?.en ?? c.slug]));

  const totals = totalsByPush(daily);
  const rows: BoardRow[] = pushes.map((push) => {
    const t = totals.get(push.id) ?? { impressions: 0, clicks: 0 };
    return {
      id: push.id,
      productName: productName.get(push.product_id) ?? "Sản phẩm đã xoá",
      supplierName: supplierName.get(push.supplier_id) ?? "—",
      categoryName: categoryName.get(push.category_slug) ?? push.category_slug,
      surface: push.surface,
      state: pushState(push, now),
      startsLabel: stamp(push.starts_at),
      endsLabel: stamp(push.ends_at),
      hoursLeft: hoursLeft(push, now),
      impressions: t.impressions,
      clicks: t.clicks,
      rate: clickRate(t.clicks, t.impressions),
      priceLabel: priceLabel(push),
      note: push.note ?? null,
    };
  });

  const pools: PoolView[] = poolUsage(pushes, now).map((row) => ({
    key: row.key,
    surface: row.surface,
    label: row.surface === "home" ? "Trang chủ" : categoryName.get(row.categorySlug ?? "") ?? row.categorySlug ?? "",
    used: row.used,
    active: row.used - row.paused,
    cap: row.cap,
    slots: row.slots,
    free: row.free,
  }));

  // Chuỗi theo ngày cho biểu đồ trong ngăn chi tiết. Gói chưa có số liệu thì để rỗng
  // thay vì vẽ một đường phẳng giả.
  const series: Record<string, SeriesPoint[]> = {};
  const byDay = new Map<string, Map<string, SeriesPoint>>();
  for (const row of daily) {
    if (row.event_type !== "impression") continue;
    const perPush = byDay.get(row.push_id) ?? new Map<string, SeriesPoint>();
    const point = perPush.get(row.day) ?? { day: row.day, impressions: 0 };
    point.impressions = row.events;
    perPush.set(row.day, point);
    byDay.set(row.push_id, perPush);
  }
  for (const [pushId, perPush] of byDay) {
    series[pushId] = [...perPush.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  const summary = summarize(pushes, totals, now);

  return (
    <>
      <PageHeader
        title="Đẩy sản phẩm"
        sub="Mỗi gói: một sản phẩm, 168 giờ."
      />

      {loadError && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {loadError}
        </div>
      )}

      <SponsoredBoard
        rows={rows}
        pools={pools}
        summary={summary}
        candidates={candidates}
        canManage={canManage}
        flash={flash}
        series={series}
      />
    </>
  );
}
