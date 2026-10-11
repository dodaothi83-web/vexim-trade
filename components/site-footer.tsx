import { COMPANY } from "@/lib/config";
import { Logo } from "@/components/brand-logo";

/** Chân trang dùng chung cho trang chủ và trang blog. */
export function SiteFooter() {
  return (
  <footer className="bg-ink-900 text-slate-400">
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
      <div>
        <Logo className="h-10 w-[54px] shrink-0" />
        <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed">
          Veximtrade | VEXIM GLOBAL CO., LTD
          <br />
          {COMPANY.address}
          <br />
          {COMPANY.phone} · {COMPANY.email}
        </p>
        <p className="mt-3 text-[12.5px] italic text-slate-500">
          We match the brief. The decision stays with you.
        </p>
      </div>
      <div className="text-[12.5px]">
        <p className="font-semibold text-slate-200">Vexim Global ecosystem</p>
        <a
          href="https://www.veximglobal.com/"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block transition hover:text-white"
        >
          www.veximglobal.com
        </a>
        <div className="mt-4 flex items-center gap-3">
          <a
            href="https://www.linkedin.com/company/vexim-global/posts/?feedView=all"
            target="_blank"
            rel="noreferrer"
            aria-label="Vexim Global on LinkedIn"
            title="LinkedIn"
            className="block transition hover:opacity-80"
          >
            <img src="/linkedin.png" alt="" width={32} height={32} className="h-8 w-8" />
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61568290953268"
            target="_blank"
            rel="noreferrer"
            aria-label="Vexim Global on Facebook"
            title="Facebook"
            className="block transition hover:opacity-80"
          >
            <img src="/facebook.png" alt="" width={32} height={32} className="h-8 w-8" />
          </a>
        </div>
        <p className="mt-4 font-semibold text-slate-200">Partners &amp; staff</p>
        <a href="/login" className="mt-1 inline-block transition hover:text-white">
          Staff sign in
        </a>
      </div>
    </div>
    <div className="border-t border-white/10 py-4 text-center text-[11.5px] text-slate-500">
      © {new Date().getFullYear()} Veximtrade | VEXIM GLOBAL CO., LTD
    </div>
  </footer>
  );
}
