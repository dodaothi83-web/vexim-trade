import Script from "next/script";

/**
 * Google tag (gtag.js) cho landing công khai.
 * Chỉ tải khi ID có dạng G-XXXXXXXX. Mặc định là Measurement ID của veximtrade.com.
 * Biến NEXT_PUBLIC_* được gắn vào bundle lúc build, nên sau khi đặt trên Vercel phải redeploy.
 */
export function GoogleTag() {
  // Measurement ID công khai (xuất hiện trong mã nguồn trang), dùng làm mặc định nếu chưa đặt biến môi trường.
  const id = process.env.NEXT_PUBLIC_GA_ID?.trim() || "G-229VH1H6JW";
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
