#!/usr/bin/env node
// node scripts/check-typography.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

// 1. Font giao diện Inter qua next/font/google (chủ dự án chốt 25/11/2026), đủ bộ chữ tiếng Việt;
//    JetBrains Mono cho mã/ô nhập số. Không còn nạp Be Vietnam Pro cho giao diện.
const rootLayout = read("app/layout.tsx");
assert.match(rootLayout, /import \{ Inter \} from "next\/font\/google";/, "Root layout loads Inter via next/font/google");
assert.match(rootLayout, /subsets: \["latin", "latin-ext", "vietnamese"\]/, "Inter includes the Vietnamese subset");
assert.match(rootLayout, /variable: "--font-inter"/);
assert.match(rootLayout, /<html lang="en" suppressHydrationWarning className=\{inter\.variable\}>/, "Inter variable is set on <html>");
assert.doesNotMatch(rootLayout, /@fontsource\/be-vietnam-pro/, "Be Vietnam Pro is no longer loaded for the UI");
assert.ok(
  rootLayout.includes("@fontsource-variable/jetbrains-mono"),
  "Root layout imports JetBrains Mono Variable",
);

// 2. Token theme thống nhất trong globals.css
const globalsCss = read("app/globals.css");
assert.match(globalsCss, /--font-sans:\s*var\(--font-inter\), "Inter"/, "--font-sans starts with Inter");
// Thang độ đậm: tiêu đề/nút khoảng 600, chữ lớn khép -0.015em.
assert.match(globalsCss, /--font-weight-bold: 600;/);
assert.match(globalsCss, /--font-weight-extrabold: 650;/);
assert.match(globalsCss, /--font-weight-black: 700;/);
assert.match(globalsCss, /--tracking-tight: -0\.015em;/);
assert.match(globalsCss, /--font-display:\s*var\(--font-sans\)/, "--font-display maps to --font-sans");
assert.match(
  globalsCss,
  /--font-mono:\s*"JetBrains Mono Variable",\s*"JetBrains Mono"/,
  "--font-mono starts with JetBrains Mono",
);
assert.match(globalsCss, /\.font-price\s*\{[\s\S]*?var\(--font-mono\)/, ".font-price uses --font-mono");

// 3. Không còn bất kỳ khai báo Georgia / Times New Roman / font-serif nào trong app/ và components/
for (const file of [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))]) {
  const rel = path.relative(root, file);
  const content = readFileSync(file, "utf8");
  assert.doesNotMatch(
    content,
    /Georgia|Times New Roman|\bfont-serif\b/,
    `${rel} must not override UI typography with serif fonts`,
  );
}

// 4. Toàn bộ vùng hiển thị giá phía buyer (thẻ sản phẩm, bảng Grades & reference pricing trên PDP, bảng so sánh, dải Reference price danh mục) dùng font chính (Inter) với tabular-nums (không dùng font-mono gây thưa chữ), trong khi ô nhập số / mã code nội bộ vẫn giữ JetBrains Mono.
for (const rel of [
  "components/public-product-card.tsx",
  "app/(public)/products/[slug]/[productId]/page.tsx",
  "components/public/product-comparison-table.tsx",
  "components/price-range.tsx",
  "components/sponsored-pilot-slot.tsx",
]) {
  const source = read(rel);
  assert.doesNotMatch(source, /\bfont-mono\b/, `${rel} uses the UI font (Inter) instead of monospace`);
  assert.match(source, /\btabular-nums\b/, `${rel} preserves aligned tabular numerals`);
}

for (const [rel, pattern] of [
  ["app/supplier/portal/products/product-storefront.tsx", /font-mono text-\[13px\] font-bold tabular-nums text-ink-900">\{money\(p, intl\)\}/],
  ["app/supplier/portal/products/product-editor.tsx", /row\.label === copy\.reviewLabels\.price && row\.value !== "-" \? "font-mono tabular-nums"/],
]) {
  assert.match(read(rel), pattern, `${rel} renders internal portal numeric fields in JetBrains Mono`);
}

console.log("✅ Typography unified: Inter + tabular-nums for all buyer prices & UI text; JetBrains Mono for codes/inputs.");
