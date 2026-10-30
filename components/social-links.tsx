import Image from "next/image";

/** Small, accessible links to Vexim's public company profiles. */
export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Vexim Trade social media" className={`flex items-center gap-1 ${className}`}>
      <a
        href="https://www.linkedin.com/company/143976436/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Vexim Trade on LinkedIn (opens in a new tab)"
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-ink-100/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Image src="/linkedin.png" alt="" width={20} height={20} unoptimized />
      </a>
      <a
        href="https://www.facebook.com/profile.php?id=61568290953268"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Vexim Trade on Facebook (opens in a new tab)"
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-ink-100/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Image src="/facebook.png" alt="" width={20} height={20} unoptimized />
      </a>
    </nav>
  );
}
