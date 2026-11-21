import "server-only";

import brandColors from "@/lib/brand/colors.json";
import { isoWeek, vietnamWeekday } from "@/lib/buyer/digest";
import { FROM_ADDRESS } from "@/lib/config";
import { getStore } from "@/lib/db";
import { getSupabaseClient } from "@/lib/db/supabase";
import { transport } from "@/lib/email/send";
import { escapeHtml, wrapPlainEmail } from "@/lib/email/templates";
import { SITE_URL } from "@/lib/site";
import { readSupplierPerformance, type SupplierPerformance } from "./performance";
import { percentChange } from "./traffic-report";

/**
 * Email báo cáo hằng tuần cho doanh nghiệp (thứ Hai, giờ Việt Nam): lượt xem và tăng/giảm, phần đến từ
 * email marketing của Vexim, RFQ nhận được, quốc gia xem nhiều nhất. Chỉ gửi khi tuần qua có ít nhất 1
 * lượt xem hoặc 1 RFQ; mỗi doanh nghiệp tối đa một thư mỗi tuần.
 */
export const REPORT_WEEKDAY = 1;

const nf = new Intl.NumberFormat("vi-VN");
const regions = (() => { try { return new Intl.DisplayNames(["vi"], { type: "region" }); } catch { return null; } })();
const countryName = (code: string) => { try { return regions?.of(code) ?? code; } catch { return code; } };

function deltaText(current: number, previous: number): string {
  const pct = percentChange(current, previous);
  if (pct === null) return "";
  if (pct === 0) return "Bằng tuần trước";
  return pct > 0 ? `Tăng ${pct}% so với tuần trước` : `Giảm ${Math.abs(pct)}% so với tuần trước`;
}

export function buildWeeklyReportMail(supplierName: string, to: string[], perf: SupplierPerformance) {
  const views = deltaText(perf.views.current, perf.views.previous);
  const rfqs = deltaText(perf.rfqs.current, perf.rfqs.previous);
  const top = perf.countries.slice(0, 3).map((c) => `${countryName(c.code)} (${nf.format(c.views)})`).join(", ");
  const row = (label: string, value: string, note: string, size = 22) => `<tr><td style="padding:12px 0;border-bottom:1px solid #DFE5EE;">
      <p style="margin:0;font-size:13px;color:${brandColors.muted};">${escapeHtml(label)}</p>
      <p style="margin:2px 0 0;font-size:${size}px;font-weight:800;color:#141C2E;">${escapeHtml(value)}</p>
      ${note ? `<p style="margin:2px 0 0;font-size:13px;color:${brandColors.muted};">${escapeHtml(note)}</p>` : ""}</td></tr>`;
  const subject = `Gian hàng tuần qua: ${nf.format(perf.views.current)} lượt xem, ${nf.format(perf.rfqs.current)} yêu cầu báo giá`;
  const link = `${SITE_URL}/supplier/portal/traffic?range=7`;
  const viewNote = [views, perf.emailClicks ? `trong đó ${nf.format(perf.emailClicks)} lượt từ email marketing của Vexim` : ""].filter(Boolean).join(", ");
  const body = `
    <p style="margin:0;font-size:20px;font-weight:800;color:#141C2E;">Báo cáo tuần của ${escapeHtml(supplierName)}</p>
    <p style="margin:4px 0 0;font-size:13px;color:${brandColors.muted};">7 ngày qua</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 0;">
      ${row("Lượt xem gian hàng và sản phẩm", nf.format(perf.views.current), viewNote)}
      ${row("Yêu cầu báo giá nhận được", nf.format(perf.rfqs.current), rfqs)}
      ${top ? row("Quốc gia xem nhiều nhất", top, "", 16) : ""}
    </table>
    <p style="margin:20px 0 0;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;background:${brandColors.primary};color:#ffffff;border-radius:8px;font-weight:700;text-decoration:none;">Xem chi tiết</a></p>
    <p style="margin:18px 0 0;font-size:12px;color:${brandColors.muted};">Lượt xem là số lần trang được mở, không phải số người. Vexim không chia sẻ danh tính người xem.</p>`;
  const text = [`Báo cáo tuần của ${supplierName}`, "", `Lượt xem: ${nf.format(perf.views.current)}${viewNote ? ` (${viewNote})` : ""}`,
    `Yêu cầu báo giá: ${nf.format(perf.rfqs.current)}${rfqs ? ` (${rfqs})` : ""}`, ...(top ? [`Quốc gia xem nhiều nhất: ${top}`] : []), "", `Xem chi tiết: ${link}`].join("\n");
  return { to, from: FROM_ADDRESS, subject, html: wrapPlainEmail({ title: subject, body, preheader: subject }), text };
}

export async function runSupplierWeeklyReport(now = new Date(), options: { force?: boolean } = {}) {
  const result = { sent: 0, skipped: 0, failed: 0 };
  if (!options.force && vietnamWeekday(now) !== REPORT_WEEKDAY) return result;
  const db = getSupabaseClient();
  if (!db) return result;
  const week = isoWeek(now);
  const store = getStore();
  const [suppliers, users, done] = await Promise.all([store.listSuppliers(), store.listUsers(),
    db.from("supplier_weekly_report_sends").select("supplier_id").eq("week", week)]);
  if (done.error) throw done.error;
  const already = new Set((done.data ?? []).map((r) => r.supplier_id));
  const emails = new Map<string, string[]>();
  for (const user of users) {
    if (!user.is_active || user.role !== "supplier" || !user.supplier_id) continue;
    const email = user.email?.trim().toLowerCase();
    if (email?.includes("@")) emails.set(user.supplier_id, [...(emails.get(user.supplier_id) ?? []), email]);
  }
  for (const supplier of suppliers) {
    const to = emails.get(supplier.id);
    if (supplier.status !== "published" || !to?.length || already.has(supplier.id)) continue;
    const perf = await readSupplierPerformance(supplier.id, 7, now).catch(() => null);
    if (!perf || (perf.views.current === 0 && perf.rfqs.current === 0)) { result.skipped++; continue; }
    const sent = await transport(buildWeeklyReportMail(supplier.display_name || supplier.name, to, perf)).catch(() => null);
    if (!sent?.ok) { result.failed++; continue; }
    await db.from("supplier_weekly_report_sends").insert({ supplier_id: supplier.id, week });
    result.sent++;
  }
  return result;
}
