import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Fingerprint, MapPin, ShieldAlert, Sparkles } from "lucide-react";

import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { loadStaffSubmission } from "@/lib/supplier-portal/submission-access";
import { buildPortalSubmission, photoSpecs, partnerSpecs, exportSpecs } from "@/lib/supplier-portal/submission-view";
import { auditHref } from "@/lib/verification";
import { readiness } from "@/lib/verification-submission";
import type { PortalItemView } from "@/lib/supplier-portal/submission-view";
import { Breadcrumbs, Badge, Card } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SubmissionReviewActions } from "./submission-review-actions";
import { LinkProbeButton } from "./link-probe-button";

export const dynamic = "force-dynamic";

/**
 * Trang đối chiếu của nhân viên: ảnh NCC tải lên + ghi chú kỹ thuật (EXIF/GPS nếu còn)
 * + kết quả AI của từng mục. Tờ mã vẫn được yêu cầu ở 3 ảnh 🔖, nhưng AI chỉ
 * gợi ý; nhân viên xem ảnh và quyết định có yêu cầu bổ sung hay không.
 */
export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePagePermission("verifications.view", "/crm/dashboard");
  const access = await loadStaffSubmission(id);
  if (!access) notFound();
  const view = buildPortalSubmission({ submission: access.submission, items: access.items, links: access.links }, { forStaff: true });
  const partner = view.level === 2 && view.l2Scope === "partner_contract";
  const specs = view.level === 2 ? partner ? partnerSpecs() : photoSpecs() : exportSpecs();
  const check = readiness({ submission: access.submission, items: access.items });
  const canReview = hasPermission(session.role, "verifications.inspect");

  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <Breadcrumbs items={[
      { label: "Xác minh NCC", href: "/crm/verifications" },
      { label: "Hồ sơ NCC tự gửi", href: "/crm/verifications/submissions" },
      { label: partner ? "L2 · nhà máy đối tác" : view.level === 2 ? "L2 · nhà máy" : "L3 · xuất khẩu" },
    ]} />
    <PageHeader
      title={`Hồ sơ tự gửi · ${partner ? "L2 nhà máy đối tác" : view.level === 2 ? "L2 xác thực nhà máy" : "L3 lịch sử xuất khẩu"}`}
      sub={`${access.supplier.name} · ${view.level === 2 ? `${view.uploadedTotal}/${view.requiredTotal} mục bắt buộc` : `${view.items.length} chứng từ cần đối chiếu`} · ${view.statusLabel}`}
      actions={<Link href={`/crm/suppliers/${access.supplier.id}`} className="btn btn-ghost"><ArrowLeft className="h-4 w-4" /> Hồ sơ NCC</Link>}
    />

    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className={view.status === "pending_review" ? "bg-amber-50 text-amber-800" : view.status === "accepted" ? "bg-emerald-50 text-emerald-800" : view.status === "returned" ? "bg-rose-50 text-rose-800" : "bg-ink-100 text-ink-700"}>{view.statusLabel}</Badge>
            {check.missing.length
              ? <Badge className="bg-rose-50 text-rose-800">Thiếu {check.missing.length} mục: {check.missing.join(", ")}</Badge>
              : <Badge className="bg-emerald-50 text-emerald-800">Đủ mục bắt buộc</Badge>}
            {view.aiScannedAt && <Badge className="bg-violet-50 text-violet-800">{view.level === 3 ? "Lịch sử AI cũ" : "AI quét"} {new Date(view.aiScannedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</Badge>}
            {view.level === 3 && view.aiManipulation && <Badge className="bg-rose-100 text-rose-900">AI cũ từng nghi ảnh bị chỉnh sửa/dàn dựng</Badge>}
          </div>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {!partner && <Info label="Mã xác minh đã phát hành" value={view.code ? `${view.code}${view.codeExpired ? " (hết hạn)" : ""}` : "Chưa phát hành"} />}
            {!partner && <Info label="Phát hành lúc" value={view.codeIssuedAt ? new Date(view.codeIssuedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : null} />}
            <Info label="NCC nộp lúc" value={view.submittedAt ? new Date(view.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : null} />
            <Info label="Vị trí trình duyệt báo" value={view.deviceLat != null ? `${view.deviceLat.toFixed(5)}, ${view.deviceLng?.toFixed(5)}${view.deviceAccuracy != null ? ` (±${Math.round(view.deviceAccuracy)} m)` : ""}` : "Không có"} />
            <Info label="Địa chỉ NCC khai" value={access.supplier.address} />
            {view.level === 3 && <Info label="Lô hàng tự khai" value={[view.shipmentRef, view.shippedOn, view.shipmentDestination].filter(Boolean).join(" · ") || null} />}
          </dl>
          {view.supplierNote && <p className="mt-3 rounded-lg bg-ink-50 p-3 text-xs text-ink-700"><strong>Ghi chú NCC:</strong> {view.supplierNote}</p>}
          {view.reviewNote && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><strong>Ghi chú xét / lý do trả:</strong> {view.reviewNote}</p>}
          {view.aiSummary && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-violet-50 p-3 text-xs text-violet-900">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>{view.level === 3 ? "Lịch sử AI cũ, chỉ tham khảo" : "Tóm tắt AI"}{view.aiModel ? ` (${view.aiModel})` : ""}:</strong> {view.aiSummary}</span></p>}
          {view.aiFindingsMayBeOutdated && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">Kết quả AI từ lần quét trước có thể không khớp ảnh hiện tại. Hãy đối chiếu lại.</p>}
          {view.aiFindings.length > 0 && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <strong>AI lưu ý — cần nhân viên kiểm tra</strong>
            <ul className="mt-1 space-y-1">{view.aiFindings.map((finding) => <li key={finding}>• {finding}</li>)}</ul>
            <p className="mt-2">Đây là gợi ý, không phải kết luận. Nhân viên quyết định nhận hoặc trả hồ sơ.</p>
          </div>}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {specs.map((spec, index) => {
            const rows = view.items.filter((i) => i.key === spec.key);
            return <EvidenceCard key={spec.key} index={index + 1} spec={spec} rows={rows} level={view.level} />;
          })}
        </div>

        {view.level === 3 && <Card className="p-4">
          <h2 className="text-sm font-bold text-ink-900">Link nguồn công khai NCC khai</h2>
          {view.links.length ? <ul className="mt-3 space-y-2 text-xs">
            {view.links.map((link) => <li key={link.id} className="rounded-lg border border-ink-200 bg-white p-3">
              <a href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold break-all text-brand-700 underline"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{link.url}</a>
              {link.label && <p className="mt-1 text-ink-600">{link.label}</p>}
              <p className="mt-1 text-ink-500">
                {link.allowedSource ? "Nguồn công khai có thể kiểm tra bằng hệ thống khi nhân viên yêu cầu" : "Ngoài danh sách nguồn công khai — hệ thống không tự truy cập"}
                {" · "}trạng thái: {link.fetchStatus}
                {link.fetchedAt ? ` · lần đọc cuối ${new Date(link.fetchedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}` : ""}
              </p>
              {link.fetchNote && <p className="mt-1 text-ink-600">{link.fetchNote}</p>}
              <LinkProbeButton submissionId={view.id} linkId={link.id} />
            </li>)}
          </ul> : <p className="mt-2 text-xs text-ink-500">NCC chưa khai link nguồn nào.</p>}
        </Card>}
      </div>

      <aside className="space-y-4">
        <SubmissionReviewActions submissionId={view.id} level={view.level} partner={partner} status={view.status} canReview={canReview}
          verificationHref={view.acceptedVerificationId ? auditHref(access.supplier.id, view.level, view.acceptedVerificationId) : null}
          aiEnabled={Boolean(process.env.OPENAI_API_KEY)} />
        <Card className="bg-ink-50 p-4 text-xs text-ink-600">
          <h2 className="text-sm font-bold text-ink-900">Đối chiếu thế nào cho đúng</h2>
          {partner ? <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Mở hợp đồng, đối chiếu tên doanh nghiệp và nhà máy đối tác, kiểm tra phạm vi quan hệ.</li>
            <li>Ảnh đối tác là tùy chọn. Không suy ra nhà máy thuộc NCC hay đã được kiểm thực địa.</li>
            <li>Không công khai hợp đồng hoặc điều khoản nhạy cảm.</li>
          </ul> : view.level === 2 ? <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Đối chiếu địa chỉ, ảnh và GPS nếu còn dữ liệu.</li>
            <li>Kiểm tra tờ mã trong ba ảnh 🔖; cờ kỹ thuật và AI chỉ là gợi ý.</li>
          </ul> : <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Mở chứng từ, kiểm tra căn cứ xuất khẩu và sự thống nhất của lô hàng.</li>
            <li>Nếu chứng từ đứng tên đơn vị khác, đối chiếu thêm vai trò và liên hệ với NCC.</li>
            <li>Chứng từ xuất khẩu không mặc nhiên chứng minh buyer cuối đã nhận hàng.</li>
            <li>Không bắt buộc vận đơn. Yêu cầu bổ sung nếu bằng chứng chưa đủ căn cứ.</li>
          </ul>}
        </Card>
      </aside>
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 text-ink-900">{value || "—"}</dd></div>;
}

function EvidenceCard({ index, spec, rows, level }: { index: number; spec: { key: string; label: string; requirement: string | null; requiresCode: boolean }; rows: PortalItemView[]; level: 2 | 3 }) {
  const latest = rows[0] ?? null;
  return <Card className="overflow-hidden">
    <div className="flex items-start justify-between gap-2 border-b border-ink-100 p-3">
      <div>
        <h3 className="text-sm font-bold text-ink-900">{index}. {spec.label} {spec.requiresCode && <span title="Cần tờ giấy viết tay mã xác minh">🔖</span>}</h3>
        <p className="mt-0.5 text-[11px] text-ink-500">{spec.requirement ?? ""}</p>
      </div>
      {latest?.aiVerdict
        ? <Badge className={latest.aiVerdict === "fail" ? "bg-rose-50 text-rose-800" : latest.aiVerdict === "pass" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}>
            {level === 3 ? "AI cũ" : "AI"}: {latest.aiVerdict === "pass" ? "có vẻ phù hợp" : latest.aiVerdict === "fail" ? "cần kiểm tra" : "chưa đủ cơ sở"}
          </Badge>
        : <Badge className="bg-ink-100 text-ink-600">{latest ? "Đã tải" : "Chưa có bằng chứng"}</Badge>}
    </div>
    {!latest && <p className="p-3 text-xs text-ink-500">NCC chưa tải mục này.</p>}
    {rows.map((row) => <div key={row.id} className="border-b border-ink-100 p-3 last:border-0">
      <div className="flex flex-wrap gap-3">
        <a href={row.href} target="_blank" rel="noreferrer" className="shrink-0">
          {row.thumbHref
            // Ảnh bằng chứng nội bộ: mở qua route có kiểm tra quyền, không dùng next/image.
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={row.thumbHref} alt={row.label} className="h-28 w-36 rounded-lg border border-ink-200 object-cover" />
            : <span className="flex h-28 w-36 items-center justify-center rounded-lg border border-ink-200 bg-ink-50 text-[11px] text-ink-500">{row.isPdf ? "PDF" : "Tệp"}</span>}
        </a>
        <dl className="min-w-[220px] flex-1 grid gap-1 text-[11px] text-ink-600 sm:grid-cols-2">
          <div className="flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />
            <span>{row.exifLat != null && row.exifLng != null ? `GPS EXIF: ${row.exifLat.toFixed(5)}, ${row.exifLng.toFixed(5)}` : "GPS EXIF: không có"}</span></div>
          <div><span>EXIF: {row.hasExif ? "còn" : "MẤT"}</span></div>
          <div><span>Giờ chụp EXIF: {row.exifCapturedLabel ?? "—"}</span></div>
          <div><span>Tải lên: {new Date(row.uploadedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</span></div>
          {row.camera && <div><span>Thiết bị: {row.camera}</span></div>}
          {row.software && <div className="flex items-start gap-1"><Fingerprint className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" /><span>Phần mềm: {row.software}</span></div>}
          {row.width != null && <div><span>{row.width}×{row.height}px · {Math.round((row.bytes ?? 0) / 1024)} KB</span></div>}
          {row.captureLat != null && <div><span>Trình duyệt: {row.captureLat.toFixed(5)}, {row.captureLng?.toFixed(5)}</span></div>}
          <div className="sm:col-span-2"><a href={row.href} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Mở bản gốc ({row.mime ?? "tệp"})</a></div>
        </dl>
      </div>
      {row.flags.length > 0 && <ul className="mt-2 space-y-1">
        {row.flags.map((flag) => <li key={flag.flag} className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ${flag.severity === "hard" && flag.source !== "ai" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>{flag.source === "ai" ? level === 3 ? "AI cũ · " : "AI lưu ý · " : ""}{flag.label}.</strong> {flag.detail ?? ""}</span></li>)}
      </ul>}
      {(row.aiReason || row.aiDetectedText || row.aiCodeRead) && <div className="mt-2 rounded-lg bg-violet-50 p-2.5 text-[11px] text-violet-900">
        {row.aiReason && <p><strong>{level === 3 ? "AI cũ, chỉ tham khảo" : "AI"}:</strong> {row.aiReason}</p>}
        {row.aiDetectedText && <p className="mt-1"><strong>Chữ đọc được:</strong> “{row.aiDetectedText}”</p>}
        {(row.aiCodeRead || row.aiCodeVisible === false) && <p className="mt-1"><strong>Mã viết tay:</strong> {row.aiCodeVisible === false ? "không thấy tờ giấy" : `AI đọc “${row.aiCodeRead}”`}</p>}
      </div>}
    </div>)}
    {level === 3 && <p className="bg-ink-50 px-3 py-2 text-[11px] text-ink-500">Chứng từ do NCC tự tải: không suy ra đã xuất khẩu thành công nếu chưa đối chiếu lô hàng thực tế.</p>}
  </Card>;
}
