#!/usr/bin/env node
// node scripts/check-sponsored-band.mjs
//
// Kiểm bước ghép gói đẩy với sản phẩm công khai: đủ suất, đúng cửa sổ, không
// trùng với lưới tự nhiên, gói hỏng thì bỏ qua chứ không chiếm suất. Phần này
// quyết định người mua thấy thẻ nào nên kiểm bằng số, không nhìn giao diện.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/*
 * Node chạy thẳng tệp TypeScript nhưng không hiểu đường dẫn `@/...` của
 * Next.js, nên chép hai tệp cần kiểm sang thư mục tạm và đổi đúng một dòng
 * nhập. Chép chứ không sửa nguồn, để bản kiểm không bao giờ chạy trên mã khác
 * với mã đang phục vụ.
 */
const scratch = mkdtempSync(join(tmpdir(), "vexim-band-"));
copyFileSync(new URL("../lib/sponsored/rotation.ts", import.meta.url), join(scratch, "rotation.ts"));
writeFileSync(join(scratch, "band.ts"), readFileSync(new URL("../lib/public/sponsored-band.ts", import.meta.url), "utf8")
  .replace('"../sponsored/rotation"', '"./rotation.ts"'));
const { pickSponsoredBand, withoutSponsoredBand } = await import(pathToFileURL(join(scratch, "band.ts")).href);

const MINUTE = 60_000;
const START = Date.parse("2026-10-20T00:00:00.000Z");
const now = START + 5 * MINUTE;

const product = (id) => ({ id, name: id, moq: "1 MT", price: null, leadTimeDays: null,
  supplierName: "N", supplierId: `sup-${id}`, supplierSlug: `sup-${id}`,
  imagePaths: [], cardImagePath: null, verificationSteps: [], province: "Đắk Lắk" });

const push = (over) => ({
  id: `p-${over.product_id}`,
  surface: "category",
  category_slug: "pepper",
  supplier_id: `sup-${over.product_id}`,
  product_id: over.product_id,
  status: "approved",
  starts_at: new Date(START - 60 * MINUTE).toISOString(),
  ends_at: new Date(START + 168 * 60 * MINUTE).toISOString(),
  price_amount: 2_500_000,
  price_currency: "VND",
  note: null,
  approved_by: null,
  approved_at: new Date(START - 60 * MINUTE).toISOString(),
  created_at: new Date(START - 60 * MINUTE).toISOString(),
  ...over,
});

const products = Array.from({ length: 8 }, (_, i) => product(`prod-${i + 1}`));
const pushes = products.slice(0, 6).map((p) => push({ product_id: p.id }));

/* ---------------- Đủ suất, đúng thứ tự luân phiên ---------------- */

const first = pickSponsoredBand({ pushes, products, slots: 3, surface: "category", categorySlug: "pepper", nowMs: now });
assert.equal(first.length, 3, "Phải lấp đủ ba suất khi có đủ gói");

const second = pickSponsoredBand({ pushes, products, slots: 3, surface: "category", categorySlug: "pepper", nowMs: now + 4 * MINUTE });
assert.deepEqual(second.map((b) => b.push.id), first.map((b) => b.push.id),
  "Trong cùng cửa sổ mười phút, hai lần dựng trang phải ra cùng một vùng đẩy");

const nextWindow = pickSponsoredBand({ pushes, products, slots: 3, surface: "category", categorySlug: "pepper", nowMs: now + 10 * MINUTE });
assert.notDeepEqual(nextWindow.map((b) => b.push.id), first.map((b) => b.push.id),
  "Sang cửa sổ sau, vùng đẩy phải đổi");

/* ---------------- Không trùng với lưới tự nhiên ---------------- */

for (const band of [first, nextWindow]) {
  const sponsoredIds = new Set(band.map((b) => b.product.id));
  assert.equal(sponsoredIds.size, band.length, "Mỗi sản phẩm chỉ được lên vùng đẩy một lần");
  const organic = withoutSponsoredBand(products, band);
  assert.equal(organic.length, products.length - band.length, "Không được mất hay nhân đôi sản phẩm");
  for (const item of organic) {
    assert.ok(!sponsoredIds.has(item.id), `Sản phẩm ${item.id} vừa ở vùng đẩy vừa ở lưới tự nhiên`);
  }
}

/* ---------------- Gói không dùng được thì bỏ qua ---------------- */

const mixed = [
  push({ product_id: "prod-1", status: "paused" }),
  push({ product_id: "prod-2", surface: "home" }),
  push({ product_id: "prod-3", category_slug: "cashew-kernels" }),
  push({ product_id: "prod-4", starts_at: new Date(START + 60 * MINUTE).toISOString() }),
  push({ product_id: "prod-5", ends_at: new Date(START - MINUTE).toISOString() }),
  push({ product_id: "prod-6" }),
];
const onlyLive = pickSponsoredBand({ pushes: mixed, products, slots: 3, surface: "category", categorySlug: "pepper", nowMs: now });
assert.deepEqual(onlyLive.map((b) => b.product.id), ["prod-6"], "Chỉ gói đã duyệt, đúng bề mặt, đúng danh mục, còn hạn mới được lên");

/* ---------------- Sản phẩm không còn công khai thì không chiếm suất ---------------- */

const withHidden = [
  push({ product_id: "prod-gone" }),
  push({ product_id: "prod-1" }),
  push({ product_id: "prod-2" }),
  push({ product_id: "prod-3" }),
];
const hidden = pickSponsoredBand({ pushes: withHidden, products, slots: 3, surface: "category", categorySlug: "pepper", nowMs: now });
assert.equal(hidden.length, 3, "Gói trỏ tới sản phẩm đã ẩn không được chiếm suất");
assert.ok(!hidden.some((b) => b.product.id === "prod-gone"));

/* ---------------- Danh mục rỗng hoặc không có gói ---------------- */

assert.equal(pickSponsoredBand({ pushes: [], products, slots: 3, surface: "category", categorySlug: "pepper", nowMs: now }).length, 0);
assert.equal(pickSponsoredBand({ pushes, products, slots: 0, surface: "category", categorySlug: "pepper", nowMs: now }).length, 0);
assert.equal(pickSponsoredBand({ pushes, products, slots: 3, surface: "category", categorySlug: null, nowMs: now }).length, 0,
  "Không có danh mục thì không chọn gói danh mục");

/* ---------------- Giao diện: vùng đẩy nằm trên lưới và ẩn khi đang lọc ---------------- */

const grid = readFileSync(new URL("../components/category-product-grid.tsx", import.meta.url), "utf8");
assert.match(grid, /!active && \(sponsoredBand\.length > 0/, "Đang lọc thì phải ẩn cả vùng đẩy");
assert.ok(grid.indexOf("<SponsoredProductBand") < grid.indexOf("grid grid-cols-2 items-stretch gap-3"),
  "Vùng đẩy phải nằm trên lưới tự nhiên");

// Vùng đẩy là suất cộng thêm: phải lấy thẻ ra khỏi danh sách TRƯỚC khi áp trần
// ba thẻ mỗi nhà cung cấp, nếu không gói sẽ ăn vào suất của chính nhà cung cấp đó.
assert.ok(grid.includes("withoutSponsoredBand(visible, sponsoredBand)"), "Danh sách dưới phải bỏ thẻ đã lên vùng đẩy");
assert.ok(grid.indexOf("withoutSponsoredBand(visible, sponsoredBand)") < grid.indexOf("arrangeSupplierProducts(listPool"),
  "Phải bỏ thẻ vùng đẩy trước khi áp trần mỗi nhà cung cấp");
assert.match(grid, /const supplierCap = /, "Trần mỗi nhà cung cấp phải là một biến dùng chung");
assert.match(grid, /in the list below/, "Dòng đếm phải nói rõ trần áp cho danh sách bên dưới");

const band = readFileSync(new URL("../components/sponsored-product-band.tsx", import.meta.url), "utf8");
assert.match(band, /Sponsored · Tài trợ/, "Nhãn phải có cả hai thứ tiếng và hiện sẵn, không cần trỏ chuột");
assert.match(band, /not a Vexim verification result/, "Nhãn phải nói rõ đây không phải kết quả xác minh");

console.log("✅ check-sponsored-band: ba suất, cùng cửa sổ thì cùng vùng đẩy, không trùng lưới, ẩn khi lọc, vùng đẩy là suất cộng thêm");
