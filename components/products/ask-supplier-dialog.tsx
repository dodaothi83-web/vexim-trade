"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { lockDialogScroll } from "@/lib/browser/dialog-scroll-lock";
import { useBuyerEnquiryAuth } from "@/components/buyer-enquiry-auth";
import { RfqForm } from "@/app/(public)/rfq/rfq-form";

export function AskSupplierDialog({ category, productId, productName, supplierId, supplierName, grade, imageUrl, quoteHref }: {
  category: string; productId: string; productName: string; supplierId: string;
  supplierName: string; grade: string; imageUrl: string | null; quoteHref: string;
}) {
  const { email, requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const params = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  function showQuestion() { setMounted(true); dialog.current?.showModal(); }
  function open() {
    const destination = new URL(window.location.href);
    destination.searchParams.set("ask", "1");
    requireBuyer(destination.pathname + destination.search, showQuestion);
  }
  useEffect(() => {
    if (params.get("ask") === "1") {
      open();
    }
  }, [params, email]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    let unlock: (() => void) | null = null;
    const sync = () => {
      if (element.open && !unlock) unlock = lockDialogScroll();
      else if (!element.open && unlock) { unlock(); unlock = null; }
    };
    const observer = new MutationObserver(sync);
    sync();
    observer.observe(element, { attributes: true, attributeFilter: ["open"] });
    return () => { observer.disconnect(); unlock?.(); };
  }, []);
  return <>
    <button type="button" onClick={open} aria-label={`Ask supplier about ${productName}`} className="btn btn-soft min-h-12 w-full justify-center px-2 text-sm font-bold sm:px-4 sm:text-base">
      <MessageCircle className="h-5 w-5 shrink-0" />Ask supplier
    </button>
    <dialog ref={dialog} aria-labelledby="ask-supplier-title" className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-y-auto bg-white p-5 text-ink-900 backdrop:bg-black/40 sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-2xl sm:p-8"
      onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close(); } }}>
      <div className="flex items-start justify-between gap-4">
        <h2 id="ask-supplier-title" className="text-2xl font-bold">Ask about this product</h2>
        <button autoFocus type="button" aria-label="Close question form" className="rounded-lg p-2 hover:bg-ink-50" onClick={() => dialog.current?.close()}><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-2 text-sm text-ink-600">Vexim will help connect you with this supplier.</p>
      {successUrl ? <div role="status" className="mt-6 space-y-4 rounded-xl bg-success-surface p-5 text-success">
        <p className="font-semibold">Your question has been sent.</p>
        <Link href={successUrl} className="font-semibold text-brand-700 underline">View your enquiry</Link>
        <Link href="/buyer/account?tab=requests" className="ml-4 font-semibold text-brand-700 underline">All enquiries</Link>
      </div> : mounted && <RfqForm buyerEmail={email ?? ""} categories={[]} categorySpecs={{}} initialCategory={category} initialProductId={productId} initialProduct={productName} initialGrade={grade}
        initialSupplierIds={[supplierId]} initialSuppliers={[{ id: supplierId, name: supplierName }]} wantsSamples={false} mode="question"
        questionImageUrl={imageUrl} questionQuoteHref={quoteHref} onQuestionSuccess={setSuccessUrl} />}
    </dialog>
  </>;
}
