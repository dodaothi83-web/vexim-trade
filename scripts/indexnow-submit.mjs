#!/usr/bin/env node
/**
 * Gửi toàn bộ URL trong sitemap.xml của production lên IndexNow một lần.
 * Dùng sau khi mở index lần đầu, hoặc khi có hồ sơ tự công khai sau duyệt L1
 * (trigger trong database, không đi qua server action nên không tự báo).
 *
 * Chạy:  npm run indexnow:submit -- [baseUrl]
 *        node scripts/indexnow-submit.mjs https://www.veximtrade.com
 *        node scripts/indexnow-submit.mjs --dry-run
 */
const KEY = "e6ef7b5f38cb41bc8dde701474dbb2ac"; // giữ khớp lib/seo/indexnow.ts và public/<key>.txt
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const base = (args.find((a) => !a.startsWith("--")) || "https://www.veximtrade.com").replace(/\/+$/, "");
const host = new URL(base).host;

const res = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(20000) });
if (!res.ok) { console.error(`Không tải được sitemap: HTTP ${res.status}`); process.exit(1); }
const xml = await res.text();
const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].trim().replace(/&amp;/g, "&"))
  .filter((u) => { try { return new URL(u).host === host; } catch { return false; } }))];
if (!urls.length) { console.error("Sitemap không có URL nào thuộc", host); process.exit(1); }

const keyRes = await fetch(`${base}/${KEY}.txt`, { signal: AbortSignal.timeout(20000) });
const keyBody = keyRes.ok ? (await keyRes.text()).trim() : "";
if (keyBody !== KEY) { console.error(`File key ${base}/${KEY}.txt chưa đúng (HTTP ${keyRes.status}). Deploy trước rồi chạy lại.`); process.exit(1); }

console.log(`${urls.length} URL từ ${base}/sitemap.xml`);
if (dryRun) { console.log(urls.join("\n")); process.exit(0); }

for (let i = 0; i < urls.length; i += 10000) {
  const urlList = urls.slice(i, i + 10000);
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: KEY, keyLocation: `${base}/${KEY}.txt`, urlList }),
    signal: AbortSignal.timeout(20000),
  });
  console.log(`IndexNow: HTTP ${r.status} cho ${urlList.length} URL${r.status >= 400 ? ` — ${await r.text()}` : ""}`);
  if (r.status >= 400) process.exit(1);
}
