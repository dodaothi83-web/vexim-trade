// node --experimental-strip-types --no-warnings scripts/check-company-aplus.mjs
// A+ doanh nghiệp trên trang nhà cung cấp (gói có trang cao cấp), chủ sàn chốt 2026-11-20.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const a = await import("../lib/products/aplus.ts");
const T = await import("../lib/products/aplus-templates.ts");
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const sid = "11111111-1111-1111-1111-111111111111", other = "33333333-3333-3333-3333-333333333333";
const ctx = { supplierId: sid, productId: a.COMPANY_APLUS_ID };
const img = (owner = sid, folder = "company") => `aplus/${owner}/${folder}/${"7".repeat(8)}-7777-7777-7777-${"7".repeat(12)}.jpg`;

// 1. Cùng khối A+ với sản phẩm; ảnh phải nằm trong thư mục A+ doanh nghiệp của đúng nhà cung cấp.
assert.equal(a.COMPANY_APLUS_ID, "company");
const hero = { id: "m-hero0001", type: "hero", image_path: img(), alt: "Factory", eyebrow: "", headline: "Cashew processing since 2009", sub: "" };
assert.equal(a.validateAplusModules([hero], ctx).ok, true);
assert.equal(a.validateAplusModules([{ ...hero, image_path: img(other) }], ctx).ok, false, "Không dùng ảnh của nhà cung cấp khác");
assert.equal(a.validateAplusModules([{ ...hero, image_path: img(sid, "22222222-2222-2222-2222-222222222222") }], ctx).ok, false, "Không dùng ảnh A+ sản phẩm");
assert.equal(a.validateAplusModules([{ ...hero, headline: "Call 0912 345 678" }], ctx).problem.code, "contact");

// 2. Bộ mẫu theo loại hình doanh nghiệp, chữ để trống, có gợi ý ở cả hai ngôn ngữ.
assert.deepEqual([...T.APLUS_COMPANY_TEMPLATE_IDS], ["factory", "cooperative", "trading", "company"]);
for (const id of T.APLUS_COMPANY_TEMPLATE_IDS) {
  const built = T.buildAplusTemplate(id, (() => { let n = 0; return () => `t-${String(++n).padStart(8, "0")}`; })());
  assert.ok(built.length >= 4 && built.length <= a.APLUS_MAX_MODULES);
  assert.ok(built.every((m) => a.aplusModuleText(m).every((t) => t === "")), `Bộ mẫu ${id} không điền nội dung giả`);
  const i18n = read("lib/i18n/portal/aplus.ts");
  const hints = [...i18n.matchAll(new RegExp(`${id}: \\{ name: "[^"]+", desc: "[^"]+", hints: \\[([\\s\\S]*?)\\] \\}`, "g"))];
  assert.equal(hints.length, 2, `Gợi ý ${id} có cả tiếng Việt và tiếng Anh`);
  for (const h of hints) assert.equal((h[1].match(/^\s+"/gm) ?? []).length, built.length, `Mỗi khối của ${id} có một gợi ý`);
}

// 3. Cột dữ liệu, giới hạn 10 khối; không đụng bảng xác minh.
const migration = read("supabase/migrations/20261210_supplier_company_aplus.sql");
assert.match(migration, /add column if not exists company_aplus jsonb not null default '\[\]'::jsonb/);
assert.match(migration, /jsonb_array_length\(company_aplus\) <= 10/);
assert.doesNotMatch(migration, /verification|certificate/i);

// 4. Máy chủ: quyền gói từ phiên, dịch khi lưu, video đúng nhà cung cấp, xoá tệp bị bỏ.
const actions = read("app/supplier/portal/storefront/company-aplus-actions.ts");
assert.match(actions, /supplierPortalAccess\(\)/);
assert.match(actions, /\.premiumStorefront\) return \{ m, error:/, "Chỉ gói có trang cao cấp");
assert.match(actions, /prepareAplusForSave\(modules, ctx/, "Viết tiếng Việt, dịch khi lưu như A+ sản phẩm");
assert.match(actions, /verifyAplusVideos\(checked\.modules, before, ctx\)/, "Video kiểm tra bằng hàm dùng chung");
assert.match(read("lib/products/aplus-video-verify.ts"), /video\?\.meta\.purpose !== "company" \|\| video\?\.meta\.supplier_id !== ctx\.supplierId/, "Video mới phải đúng nhà cung cấp");
assert.match(actions, /updateSupplier\(access\.supplier\.id, \{ company_aplus: verified\.modules \}\)/);
assert.match(actions, /deleteObject/);
const upload = read("app/api/supplier-portal/company-aplus/route.ts");
assert.match(upload, /\.premiumStorefront\) return fail/);
assert.match(upload, /aplus\/\$\{access\.supplier\.id\}\/\$\{COMPANY_APLUS_ID\}\//);
assert.match(upload, /purpose: "company"/);
assert.match(read("lib/media/cloudflare-stream.ts"), /purpose: "company", supplier_id: input\.supplierId/);

// 5. Trang công khai: dưới About, chỉ gói cao cấp; ảnh chỉ công khai khi đang dùng và gói còn quyền.
const storefront = read("components/public/supplier-storefront.tsx");
assert.match(storefront, /const companyAplus = premium \? readAplusModules\(s\.company_aplus/);
assert.match(storefront, /const showcase = premium && !companyAplus\.length/, "Có A+ thì không hiện Showcase cũ");
assert.ok(storefront.indexOf('id="about"') < storefront.indexOf('id="capabilities"') && storefront.indexOf('id="capabilities"') < storefront.indexOf('id="verification"'),
  "A+ doanh nghiệp nằm giữa About và Supplier checks");
assert.match(storefront, /It is not evidence of a Vexim check/);
const media = read("app/public-media/[...path]/route.ts");
assert.match(media, /rel\.split\("\/"\)\[2\] === COMPANY_APLUS_ID/);
assert.match(media, /premiumStorefront \|\|\s*\n?\s*!aplusImagePaths\(readAplusModules\(supplier\.company_aplus/);

// 6. Cổng nhà cung cấp và CRM.
const workspace = read("app/supplier/portal/storefront/company/workspace.tsx");
assert.match(workspace, /templateIds=\{APLUS_COMPANY_TEMPLATE_IDS\}/);
assert.match(workspace, /migrateShowcaseToCompanyAplusAction/, "Chuyển khối Showcase cũ, không mất nội dung");
assert.match(read("app/supplier/portal/storefront/page.tsx"), /<StorefrontDesignHub[\s\S]*aplusCount=/);
assert.match(read("app/supplier/portal/storefront/design-hub.tsx"), /href="\/supplier\/portal\/storefront\/company"/, "Khu Thiết kế trang mở trang soạn A+ doanh nghiệp");
assert.match(read("components/products/aplus-editor.tsx"), /standalone && <button/);
assert.match(read("app/crm/suppliers/[slug]/company-aplus-actions.ts"), /guard\("suppliers\.manage"\)/);
assert.match(read("app/crm/suppliers/[slug]/company-aplus-review.tsx"), /Bản tiếng Việt/);
console.log("✅ A+ doanh nghiệp: cùng khối và luồng dịch với A+ sản phẩm, ảnh đúng nhà cung cấp, chỉ gói cao cấp, dưới About, chuyển Showcase cũ, CRM gỡ được.");
