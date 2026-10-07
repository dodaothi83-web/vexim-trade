import Link from "next/link";

import { getStore } from "@/lib/db";
import { STAGES, type StageKey } from "@/lib/pipeline";
import { STAGE_CONTENT } from "@/lib/email/stage-content";
import { buildBuyerEmail, buildSupplierEmail } from "@/lib/email/templates";
import { isStage } from "@/lib/pipeline";
import { Card, cx } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nội dung email" };

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; dir?: string; buyer?: string }>;
}) {
  const sp = await searchParams;
  const store = getStore();
  const [buyers, suppliers] = await Promise.all([store.listBuyers(), store.listSuppliers()]);

  const sample =
    (sp.buyer && buyers.find((b) => b.id === sp.buyer)) ||
    buyers.find((b) => b.supplier_id && b.product) ||
    buyers[0] ||
    null;
  const supplier = sample?.supplier_id
    ? (suppliers.find((s) => s.id === sample.supplier_id) ?? null)
    : (suppliers[0] ?? null);

  const stage: StageKey = isStage(sp.stage) ? sp.stage : "quoted";
  const dir: "buyer" | "supplier" = sp.dir === "supplier" ? "supplier" : "buyer";

  const copy = STAGE_CONTENT[stage];
  const payload =
    dir === "buyer"
      ? sample
        ? buildBuyerEmail({ buyer: sample, stage })
        : null
      : sample && supplier
        ? buildSupplierEmail({ buyer: sample, supplier, stage })
        : null;

  return (
    <>
      <PageHeader
        title="Nội dung email theo giai đoạn"
        sub="Mỗi giai đoạn trong pipeline có một bộ nội dung riêng cho buyer (tiếng Anh) và một bộ riêng cho nhà cung cấp (tiếng Việt). Đây là nội dung hệ thống sẽ tự động gửi."
      />

      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        {/* Danh sách giai đoạn */}
        <Card className="overflow-hidden">
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-[15px] font-bold text-ink-900">Giai đoạn</h2>
            <p className="mt-0.5 text-xs text-ink-500">Chọn để xem nội dung tương ứng</p>
          </div>
          <ul className="p-2">
            {STAGES.map((s) => {
              const active = s.key === stage;
              return (
                <li key={s.key}>
                  <Link
                    href={`/templates?stage=${s.key}&dir=${dir}${sp.buyer ? `&buyer=${sp.buyer}` : ""}`}
                    className={cx(
                      "flex items-start gap-2.5 rounded-lg px-3 py-2 transition",
                      active ? "bg-brand-50" : "hover:bg-ink-50",
                    )}
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cx(
                          "block text-[13px]",
                          active ? "font-bold text-brand-900" : "font-semibold text-ink-800",
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="block text-[11px] text-ink-500">{s.hint}</span>
                    </span>
                    {s.silent && (
                      <span className="mt-0.5 rounded bg-red-50 px-1.5 py-px text-[10px] font-semibold text-red-600">
                        không gửi
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          {/* Chuyển buyer / NCC */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-ink-300 bg-white">
              {(
                [
                  ["buyer", "Gửi BUYER (tiếng Anh)"],
                  ["supplier", "Gửi NCC (tiếng Việt)"],
                ] as const
              ).map(([key, label]) => (
                <Link
                  key={key}
                  href={`/templates?stage=${stage}&dir=${key}${sp.buyer ? `&buyer=${sp.buyer}` : ""}`}
                  className={cx(
                    "px-3.5 py-2 text-[13px] font-semibold transition",
                    dir === key
                      ? "bg-brand-700 text-white"
                      : "text-ink-600 hover:bg-ink-50",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <form className="flex items-center gap-2">
              <input type="hidden" name="stage" value={stage} />
              <input type="hidden" name="dir" value={dir} />
              <label className="text-[12px] text-ink-500">Xem thử với đơn:</label>
              <select
                name="buyer"
                className="input w-auto py-1.5 text-[12.5px]"
                defaultValue={sample?.id}
              >
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.company}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-ghost px-2.5 py-1.5 text-[12.5px]">
                Xem
              </button>
            </form>
          </div>

          {/* Nội dung thô */}
          <Card>
            <div className="border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">
                {dir === "buyer" ? "Nội dung gửi buyer" : "Nội dung gửi nhà cung cấp"}
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Sửa trong <code>lib/email/stage-content.ts</code> — các placeholder{" "}
                <code>{"{product}"}</code>, <code>{"{quantity}"}</code>, <code>{"{port}"}</code>… sẽ
                được thay bằng dữ liệu thật của từng đơn.
              </p>
            </div>
            {stage === "lost" ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-500">
                Giai đoạn “Mất đơn / Hoãn” không gửi email tự động — chỉ ghi nhận nội bộ.
              </p>
            ) : (
              <div className="space-y-4 p-4">
                <div>
                  <p className="label">Tiêu đề</p>
                  <p className="rounded-lg bg-ink-50 px-3 py-2 text-[13px] font-semibold text-ink-900">
                    [VXT-XXXXXX] {dir === "buyer" ? copy.buyer.subject : copy.supplier.subject}
                  </p>
                </div>
                <div>
                  <p className="label">Nội dung</p>
                  <div className="space-y-2">
                    {(dir === "buyer" ? copy.buyer.body : copy.supplier.body).map((p, i) => (
                      <p key={i} className="rounded-lg bg-ink-50 px-3 py-2 text-[13px] leading-relaxed text-ink-700">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
                {dir === "buyer" ? (
                  <div>
                    <p className="label">Bước kế tiếp (WHAT HAPPENS NEXT)</p>
                    <p className="rounded-lg border-l-4 border-brand-600 bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
                      {copy.buyer.action}
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="label">Việc NCC cần làm</p>
                      <ol className="list-decimal space-y-1 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 pl-7 text-[13px] text-amber-900">
                        {copy.supplier.tasks.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <p className="label">Thời hạn</p>
                      <p className="rounded-lg bg-ink-50 px-3 py-2 text-[13px] font-semibold text-ink-800">
                        {copy.supplier.deadline}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>

          {/* Xem trước email thật */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-2">
              <span className="text-[12px] font-bold tracking-wide text-ink-500 uppercase">
                Email thật sẽ trông như thế này
              </span>
              {sample && (
                <span className="text-[11.5px] text-ink-500">
                  dữ liệu mẫu: {sample.company}
                  {dir === "supplier" && supplier ? ` · NCC ${supplier.name}` : ""}
                </span>
              )}
            </div>
            {payload ? (
              <iframe
                title="Xem trước email"
                srcDoc={payload.html}
                sandbox=""
                className="h-[640px] w-full border-0 bg-white"
              />
            ) : (
              <p className="px-4 py-10 text-center text-[13px] text-ink-500">
                Cần có ít nhất một buyer trong hệ thống để xem trước.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
