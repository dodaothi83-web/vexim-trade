import Script from "next/script";

/**
 * Google tag (gtag.js) cho landing công khai.
 * Chỉ tải khi NEXT_PUBLIC_GA_ID có dạng G-XXXXXXXX. Nếu chưa đặt biến, component không render gì.
 * Biến NEXT_PUBLIC_* được gắn vào bundle lúc build, nên sau khi đặt trên Vercel phải redeploy.
 */
export function GoogleTag() {
  const id = process.env.NEXT_PUBLIC_GA_ID?.trim() ?? "";
  if (!/^G-[A-Z0-9]+$/.test(id)) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="google-tag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  );
}
