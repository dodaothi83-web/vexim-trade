import Link from "next/link";

import { PLATFORM_RULES_COPY, type PlatformRulesLocale } from "@/lib/legal/platform-rules-copy";

export function PlatformRulesDocument({ locale }: { locale: PlatformRulesLocale }) {
  const copy = PLATFORM_RULES_COPY[locale];

  return (
    <article lang={locale} className="rounded-2xl border border-ink-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">{copy.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">{copy.title}</h1>
          <p className="mt-3 text-sm text-ink-500">{copy.updated}</p>
        </div>
        <Link href={copy.languageHref} hrefLang={locale === "vi" ? "en" : "vi"} className="btn btn-ghost btn-sm">
          {copy.languageLabel}: {copy.languageName}
        </Link>
      </div>

      <p className="mt-6 text-sm leading-7 text-ink-700">{copy.intro}</p>

      <div className="mt-2 divide-y divide-ink-100">
        {copy.sections.map((section) => (
          <section key={section.id} className="space-y-3 py-6" aria-labelledby={section.id}>
            <h2 id={section.id} className="text-xl font-bold text-ink-900">{section.title}</h2>
            {section.paragraphs?.map((paragraph, index) => (
              <p key={index} className="text-sm leading-7 text-ink-700">{paragraph}</p>
            ))}
            {section.bullets && (
              <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-ink-700">
                {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>

      <aside className="mt-2 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
        <h2 className="text-sm font-bold text-ink-900">{copy.noteTitle}</h2>
        <p className="mt-1 text-sm leading-6 text-ink-700">{copy.note}</p>
        {copy.governingText && <p className="mt-1 text-sm leading-6 text-ink-700">{copy.governingText}</p>}
      </aside>

      <section className="mt-7 border-t border-ink-100 pt-5" aria-label={copy.resourcesTitle}>
        <h2 className="text-sm font-bold text-ink-900">{copy.resourcesTitle}</h2>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {copy.resources.map((resource) => (
            <li key={resource.href}>
              <Link href={resource.href} className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
                {resource.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
