"use client";

import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Eye,
  History,
  Info,
  ListChecks,
  Package,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import {
  findLeaks,
  htmlToText,
  vietnameseRatio,
  type SensitiveTerm,
} from "@/lib/email/privacy";
import { withPreviewPadding, wrapPlainEmail } from "@/lib/email/templates";
import { getStage } from "@/lib/pipeline";
import { roleLabel, statusMeta } from "@/lib/supplier";
import type { ComposeContext, RecentMail } from "@/lib/compose-context";
import { Badge, cx, formatDate, formatDateTime } from "@/components/ui";

const MAX_BYTES = 10 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Level = "ok" | "warn" | "error" | "info";

interface CheckItem {
  level: Level;
  label: string;
  hint?: string;
}

export function ComposeSidebar({
  subject,
  bodyHtml,
  direction,
  to,
  attachmentCount = 0,
  attachmentBytes = 0,
  active,
  relatedBuyer,
  recent,
  signature = "",
}: {
  subject: string;
  bodyHtml: string;
  direction: "buyer" | "supplier";
  to: string[];
  attachmentCount?: number;
  attachmentBytes?: number;
  /** Ngữ cảnh người nhận: buyer khi gửi buyer, NCC khi gửi NCC */
  active: ComposeContext | null;
  /** Buyer liên quan khi gửi NCC – dùng cho kiểm tra ẩn danh */
  relatedBuyer: ComposeContext | null;
  recent: RecentMail[];
  /** Khối chữ ký – bỏ ra khi phân tích ngôn ngữ để không báo nhầm */
  signature?: string;
}) {
  const isBuyerDir = direction === "buyer";
  const deferredBody = useDeferredValue(bodyHtml);
  const deferredSubject = useDeferredValue(subject);

  const previewHtml = useMemo(
    () =>
      wrapPlainEmail({
        title: deferredSubject.trim() || "(chưa có tiêu đề)",
        body:
          deferredBody.trim() ||
          '<p style="color:#94a3b8;font-style:italic">(chưa có nội dung)</p>',
      }),
    [deferredSubject, deferredBody],
  );

  // Bỏ khối chữ ký (vốn có sẵn vài chữ tiếng Việt như "Trân trọng") trước khi
  // phân tích ngôn ngữ / dò thông tin, để không báo nhầm.
  const analysisBody = useMemo(
    () => (signature ? deferredBody.split(signature).join(" ") : deferredBody),
    [deferredBody, signature],
  );
  const plainText = useMemo(
    () => htmlToText(`${deferredSubject}\n${analysisBody}`),
    [deferredSubject, analysisBody],
  );

  // ----- Kiểm tra rò rỉ thông tin (chỉ cảnh báo, không chặn gửi) -----
  const privacy = useMemo((): {
    level: Level;
    leaks: SensitiveTerm[];
    note: string;
  } => {
    if (isBuyerDir) {
      const terms = active?.supplierSensitive ?? [];
      if (!active) {
        return { level: "info", leaks: [], note: "Chưa xác định buyer để đối chiếu." };
      }
      if (!active.linkedSupplier) {
        return {
          level: "info",
          leaks: [],
          note: "Đơn chưa gắn nhà cung cấp — email chỉ gửi buyer.",
        };
      }
      const leaks = findLeaks(plainText, terms);
      return leaks.length
        ? {
            level: "warn",
            leaks,
            note: `Nội dung gửi buyer đang nhắc tới ${leaks.length} thông tin của NCC ${active.linkedSupplier.name}.`,
          }
        : {
            level: "ok",
            leaks: [],
            note: `Không thấy tên / giá của ${active.linkedSupplier.name} trong nội dung.`,
          };
    }

    if (!relatedBuyer) {
      return {
        level: "info",
        leaks: [],
        note: "Không xác định được buyer liên quan để kiểm tra ẩn danh.",
      };
    }
    if (relatedBuyer.hideBuyerFromSupplier === false) {
      return {
        level: "info",
        leaks: [],
        note: `Buyer ${relatedBuyer.name} cho phép công khai thông tin với NCC.`,
      };
    }
    const leaks = findLeaks(plainText, relatedBuyer.buyerSensitive);
    return leaks.length
      ? {
          level: "warn",
          leaks,
          note: `Buyer đang yêu cầu ẩn danh, nhưng email nhắc tới: ${leaks
            .map((l) => l.label)
            .join(", ")}.`,
        }
      : {
          level: "ok",
          leaks: [],
          note: "Buyer đang được ẩn danh đúng quy định trong email này.",
        };
  }, [isBuyerDir, active, relatedBuyer, plainText]);

  // ----- Checklist trước khi gửi -----
  const checks = useMemo((): CheckItem[] => {
    const items: CheckItem[] = [];

    const invalid = to.filter((e) => !EMAIL_RE.test(e.trim()));
    if (!to.length) {
      items.push({ level: "error", label: "Chưa có người nhận", hint: "Nhập email ở ô Tới." });
    } else if (invalid.length) {
      items.push({
        level: "error",
        label: `Email không hợp lệ: ${invalid.join(", ")}`,
        hint: "Sửa lại địa chỉ trước khi gửi.",
      });
    } else {
      items.push({
        level: "ok",
        label: `Người nhận hợp lệ (${to.length} địa chỉ)`,
      });
    }

    items.push(
      subject.trim()
        ? { level: "ok", label: "Đã có tiêu đề" }
        : { level: "error", label: "Thiếu tiêu đề", hint: "Buyer thường bỏ qua email không tiêu đề." },
    );

    // Không tính khối chữ ký: mở trang là đã có chữ ký, nếu tính thì email
    // trống cũng bị coi là "đã có nội dung".
    const bodyTextLength = htmlToText(analysisBody).length;
    items.push(
      bodyTextLength >= 40
        ? { level: "ok", label: "Nội dung đã có thông tin chính" }
        : {
            level: "warn",
            label: "Nội dung còn rất ngắn",
            hint: "Kiểm tra lại phần thân thư trước khi gửi.",
          },
    );

    const viRatio = vietnameseRatio(plainText);
    if (isBuyerDir) {
      items.push(
        viRatio > 0.02
          ? {
              level: "warn",
              label: "Nội dung gửi buyer đang nhiều tiếng Việt",
              hint: "Email cho buyer nên viết tiếng Anh theo mẫu của công ty.",
            }
          : { level: "ok", label: "Ngôn ngữ phù hợp (tiếng Anh cho buyer)" },
      );
    } else {
      items.push(
        viRatio < 0.01 && plainText.length > 40
          ? {
              level: "info",
              label: "Email gửi NCC thường viết tiếng Việt",
              hint: "Kiểm tra lại nếu đây là NCC nước ngoài.",
            }
          : { level: "ok", label: "Ngôn ngữ phù hợp (tiếng Việt cho NCC)" },
      );
    }

    items.push(
      privacy.level === "warn"
        ? { level: "warn", label: privacy.note, hint: "Rà lại trước khi gửi — bạn vẫn gửi được." }
        : { level: privacy.level, label: privacy.note },
    );

    if (attachmentCount > 0) {
      items.push(
        attachmentBytes > MAX_BYTES
          ? { level: "error", label: "Tệp đính kèm vượt 10MB", hint: "Gỡ bớt tệp trước khi gửi." }
          : {
              level: "ok",
              label: `Đính kèm ${attachmentCount} tệp (${(attachmentBytes / 1024 / 1024).toFixed(2)}MB)`,
            },
      );
    } else if (active?.stage && ["quoted", "negotiation", "confirmed"].includes(active.stage)) {
      items.push({
        level: "info",
        label: "Giai đoạn này thường kèm báo giá / PI",
        hint: "Cân nhắc đính kèm tài liệu cho buyer.",
      });
    }

    return items;
  }, [to, subject, analysisBody, plainText, isBuyerDir, privacy, attachmentCount, attachmentBytes, active]);

  const errors = checks.filter((c) => c.level === "error").length;
  const warnings = checks.filter((c) => c.level === "warn").length;

  const relatedRecent = useMemo(
    () =>
      active
        ? recent
            .filter(
              (m) =>
                m.buyer_id === active.id ||
                m.supplier_id === active.id ||
                (relatedBuyer && m.buyer_id === relatedBuyer.id && direction === "supplier"),
            )
            .slice(0, 6)
        : [],
    [recent, active, relatedBuyer, direction],
  );

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-1">
      {/* Cảnh báo lộ thông tin – đặt trên cùng để thấy ngay */}
      {privacy.level === "warn" && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3.5 text-red-900">
          <p className="flex items-start gap-2 text-[13px] font-bold">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Có thể lộ thông tin cần giữ kín
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed">{privacy.note}</p>
          <ul className="mt-2 space-y-0.5 text-[12px]">
            {privacy.leaks.map((l) => (
              <li key={l.label} className="flex items-start gap-1.5">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                <span>
                  {l.label}: <span className="font-semibold">“{l.value}”</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-red-800/80">
            Bạn vẫn gửi được — chỉ cần rà lại nội dung.
          </p>
        </div>
      )}

      {/* Xem trước email */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-ink-200 px-3.5 py-2.5">
          <Eye className="h-3.5 w-3.5 text-brand-700" />
          <h2 className="text-[13px] font-bold text-ink-900">Xem trước</h2>
          <span className="ml-auto text-[11px] text-ink-400">như người nhận thấy</span>
        </header>
        <div className="border-b border-ink-100 px-3.5 py-2 text-[12px]">
          <p className="truncate text-ink-500">
            <span className="text-ink-400">Tiêu đề: </span>
            <strong className="text-ink-800">{subject.trim() || "(chưa có tiêu đề)"}</strong>
          </p>
        </div>
        <iframe
          title="Xem trước email"
          srcDoc={withPreviewPadding(previewHtml)}
          sandbox=""
          className="h-[360px] w-full border-0 bg-white"
        />
      </section>

      {/* Ngữ cảnh đơn hàng */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-ink-200 px-3.5 py-2.5">
          <Package className="h-3.5 w-3.5 text-brand-700" />
          <h2 className="text-[13px] font-bold text-ink-900">Ngữ cảnh</h2>
          {active && (
            <Link
              href={active.href}
              className="ml-auto flex items-center gap-0.5 text-[11.5px] font-semibold text-brand-700 transition hover:underline"
            >
              Mở hồ sơ
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
        </header>

        {!active ? (
          <p className="px-3.5 py-3 text-[12.5px] text-ink-500">
            Chưa xác định người nhận trong danh sách buyer / NCC. Nhập email hoặc chọn người nhận
            từ danh sách để xem ngữ cảnh đơn hàng.
          </p>
        ) : (
          <div className="space-y-1.5 px-3.5 py-3 text-[12.5px]">
            <p className="text-[13.5px] font-bold text-ink-900">{active.name}</p>
            <p className="text-ink-500">
              {[active.contactName, active.country].filter(Boolean).join(" · ") || "—"}
            </p>

            {active.kind === "buyer" && active.stage && (
              <p className="pt-0.5">
                <Badge className="bg-brand-50 text-brand-700">
                  {getStage(active.stage).label}
                </Badge>
              </p>
            )}

            <dl className="mt-1.5 space-y-1">
              {active.kind === "buyer" ? (
                <>
                  <Row label="Sản phẩm" value={active.product} />
                  <Row label="Quy cách" value={active.spec} />
                  <Row label="Số lượng" value={active.quantity} />
                  <Row label="Giá mục tiêu" value={active.targetPrice} />
                  <Row
                    label="Thanh toán"
                    value={[active.payment, active.incoterm].filter(Boolean).join(" · ") || null}
                  />
                  <Row label="Dự kiến giao" value={active.shipDate ? formatDate(active.shipDate) : null} />
                </>
              ) : (
                <>
                  <Row label="Vai trò" value={active.role ? roleLabel(active.role) : null} />
                  <Row
                    label="Hồ sơ"
                    value={active.status ? statusMeta(active.status).label : null}
                  />
                  <Row label="Ngành hàng" value={active.productsSummary} />
                  <Row label="Thị trường" value={active.markets} />
                  <Row
                    label="Lead time"
                    value={active.leadTimeDays ? `${active.leadTimeDays} ngày` : null}
                  />
                </>
              )}
            </dl>

            {active.kind === "buyer" && (
              <div className="mt-2 rounded-lg bg-ink-50 p-2.5">
                {active.linkedSupplier ? (
                  <p className="flex items-start gap-1.5 text-[12px]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="text-ink-700">
                      NCC: <strong className="text-ink-900">{active.linkedSupplier.name}</strong>
                      <br />
                      <span className="text-ink-500">
                        {statusMeta(active.linkedSupplier.status).label} — giữ kín với buyer
                      </span>
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5 text-[12px] text-ink-600">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                    Chưa gắn nhà cung cấp — email chỉ gửi buyer.
                  </p>
                )}
              </div>
            )}

            {(active.nextAction || active.nextActionDate) && (
              <p className="mt-1 flex items-start gap-1.5 text-[12px] text-ink-600">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                <span>
                  {active.nextAction || "Việc kế tiếp"}
                  {active.nextActionDate ? ` — ${formatDate(active.nextActionDate)}` : ""}
                </span>
              </p>
            )}
          </div>
        )}
      </section>

      {/* Checklist trước khi gửi */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-ink-200 px-3.5 py-2.5">
          <ListChecks className="h-3.5 w-3.5 text-brand-700" />
          <h2 className="text-[13px] font-bold text-ink-900">Trước khi gửi</h2>
          <span
            className={cx(
              "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold",
              errors
                ? "bg-red-50 text-red-700"
                : warnings
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-700",
            )}
          >
            {errors
              ? `${errors} điểm cần sửa`
              : warnings
                ? `${warnings} điểm cần xem`
                : "Sẵn sàng gửi"}
          </span>
        </header>
        <ul className="space-y-2 px-3.5 py-3">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px]">
              <LevelIcon level={c.level} />
              <span className="min-w-0">
                <span
                  className={cx(
                    c.level === "error"
                      ? "font-semibold text-red-700"
                      : c.level === "warn"
                        ? "font-semibold text-amber-800"
                        : "text-ink-700",
                  )}
                >
                  {c.label}
                </span>
                {c.hint && <span className="mt-0.5 block text-[11.5px] text-ink-500">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Đã trao đổi gần đây */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-ink-200 px-3.5 py-2.5">
          <History className="h-3.5 w-3.5 text-brand-700" />
          <h2 className="text-[13px] font-bold text-ink-900">Đã gửi gần đây</h2>
          <Link
            href="/mail"
            className="ml-auto text-[11.5px] font-semibold text-brand-700 transition hover:underline"
          >
            Hộp thư
          </Link>
        </header>
        {relatedRecent.length === 0 ? (
          <p className="px-3.5 py-3 text-[12.5px] text-ink-500">
            {active ? "Chưa có email nào với người nhận này." : "Chọn người nhận để xem lịch sử."}
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {relatedRecent.map((m) => (
              <li key={m.id}>
                <Link
                  href={m.status === "draft" ? `/mail/compose?draft=${m.id}` : `/mail/${m.id}`}
                  className="block px-3.5 py-2.5 transition hover:bg-ink-50"
                >
                  <p className="truncate text-[12.5px] font-medium text-ink-800">
                    {m.subject || "(không tiêu đề)"}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-500">
                    <span>{formatDateTime(m.created_at)}</span>
                    <span>· {m.direction === "buyer" ? "→ Buyer" : "→ NCC"}</span>
                    {m.status === "draft" && <span className="text-amber-700">· nháp</span>}
                    {m.status === "failed" && <span className="text-red-700">· gửi lỗi</span>}
                    {m.status === "simulated" && <span className="text-ink-400">· demo</span>}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-[86px] shrink-0 text-ink-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink-700">{value}</dd>
    </div>
  );
}

function LevelIcon({ level }: { level: Level }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0";
  if (level === "error") return <CircleAlert className={cx(cls, "text-red-500")} />;
  if (level === "warn") return <TriangleAlert className={cx(cls, "text-amber-500")} />;
  if (level === "ok") return <CheckCircle2 className={cx(cls, "text-emerald-600")} />;
  return <Info className={cx(cls, "text-ink-400")} />;
}
