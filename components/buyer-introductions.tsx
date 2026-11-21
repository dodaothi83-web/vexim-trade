"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import {
  answerIntroPromptAction, confirmIntroductionsWithTokenAction, finishOnboardingAction, saveIntroductionsAction, stopInvitesWithTokenAction, unsubscribeWithTokenAction,
} from "@/app/(public)/buyer/introductions/actions";

/**
 * Người mua chọn ngành hàng và đồng ý nhận giới thiệu nhà cung cấp (đợt 1). Danh sách ngành do máy
 * chủ đọc từ bảng categories (ngành đang đăng), nên thêm ngành không phải sửa ở đây.
 */
export type IntroCategoryOption = { id: string; slug: string; name: string };

const NOTE = "You choose once or twice a week. Unsubscribe in one click from any email.";

export function CategoryPicker({ categories, selected, onChange, disabled }: {
  categories: IntroCategoryOption[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const many = categories.length > 12;
  const shown = many && query.trim() ? categories.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())) : categories;
  return <div>
    {many && <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products"
      className="mb-3 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm" />}
    <div role="group" aria-label="Products you source" className="flex flex-wrap gap-2">
      {shown.map((c) => {
        const on = selected.includes(c.id);
        return <button key={c.id} type="button" aria-pressed={on} disabled={disabled}
          onClick={() => onChange(on ? selected.filter((id) => id !== c.id) : [...selected, c.id])}
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60 ${on ? "border-brand-700 bg-brand-50 text-brand-900 ring-2 ring-brand-100" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"}`}>
          <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded-full border ${on ? "border-brand-700 bg-brand-700 text-white" : "border-ink-300"}`}>{on && <Check className="size-3" />}</span>{c.name}
        </button>;
      })}
    </div>
  </div>;
}

export type IntroFrequency = "weekly" | "twice";

/** Mức nhận thư: hai thư (sản phẩm thứ Ba, thị trường thứ Sáu) hoặc một thư (chỉ sản phẩm). */
export function FrequencyPicker({ value, onChange, disabled }: { value: IntroFrequency; onChange: (v: IntroFrequency) => void; disabled?: boolean }) {
  const options: Array<{ value: IntroFrequency; label: string; hint: string }> = [
    { value: "twice", label: "Twice a week", hint: "New products on Tuesday, market notes on Friday." },
    { value: "weekly", label: "Once a week", hint: "New products on Tuesday only." },
  ];
  return <fieldset className="mt-5">
    <legend className="mb-2 text-[13px] font-bold text-ink-800">How often</legend>
    <div className="grid gap-2 sm:grid-cols-2">{options.map((o) => <label key={o.value}
      className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 text-sm ${value === o.value ? "border-brand-700 bg-brand-50 ring-2 ring-brand-100" : "border-ink-200 bg-white"}`}>
      <input type="radio" name="intro-frequency" className="mt-1" checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
      <span><b className="text-ink-900">{o.label}</b><span className="block text-[13px] text-ink-500">{o.hint}</span></span>
    </label>)}</div>
  </fieldset>;
}

/** Trang mở từ thư mời (không cần đăng nhập): chọn ngành rồi Confirm. */
export function IntroTokenForm({ token, categories, initial, frequency: initialFrequency = "twice" }: { token: string; categories: IntroCategoryOption[]; initial: string[]; frequency?: IntroFrequency }) {
  const [selected, setSelected] = useState(initial);
  const [frequency, setFrequency] = useState<IntroFrequency>(initialFrequency);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <div>
    <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
      <Check className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p><b>You&apos;re set.</b> We&apos;ll introduce suppliers of {categories.filter((c) => selected.includes(c.id)).map((c) => c.name).join(", ")}, {frequency === "twice" ? "twice a week" : "once a week"}. Change this anytime in your account.</p>
    </div>
    <h2 className="mb-2 mt-6 text-base font-bold text-ink-900">Browse now</h2>
    <div className="flex flex-wrap gap-2">{categories.filter((c) => selected.includes(c.id)).map((c) =>
      <Link key={c.id} href={`/products/${encodeURIComponent(c.slug)}`} className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-800 hover:border-brand-300">{c.name} suppliers →</Link>)}</div>
  </div>;
  return <div>
    <CategoryPicker categories={categories} selected={selected} onChange={setSelected} disabled={pending} />
    <FrequencyPicker value={frequency} onChange={setFrequency} disabled={pending} />
    <p className="mt-4 text-[13px] text-ink-500">Unsubscribe in one click from any email.</p>
    {error && <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" disabled={pending || !selected.length} onClick={() => start(async () => {
        setError(null);
        const result = await confirmIntroductionsWithTokenAction(token, selected, frequency).catch(() => ({ ok: false, message: "Could not save. Please try again." }));
        if (result.ok) setDone(true); else setError(result.message ?? null);
      })} className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Send me supplier introductions</button>
      <Link href="/" className="rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-bold text-ink-800 hover:bg-ink-50">Not now</Link>
    </div>
  </div>;
}

/** "Don't ask me again": xác nhận bằng nút (máy quét thư mở link cũng không tự huỷ). */
export function IntroStopForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, start] = useTransition();
  if (state === "done") return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Done. We won&apos;t ask you again.</p>;
  return <div>
    <button type="button" disabled={pending} onClick={() => start(async () => {
      const result = await stopInvitesWithTokenAction(token).catch(() => ({ ok: false }));
      setState(result.ok ? "done" : "error");
    })} className="rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60">Don&apos;t ask me again</button>
    {state === "error" && <p role="alert" className="mt-2 text-sm text-rose-700">Could not save. Please try again.</p>}
  </div>;
}

/** Huỷ nhận thư (link "Unsubscribe" trong thư): bấm nút mới huỷ. */
export function IntroUnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, start] = useTransition();
  if (state === "done") return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">You&apos;re unsubscribed. You can turn introductions back on in your account.</p>;
  return <div>
    <button type="button" disabled={pending} onClick={() => start(async () => {
      const result = await unsubscribeWithTokenAction(token).catch(() => ({ ok: false }));
      setState(result.ok ? "done" : "error");
    })} className="rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60">Unsubscribe</button>
    {state === "error" && <p role="alert" className="mt-2 text-sm text-rose-700">Could not save. Please try again.</p>}
  </div>;
}

/** Ô "Supplier introductions" trong tài khoản người mua. */
export function IntroAccountCard({ categories, optIn, initial, frequency: initialFrequency = "twice" }: { categories: IntroCategoryOption[]; optIn: boolean; initial: string[]; frequency?: IntroFrequency }) {
  const [frequency, setFrequency] = useState<IntroFrequency>(initialFrequency);
  const router = useRouter();
  const [on, setOn] = useState(optIn);
  const [selected, setSelected] = useState(initial);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return <section aria-labelledby="intro-title" className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 id="intro-title" className="text-base font-bold text-ink-900">Supplier introductions</h2>
        <p className="mt-0.5 text-sm leading-6 text-ink-500">We email checked suppliers that match what you source. Up to twice a week; you choose.</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label="Supplier introductions" onClick={() => setOn(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand-700" : "bg-ink-200"}`}>
        <span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
    </div>
    {on && <div className="mt-4"><p className="mb-2 text-[13px] font-bold text-ink-800">Products you source</p>
      <CategoryPicker categories={categories} selected={selected} onChange={setSelected} disabled={pending} />
      <FrequencyPicker value={frequency} onChange={setFrequency} disabled={pending} /></div>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending || (on && !selected.length)} onClick={() => start(async () => {
        setNote(null);
        const result = await saveIntroductionsAction(on, selected, frequency).catch(() => ({ ok: false, message: "Could not save. Please try again." }));
        setNote({ ok: result.ok, text: result.message ?? "" });
        if (result.ok) router.refresh();
      })} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60">Save</button>
      <span className="text-xs text-ink-500">Suppliers never see your name or email.</span>
      {note && <span role={note.ok ? "status" : "alert"} className={`text-xs font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</span>}
    </div>
  </section>;
}

/** Bước chọn ngành ngay sau khi đăng ký (một lần; Skip là thôi). */
export function IntroOnboardingCard({ categories, initial }: { categories: IntroCategoryOption[]; initial: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const finish = (ids: string[] | null) => start(async () => {
    setError(null);
    const result = await finishOnboardingAction(ids).catch(() => ({ ok: false, message: "Could not save. Please try again." }));
    if (result.ok) router.refresh(); else setError(result.message ?? null);
  });
  return <section aria-labelledby="intro-onboarding-title" className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm sm:p-6">
    <h2 id="intro-onboarding-title" className="text-lg font-bold text-ink-900">What do you source?</h2>
    <p className="mb-4 mt-1 text-sm leading-6 text-ink-600">Pick the products you buy. We&apos;ll introduce matching checked suppliers, up to twice a week.</p>
    <CategoryPicker categories={categories} selected={selected} onChange={setSelected} disabled={pending} />
    <p className="mt-3 text-[13px] text-ink-500">{NOTE}</p>
    {error && <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={pending || !selected.length} onClick={() => finish(selected)} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60">Send me supplier introductions</button>
      <button type="button" disabled={pending} onClick={() => finish(null)} className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-bold text-ink-700 hover:bg-ink-50">Skip</button>
    </div>
  </section>;
}

/** Lời mời đúng lúc (sau báo giá / sau khi lưu sản phẩm): một bấm là thêm đúng ngành đó. */
export function IntroPrompt({ category, source, compact = false }: { category: IntroCategoryOption; source: "rfq" | "saved"; compact?: boolean }) {
  const [state, setState] = useState<"ask" | "yes" | "no">("ask");
  const [pending, start] = useTransition();
  const answer = (yes: boolean) => start(async () => {
    const result = await answerIntroPromptAction(category.id, yes, source).catch(() => ({ ok: false }));
    if (result.ok) setState(yes ? "yes" : "no");
  });
  if (state === "no") return null;
  if (state === "yes") return <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Done. We&apos;ll introduce {category.name} suppliers, up to twice a week.</p>;
  return <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white ${compact ? "p-3 text-[13px]" : "px-4 py-3 text-sm"} shadow-sm`}>
    <p className="min-w-0 flex-1 leading-6"><b>{source === "rfq" ? `Get more ${category.name} suppliers?` : `Want new ${category.name} suppliers by email?`}</b>
      <span className="block text-ink-500">We&apos;ll introduce matching checked suppliers, up to twice a week.</span></p>
    <button type="button" disabled={pending} onClick={() => answer(true)} className="rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60">Yes, send me</button>
    <button type="button" disabled={pending} onClick={() => answer(false)} className="rounded-lg border border-ink-200 px-3.5 py-2 text-sm font-bold text-ink-700 hover:bg-ink-50 disabled:opacity-60">No</button>
  </div>;
}
