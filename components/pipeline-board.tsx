"use client";

import Link from "next/link";
import { useState } from "react";
import { Factory, GripVertical, KanbanSquare, MailWarning } from "lucide-react";

import { STAGES, getStage, type StageKey } from "@/lib/pipeline";
import type { BuyerWithSupplier } from "@/lib/types";
import {
  ConfirmSheet,
  StageSelect,
  useStageChange,
  type StageTarget,
} from "@/components/stage-select";
import { EmptyState, cx, formatMoney } from "@/components/ui";
import { useAutoSend } from "@/components/auto-send";

function toTarget(b: BuyerWithSupplier): StageTarget {
  return {
    id: b.id,
    company: b.company,
    stage: b.stage,
    buyerEmail: b.email,
    buyerCc: b.cc_emails,
    supplierName: b.supplier?.name ?? null,
    supplierEmail: b.supplier?.email ?? null,
    owner: b.owner,
  };
}

export function PipelineBoard({
  buyers,
  highlight,
}: {
  buyers: BuyerWithSupplier[];
  highlight?: string;
}) {
  const { run, busy } = useStageChange();
  const { value: autoSend } = useAutoSend();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ target: StageTarget; stage: StageKey } | null>(
    null,
  );

  function move(b: BuyerWithSupplier, stage: StageKey) {
    if (b.stage === stage) return;
    const target = toTarget(b);
    if (autoSend || getStage(stage).silent) {
      void run(target, stage, !getStage(stage).silent);
    } else {
      setConfirming({ target, stage });
    }
  }

  return (
    <>
      {buyers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<KanbanSquare className="h-5 w-5" />}
            title="Pipeline đang trống"
            sub="Thêm buyer để thấy các thẻ xuất hiện theo từng cột trạng thái."
            action={
              <Link href="/buyers/new" className="btn btn-primary">
                Thêm buyer
              </Link>
            }
          />
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 pb-4">
          <div className="flex min-w-max gap-3">
            {STAGES.map((s) => {
              const items = buyers.filter((b) => b.stage === s.key);
              const value = items.reduce((sum, b) => sum + (b.deal_value ?? 0), 0);
              const isOver = overStage === s.key;
              return (
                <div
                  key={s.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(s.key);
                  }}
                  onDragLeave={() => setOverStage((v) => (v === s.key ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    const id = e.dataTransfer.getData("text/plain") || dragId;
                    const b = buyers.find((x) => x.id === id);
                    setDragId(null);
                    if (b) move(b, s.key);
                  }}
                  className={cx(
                    "flex w-[286px] shrink-0 flex-col rounded-xl border bg-white/60 transition",
                    isOver
                      ? "border-brand-400 bg-brand-50 ring-2 ring-brand-400/30"
                      : highlight === s.key
                        ? "border-brand-400 ring-2 ring-brand-400/25"
                        : "border-ink-200",
                  )}
                >
                  <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-ink-900">{s.label}</p>
                      <p className="text-[11px] text-ink-500">
                        {items.length} buyer · {formatMoney(value)}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: `${s.color}18`, color: s.color }}
                    >
                      {items.length}
                    </span>
                  </div>

                  <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                    {items.length === 0 && (
                      <p className="px-2 py-6 text-center text-[11.5px] text-ink-400">
                        Kéo thẻ buyer vào đây
                      </p>
                    )}
                    {items.map((b) => (
                      <article
                        key={b.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", b.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(b.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        className={cx(
                          "group cursor-grab rounded-lg border border-ink-200 bg-white p-2.5 shadow-card transition hover:border-brand-300 hover:shadow-pop active:cursor-grabbing",
                          dragId === b.id && "opacity-40",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300 group-hover:text-ink-400" />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/buyers/${b.id}`}
                              className="block truncate text-[13px] font-semibold text-ink-900 hover:text-brand-700"
                            >
                              {b.company}
                            </Link>
                            <p className="truncate text-[11px] text-ink-500">
                              {[b.country, b.product].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[12px] font-bold text-ink-800">
                            {formatMoney(b.deal_value)}
                          </span>
                          <span className="flex items-center gap-1">
                            {!b.email && <MailWarning className="h-3.5 w-3.5 text-amber-500" />}
                            {b.owner && (
                              <span
                                title={b.owner}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-100 text-[9.5px] font-bold text-ink-600"
                              >
                                {b.owner
                                  .split(/\s+/)
                                  .slice(-1)[0]
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-1.5 border-t border-ink-100 pt-2">
                          <Factory className="h-3 w-3 shrink-0 text-ink-400" />
                          {b.supplier ? (
                            <span className="truncate text-[11px] text-ink-600">
                              {b.supplier.name}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-600">Chưa gắn NCC</span>
                          )}
                        </div>

                        <div className="mt-2">
                          <StageSelect target={toTarget(b)} autoSend={autoSend} className="w-full" />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmSheet
          target={confirming.target}
          stage={confirming.stage}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={(sendEmail, note) => {
            const c = confirming;
            setConfirming(null);
            if (c) void run(c.target, c.stage, sendEmail, note);
          }}
        />
      )}
    </>
  );
}
