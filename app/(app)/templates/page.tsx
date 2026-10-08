import Link from "next/link";

import { getStore } from "@/lib/db";
import { requirePagePermission, requirePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { STAGES, type StageKey } from "@/lib/pipeline";
import { STAGE_CONTENT, copyToFields, mergeOverrides } from "@/lib/email/stage-content";
import { TemplateEditor } from "@/components/template-editor";
import { buildBuyerEmail, buildSupplierEmail } from "@/lib/email/templates";
import { isStage } from "@/lib/pipeline";
import { Card, cx } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ProspectOutreachTemplateEditor } from "@/components/prospect-outreach-template-editor";
import { PROSPECT_OUTREACH_TEMPLATES } from "@/lib/prospects/outreach-templates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Templates" };

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; dir?: string; buyer?: string }>;
}) {
  const templateSession = await requirePermission("templates.manage");
  const session = templateSession ?? await requirePagePermission("prospects.manage", "/dashboard");
  const sp = await searchParams;
  const canEdit = hasPermission(session.role, "templates.manage");
  const canEditOutreach = canEdit || hasPermission(session.role, "prospects.manage");
  const store = getStore();
  const [buyers, suppliers, outreachOverrides] = await Promise.all([
    store.listBuyers(),
    store.listSuppliers(),
    store.listProspectOutreachTemplateOverrides(),
  ]);
  const outreachTemplates = PROSPECT_OUTREACH_TEMPLATES.map((template) => {
    const override = outreachOverrides.find((item) => item.id === template.id);
    return { ...template, ...(override ?? {}), isOverridden: Boolean(override) };
  });

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

  // Nội dung đang hiệu lực = mặc định trộn với bản ghi đè đã lưu (trang này sửa được)
  const overrides = await store.listTemplateOverrides().catch(() => []);
  const merged = mergeOverrides(overrides);
  const copy = merged[stage];
  const hasOverride = overrides.some((o) => o.stage === stage && o.dir === dir);
  const payload =
    dir === "buyer"
      ? sample
        ? buildBuyerEmail({ buyer: sample, stage, content: copy })
        : null
      : sample && supplier
        ? buildSupplierEmail({ buyer: sample, supplier, stage, content: copy })
        : null;

  return (
    <>
      <PageHeader
        title="Templates nội dung email"
        sub="Mỗi giai đoạn có một bộ nội dung riêng cho buyer (tiếng Anh) và cho nhà cung cấp (tiếng Việt). Xem, chỉnh sửa và lưu lại — email tự động lần sau sẽ dùng bản đã sửa."
      />

      <div className="mb-5">
        <ProspectOutreachTemplateEditor templates={outreachTemplates} canEdit={canEditOutreach} />
      </div>

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

          {/* Chỉnh sửa template */}
          {stage !== "lost" && (
            <Card>
              <div className="border-b border-ink-200 px-4 py-3">
                <h2 className="text-[15px] font-bold text-ink-900">Chỉnh sửa template</h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  {canEdit
                    ? "Nội dung lưu lại sẽ được dùng cho email tự động của giai đoạn này từ lần gửi sau."
                    : "Bạn chỉ xem được nội dung — quyền sửa thuộc vai trò có quyền gửi thư."}
                </p>
              </div>
              <div className="p-4">
                {canEdit ? (
                  <TemplateEditor
                    stage={stage}
                    dir={dir}
                    fields={copyToFields(dir, copy)}
                    defaults={copyToFields(dir, STAGE_CONTENT[stage])}
                    hasOverride={hasOverride}
                    placeholders="Placeholder sẽ được thay bằng dữ liệu đơn: {product} {quantity} {spec} {country} {port} {incoterm} {shipdate} {ref} {supplier} {payment} (tiếng Anh) / {payment_vi} (tiếng Việt)."
                  />
                ) : (
                  <p className="text-[13px] text-ink-500">
                    Liên hệ quản trị viên hoặc người có quyền gửi thư nếu cần đổi nội dung.
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Nội dung thô */}
          <Card>
            <div className="border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">
                {dir === "buyer" ? "Nội dung gửi buyer" : "Nội dung gửi nhà cung cấp"}
              </h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Nội dung đang hiệu lực (mặc định hoặc bản đã lưu ở khối “Chỉnh sửa template”)
                cho {dir === "buyer" ? "buyer" : "nhà cung cấp"}.
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
