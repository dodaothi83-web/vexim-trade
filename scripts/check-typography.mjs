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

// 1. Nạp đúng 2 bộ font mở từ Google Fonts (Be Vietnam Pro + JetBrains Mono) ở layout gốc
const rootLayout = read("app/layout.tsx");
for (const weight of ["400", "400-italic", "500", "600", "700", "800", "900"]) {
  assert.ok(
    rootLayout.includes(`@fontsource/be-vietnam-pro/${weight}.css`),
    `Root layout imports Be Vietnam Pro ${weight}`,
  );
}
assert.ok(
  rootLayout.includes("@fontsource-variable/jetbrains-mono"),
  "Root layout imports JetBrains Mono Variable",
);

// 2. Token theme thống nhất trong globals.css
const globalsCss = read("app/globals.css");
assert.match(globalsCss, /--font-sans:\s*"Be Vietnam Pro"/, "--font-sans starts with Be Vietnam Pro");
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

// 4. Các bảng giá & chi tiết dùng JetBrains Mono (font-mono + tabular-nums), còn thẻ sản phẩm dùng font chính (Be Vietnam Pro) cỡ vừa một dòng với tabular-nums
const productCardSource = read("components/public-product-card.tsx");
assert.doesNotMatch(productCardSource, /\bfont-mono\b/, "components/public-product-card.tsx uses primary font instead of large monospace");
assert.match(productCardSource, /h-5 truncate whitespace-nowrap tabular-nums/, "components/public-product-card.tsx keeps price on a single tabular-nums line");

for (const [rel, pattern] of [
  ["components/public/product-comparison-table.tsx", /font-mono font-black tabular-nums text-brand-800">\{product\.price\}/],
  ["components/price-range.tsx", /<span className="font-mono tabular-nums">\{formatUnitRange\(range\.low, range\.high, range\.unit\)\}<\/span>/],
  ["app/(public)/products/[slug]/[productId]/page.tsx", /card\.price \? "font-mono tabular-nums" : ""/],
  ["app/supplier/portal/products/product-storefront.tsx", /font-mono text-\[13px\] font-bold tabular-nums text-ink-900">\{money\(p\)\}/],
  ["app/supplier/portal/products/product-editor.tsx", /row\.label === "Giá tham khảo" && row\.value !== "-" \? "font-mono tabular-nums"/],
]) {
  assert.match(read(rel), pattern, `${rel} renders numeric prices in JetBrains Mono`);
}

console.log("✅ Typography unified: Be Vietnam Pro for all UI text + JetBrains Mono for price figures.");
