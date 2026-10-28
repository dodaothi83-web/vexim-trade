"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Package, Send } from "lucide-react";
import { submitSponsoredRequestAction } from "./actions";
import type { RequestResult } from "./types";
import type { PushCandidate } from "@/lib/sponsored/eligibility";

const INITIAL: RequestResult = { ok: false, message: "" };

export function RequestForm({ candidates, openProductIds, candidatesAvailable, requestStorageAvailable }: {
  candidates: PushCandidate[];
  openProductIds: string[];
  candidatesAvailable: boolean;
  requestStorageAvailable: boolean;
}) {
  const [state, action, pending] = useActionState(submitSponsoredRequestAction, INITIAL);
  const [selected, setSelected] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const open = new Set(openProductIds);
  const chosen = candidates.find((c) => c.productId === selected);
  const selectable = candidates.some((c) => !open.has(c.productId));

  useEffect(() => {
    if (!state.ok || !state.requestId) return;
    form.current?.reset();
    setSelected("");
    router.refresh();
  }, [state.ok, state.requestId, router]);

  return <section id="gui-yeu-cau" aria-labelledby="request-title" className="scroll-mt-20 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
    <div className="border-b border-ink-100 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Send className="size-5" aria-hidden="true" /></span>
        <div><h2 id="request-title" className="text-[15px] font-bold text-ink-900">Gửi yêu cầu đẩy sản phẩm</h2>
          <p className="mt-0.5 text-xs leading-5 text-ink-500">Nhân viên kiểm tra và liên hệ báo giá.</p></div>
      </div>
    </div>
    <div className="p-5 sm:p-6">
      {!requestStorageAvailable ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">Chưa thể gửi yêu cầu lúc này. Vui lòng thử lại sau.</p>
        : !candidatesAvailable ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">Chưa tải được danh sách sản phẩm. Hãy tải lại trang để thử lại.</p>
        : !candidates.length ? <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50 p-4">
          <p className="text-sm font-semibold text-ink-800">Chưa có sản phẩm đủ điều kiện</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">Sản phẩm và hồ sơ cần được công khai; sản phẩm cần có ảnh hoặc catalogue có thể chia sẻ.</p>
          <Link href="/supplier/portal/products" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900">Kiểm tra sản phẩm <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
        </div> : <form ref={form} action={action}>
          <label htmlFor="boost-product" className="block text-xs font-bold text-ink-700">Sản phẩm <span className="text-rose-600" aria-hidden="true">*</span></label>
          <select id="boost-product" name="product" required value={selected} onChange={(e) => setSelected(e.target.value)}
            className="mt-2 block w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-500">
            <option value="">Chọn sản phẩm</option>
            {candidates.map((c) => <option key={c.productId} value={c.productId} disabled={open.has(c.productId)}>{c.name} · {c.categoryName}{open.has(c.productId) ? " — đã gửi yêu cầu" : ""}</option>)}
          </select>
          <p className="mt-1.5 text-xs leading-5 text-ink-500">Chỉ hiện sản phẩm đủ điều kiện tại thời điểm tải trang.</p>
          {!selectable && <p className="mt-2 text-xs font-semibold text-amber-800">Các sản phẩm này đều đã có yêu cầu đang xử lý.</p>}
          {chosen && <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
            <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-brand-700 ring-1 ring-brand-100">
              <Package className="size-5" aria-hidden="true" />
              {chosen.imagePath && <img key={chosen.productId} src={`/public-media/${chosen.imagePath.replace(/^\//, "")}`} alt="" className="absolute inset-0 size-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
            </span>
            <span className="min-w-0"><span className="block break-words text-sm font-bold text-ink-900">{chosen.name}</span><span className="mt-0.5 block text-xs text-ink-600">Danh mục: {chosen.categoryName}</span></span>
          </div>}
          <label htmlFor="boost-note" className="mt-5 block text-xs font-bold text-ink-700">Lời nhắn <span className="font-normal text-ink-500">(không bắt buộc)</span></label>
          <textarea id="boost-note" name="note" rows={3} maxLength={500} placeholder="Ví dụ: thời gian bạn muốn chạy"
            className="mt-2 block w-full resize-y rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-500" />
          <p className="mt-1.5 text-xs text-ink-500">Tối đa 500 ký tự.</p>
          {state.message && <div role={state.ok ? "status" : "alert"} className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-xs leading-5 ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {state.ok && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}{state.message}</div>}
          <button type="submit" disabled={pending || !selectable} className="btn btn-primary mt-5 w-full justify-center">
            {pending ? "Đang gửi…" : "Gửi yêu cầu"}<ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-ink-500">Gửi yêu cầu không tạo gói hoặc thanh toán.</p>
        </form>}
    </div>
  </section>;
}
