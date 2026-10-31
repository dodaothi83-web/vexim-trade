import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
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
import { sponsoredRequestStore } from "@/lib/sponsored/requests";
import { readOfferSettings, type OfferSettings } from "@/lib/sponsored/offer-settings";
import { OfferSettingsForm } from "./offer-settings-form";
import { SponsoredRequestInbox } from "./request-inbox";
import type { SponsoredRequest } from "@/lib/types";
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
  created: { text: "Đã tạo gói. Gói chờ duyệt nên chưa hiện với người mua.", bad: false },
  approved: { text: "Đã duyệt. Gói bắt đầu tính 168 giờ và có thể được chọn trên trang danh mục.", bad: false },
  paused: { text: "Đã dừng gói do vi phạm và lưu lý do. Gói rời vùng đẩy ở lượt dựng trang kế tiếp.", bad: false },
  "stop-invalid": { text: "Vui lòng nhập lý do vi phạm từ 5 đến 400 ký tự.", bad: true },
  "stop-error": { text: "Chưa xác nhận được việc dừng gói. Tải lại trang rồi thử lại.", bad: true },
  resumed: { text: "Đã chạy lại gói; thời hạn cũ không thay đổi.", bad: false },
  deleted: { text: "Đã xoá gói nháp.", bad: false },
  unsupported: { text: "Trang chủ chưa có vị trí tài trợ; không thể tạo, duyệt hoặc chạy lại gói này. Hãy đối soát gói cũ với khách.", bad: true },
  changed: { text: "Gói đã thay đổi hoặc không còn tồn tại. Vui lòng tải lại trước khi thao tác.", bad: true },
  duplicate: { text: "Sản phẩm đã có gói còn hiệu lực hoặc đang tạm dừng trong khoảng này.", bad: true },
  noop: { text: "Gói này đã được duyệt trước đó.", bad: false },
  forbidden: { text: "Bạn không có quyền thao tác gói tài trợ.", bad: true },
  gates: { text: "Sản phẩm không còn đủ điều kiện công khai trong danh mục này; không thể duyệt hoặc chạy lại.", bad: true },
  pool: { text: "Bể đã đủ gói trong khoảng thời gian này. Không bán thêm.", bad: true },
  ended: { text: "Gói đã hết hạn.", bad: true },
  invalid: { text: "Trạng thái gói không cho phép thao tác này.", bad: true },
  missing: { text: "Không tìm thấy gói.", bad: true },
  "request-contacted": { text: "Đã đánh dấu yêu cầu đã liên hệ.", bad: false },
  "request-closed": { text: "Đã kết thúc yêu cầu.", bad: false },
  "request-changed": { text: "Yêu cầu đã thay đổi. Hãy tải lại trang để kiểm tra.", bad: true },
  "request-invalid": { text: "Không thể cập nhật trạng thái này.", bad: true },
  "request-forbidden": { text: "Bạn không có quyền xử lý yêu cầu.", bad: true },
  "request-error": { text: "Chưa xác nhận được cập nhật. Hãy tải lại trang để kiểm tra.", bad: true },
};

export default async function SponsoredPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const session = await requireSession();
  if (!hasPermission(session.role, "sponsored.view")) redirect("/crm/dashboard");
  // Chỉ admin được dừng gói do vi phạm; danh sách vẫn hiển thị theo quyền xem.
  const canManage = session.role === "admin";
  const sp = await searchParams;
  const flash = MESSAGES[sp.ok ?? ""] ?? MESSAGES[sp.err ?? ""] ?? null;
  const requestFlash = (sp.ok ?? sp.err ?? "").startsWith("request-") ? flash : null;

  let offerSettings: OfferSettings | null = null;
  if (session.role === "admin") {
    try { offerSettings = await readOfferSettings(); }
    catch (error) { console.error("[sponsored-offer] could not load settings", error); }
  }

  const requestStore = sponsoredRequestStore();
  let requests: SponsoredRequest[] = [];
  let requestsAvailable = false;
  if (requestStore) {
    try {
      const user = await requestStore.getUser(session.uid);
      if (user?.is_active && user.role === session.role && user.email.trim().toLowerCase() === session.email.trim().toLowerCase() && hasPermission(user.role, "sponsored.view")) {
        requests = await requestStore.listSponsoredRequests();
        requestsAvailable = true;
      }
    } catch (error) { console.error("[sponsored] could not load requests", error); }
  }

  const store = getStore();
  const now = Date.now();

  let pushes: SponsoredPush[] = [];
  let loadError: string | null = null;
  try {
    pushes = await store.listAllSponsoredPushes();
  } catch (error) {
    console.error("[sponsored] could not load packages", error);
    loadError = "Chưa tải được danh sách gói. Thử lại; nếu vẫn lỗi, báo người phụ trách kỹ thuật.";
  }

  let daily: SponsoredPushDaily[] = [];
  let metricsAvailable = !loadError;
  if (pushes.length) {
    try {
      // Bảy ngày UTC gần nhất, tính cả hôm nay.
      daily = await store.listSponsoredPushDaily(pushes.map((p) => p.id), dayKeyDaysAgo(now, 6));
    } catch (error) {
      console.error("[sponsored] could not load metrics", error);
      metricsAvailable = false;
    }
  }

  const [productResult, supplierResult, categoryResult] = await Promise.allSettled([
    store.listProducts(),
    store.listSuppliers(),
    store.listCategories({ publishedOnly: false }),
  ]);
  for (const result of [productResult, supplierResult, categoryResult]) {
    if (result.status === "rejected") console.error("[sponsored] could not load package details", result.reason);
  }
  const productName = new Map((productResult.status === "fulfilled" ? productResult.value : []).map((p) => [p.id, p.name_i18n?.en || p.name]));
  const supplierName = new Map((supplierResult.status === "fulfilled" ? supplierResult.value : []).map((s) => [s.id, s.display_name || s.trade_name || s.name]));
  const categoryName = new Map((categoryResult.status === "fulfilled" ? categoryResult.value : []).map((c) => [c.slug, c.name_i18n?.en ?? c.slug]));

  const totals = totalsByPush(daily);
  const rows: BoardRow[] = pushes.map((push) => {
    const t = totals.get(push.id) ?? { impressions: 0, clicks: 0 };
    return {
      id: push.id,
      productName: productName.get(push.product_id) ?? (productResult.status === "rejected" ? "Chưa tải được sản phẩm" : "Sản phẩm không tìm thấy"),
      supplierName: supplierName.get(push.supplier_id) ?? (supplierResult.status === "rejected" ? "Chưa tải được nhà cung cấp" : "—"),
      categoryName: categoryName.get(push.category_slug) ?? push.category_slug,
      surface: push.surface,
      status: push.status,
      state: push.surface === "home" && push.status !== "paused" && pushState(push, now) !== "ended"
        ? "unavailable" : pushState(push, now),
      startsLabel: push.status === "draft" ? "Nháp cũ" : stamp(push.starts_at),
      endsLabel: push.status === "draft" ? "Không còn duyệt thủ công" : stamp(push.ends_at),
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
  const categorySummary = summarize(pushes.filter((p) => p.surface === "category"), totals, now);
  // Gói trang chủ cũ chưa có vùng hiển thị, không được tính là đang chạy.
  summary.live = categorySummary.live;
  summary.expiring = categorySummary.expiring;

  return (
    <>
      <PageHeader
        title="Đẩy sản phẩm"
        sub="Theo dõi gói cũ; chức năng nhà cung cấp tự mua đang được chuẩn bị."
      />

      {loadError && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {loadError}
        </div>
      )}

      {session.role === "admin" && (offerSettings ? <OfferSettingsForm settings={offerSettings} /> : <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Chưa tải được cấu hình gói. Báo người phụ trách kỹ thuật rồi thử lại.</div>)}

      {requestFlash && <div role={requestFlash.bad ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 text-sm ${requestFlash.bad ? "border border-amber-200 bg-amber-50 text-amber-900" : "border border-brand-200 bg-brand-50 text-brand-900"}`}>{requestFlash.text}</div>}
      <SponsoredRequestInbox requests={requests} available={requestsAvailable} canManage={hasPermission(session.role, "sponsored.requests.manage")} />

      <SponsoredBoard
        rows={rows}
        pools={pools}
        summary={summary}
        canManage={canManage}
        flash={requestFlash ? null : flash}
        series={series}
        metricsAvailable={metricsAvailable}
        packagesAvailable={!loadError}
      />
    </>
  );
}
