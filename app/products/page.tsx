import Link from "next/link";
import { Boxes, CalendarClock, Pencil, Search, ShieldCheck, Sparkles } from "lucide-react";

import { getStore } from "@/lib/db";
import { listProductsWithSupplier, type ProductWithSupplier } from "@/lib/queries";
import { roleLabel, statusMeta } from "@/lib/supplier";
import { Badge, Breadcrumbs, Card, EmptyState, formatDate, formatMoney } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sản phẩm NCC" };

function tokensOf(text: string): string[] {
  const m = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(m.filter((t) => t.length >= 3))];
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = sp.category ?? "";
  const cert = (sp.cert ?? "").trim();
  const verifiedOnly = sp.verified === "1";
  const buyerId = sp.buyer ?? "";

  const store = getStore();
  const buyer = buyerId ? await store.getBuyer(buyerId) : null;

  const all = await listProductsWithSupplier();
  const categories = [...new Set(all.map((r) => r.category).filter(Boolean))] as string[];

  let rows = all;
  if (category) rows = rows.filter((r) => (r.category ?? "") === category);
  if (verifiedOnly) rows = rows.filter((r) => r.supplier?.status === "verified");
  if (cert) rows = rows.filter((r) => (r.certifications ?? "").toLowerCase().includes(cert.toLowerCase()));

  const needle = q || buyer?.product || "";
  const tokens = tokensOf(needle);
  const score = (r: ProductWithSupplier) =>
    tokens.filter((t) =>
      `${r.name} ${r.category} ${r.spec} ${r.description}`.toLowerCase().includes(t),
    ).length;
  if (tokens.length > 0) {
    rows = [...rows].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "vi"));
  }
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        `${r.name} ${r.category} ${r.spec} ${r.supplier?.name ?? ""}`.toLowerCase().includes(ql),
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Sản phẩm NCC" }]} />}
        title="Sản phẩm nhà cung cấp"
        sub={`${all.length} hồ sơ sản phẩm · giá chỉ là tham khảo có thời hạn, báo giá chính thức do NCC xác nhận theo từng RFQ`}
      />

      {buyer && (
        <Card className="mb-5 border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-start gap-3 px-4 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-ink-900">
                Đang so khớp cho RFQ: {buyer.company}
                <span className="ml-2 font-normal text-ink-500">
                  (<Link className="text-brand-700 hover:underline" href={`/buyers/${buyer.id}`}>xem buyer</Link>)
                </span>
              </p>
              <p className="mt-1 text-[12.5px] text-ink-700">
                {buyer.product || "—"} · {buyer.quantity || "—"} · {buyer.spec || "—"}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                Giá mục tiêu {buyer.target_price || "—"} · {buyer.incoterm ?? ""} {buyer.port ?? ""} · giao{" "}
                {formatDate(buyer.expected_ship_date)}
              </p>
              <p className="mt-1.5 text-[11.5px] text-ink-500">
                Hệ thống sắp xếp sản phẩm trùng nhóm hàng lên trước — người vận hành duyệt thủ công rồi mới
                gửi yêu cầu báo giá cho NCC.
              </p>
            </div>
            <Link href={`/products`} className="btn btn-ghost">
              Xoá so khớp
            </Link>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <form method="GET" className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-3">
          {buyerId && <input type="hidden" name="buyer" value={buyerId} />}
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-9"
              name="q"
              defaultValue={q}
              placeholder="Tìm sản phẩm, quy cách, NCC..."
            />
          </div>
          <select className="input w-auto" name="category" defaultValue={category}>
            <option value="">Mọi nhóm ngành</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input className="input w-[160px]" name="cert" defaultValue={cert} placeholder="Chứng nhận: BRC, EU..." />
          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-ink-700">
            <input type="checkbox" name="verified" value="1" defaultChecked={verifiedOnly} className="h-4 w-4 accent-[#0f766e]" />
            Chỉ NCC đã xác minh
          </label>
          <button type="submit" className="btn btn-primary">
            Lọc
          </button>
          <Link href={buyerId ? `/products?buyer=${buyerId}` : "/products"} className="btn btn-ghost">
            Xoá lọc
          </Link>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="Không có sản phẩm nào khớp bộ lọc"
            sub="Thử từ khoá khác, hoặc thêm hồ sơ sản phẩm từ trang chi tiết NCC."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((r) => {
              const matched = tokens.length > 0 && score(r) > 0;
              const st = statusMeta(r.supplier?.status ?? "new");
              return (
                <li key={r.id} className={`px-4 py-3 ${matched ? "bg-brand-50/40" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {matched && (
                          <Badge className="bg-brand-600 text-white">
                            <Sparkles className="h-3 w-3" /> khớp nhu cầu
                          </Badge>
                        )}
                        <span className="text-[13.5px] font-semibold text-ink-900">{r.name}</span>
                        <Badge className="bg-brand-50 text-brand-700">{r.category || "Khác"}</Badge>
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-500">{r.spec || r.description || "—"}</p>
                      <p className="mt-1 text-[12px] text-ink-600">
                        NCC:{" "}
                        {r.supplier ? (
                          <Link className="font-semibold text-brand-700 hover:underline" href={`/suppliers/${r.supplier.id}`}>
                            {r.supplier.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {r.supplier && (
                          <span className="text-ink-400">
                            {" "}· {roleLabel(r.supplier.role)} · <span className={st.badge}>{st.label}</span>
                          </span>
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                        {r.moq && <Badge className="bg-ink-50 text-ink-600">MOQ {r.moq}</Badge>}
                        {r.monthly_capacity && <Badge className="bg-ink-50 text-ink-600">{r.monthly_capacity}</Badge>}
                        {r.lead_time_days !== null && (
                          <Badge className="bg-ink-50 text-ink-600">
                            <CalendarClock className="h-3 w-3" /> {r.lead_time_days} ngày
                          </Badge>
                        )}
                        {r.export_port && <Badge className="bg-ink-50 text-ink-600">cảng {r.export_port}</Badge>}
                        {r.certifications && (
                          <Badge className="bg-emerald-50 text-emerald-700">
                            <ShieldCheck className="h-3 w-3" /> {r.certifications}
                          </Badge>
                        )}
                        {r.oem && <Badge className="bg-violet-50 text-violet-700">OEM</Badge>}
                        {r.samples && <Badge className="bg-sky-50 text-sky-700">gửi mẫu</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      {r.ref_price !== null ? (
                        <>
                          <p className="text-[13px] font-bold text-ink-900">
                            {formatMoney(r.ref_price)}{" "}
                            <span className="font-normal text-ink-400">/ {r.unit || "đv"}</span>
                          </p>
                          <p className="text-[11px] text-ink-400">
                            {r.incoterm ?? ""} {r.incoterm_place ?? ""}
                            {r.price_valid_until ? ` · đến ${formatDate(r.price_valid_until)}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-[12px] text-ink-400">chưa có giá tham khảo</p>
                      )}
                      <Link href={`/products/${r.id}/edit`} className="btn btn-ghost mt-1">
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
