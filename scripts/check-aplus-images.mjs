// node --experimental-strip-types --no-warnings scripts/check-aplus-images.mjs
// Ảnh A+ tối ưu: WebP ≤1600px + bản nhỏ 640px (cùng pipeline ảnh sản phẩm), ô nhỏ dùng bản nhỏ qua
// srcset/sizes, ảnh đơn giữ chỗ trước, cache ngắn + ETag như ảnh sản phẩm, chuyển ảnh cũ sang WebP.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";

const a = await import("../lib/products/aplus.ts");
const { prepareSupplierProductImage } = await import("../lib/media/prepare-supplier-product-image.ts");
const migrate = await import("./migrate-aplus-images-webp.mjs");
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function compile(path, mocks, log = console) {
  const exports = {};
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process, console: log, Uint8Array,
    require: (key) => {
      if (!(key in mocks)) throw new Error(`${path}: unexpected import ${key}`);
      return mocks[key];
    },
  }, { filename: path });
  return exports;
}

const sid = "11111111-1111-1111-1111-111111111111", pid = "22222222-2222-2222-2222-222222222222";
const uuid = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}`;
const webp = (n, product = pid) => `aplus/${sid}/${product}/${uuid(n)}.webp`;
const thumb = (n, product = pid) => `aplus/${sid}/${product}/${uuid(n)}-thumb.webp`;
const jpg = (n, product = pid) => `aplus/${sid}/${product}/${uuid(n)}.jpg`;

// 1. Đường dẫn: WebP có bản nhỏ cạnh bên; ảnh JPEG cũ không có. Nội dung A+ không bao giờ trỏ vào bản nhỏ.
assert.equal(a.aplusThumbPath(webp(3)), thumb(3));
assert.equal(a.aplusThumbPath(jpg(3)), null, "Ảnh cũ không có bản nhỏ");
assert.equal(a.aplusThumbPath(thumb(3)), null, "Bản nhỏ không có bản nhỏ");
assert.equal(a.aplusMainPath(thumb(3)), webp(3));
assert.equal(a.aplusMainPath(webp(3)), webp(3));
assert.deepEqual(a.aplusImageFiles(webp(3)), [webp(3), thumb(3)], "Chép/xoá luôn đi cả cặp");
assert.deepEqual(a.aplusImageFiles(jpg(3)), [jpg(3)]);
assert.equal(a.isAplusImagePath(thumb(3), sid, pid), false, "Nội dung chỉ lưu ảnh chính");
assert.equal(a.isAplusImageFile(webp(3), sid, pid), true);
assert.equal(a.isAplusImageFile(thumb(3), sid, pid), true, "Xem trước được bản nhỏ của đúng ảnh");
assert.equal(a.isAplusImageFile(jpg(3), sid, pid), true, "Ảnh cũ vẫn xem được");
assert.equal(a.isAplusImageFile(thumb(3, sid), sid, pid), false, "Bản nhỏ của sản phẩm khác bị từ chối");
assert.equal(a.isAplusImageFile(`${webp(3).slice(0, -5)}-thumb-thumb.webp`, sid, pid), false);
assert.equal(a.isAplusImageFile(jpg(3).replace(".jpg", "-thumb.jpg"), sid, pid), false);
assert.equal(a.isAplusImageFile(`../${thumb(3)}`, sid, pid), false);

// 2. Pipeline thật (sharp): ảnh 2400×1600 → WebP 1600×1067 + bản nhỏ 640×427, nhỏ hơn hẳn JPEG gốc.
const source = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 120, g: 80, b: 40 } } })
  .composite([{ input: Buffer.from(`<svg width="2400" height="1600"><circle cx="1200" cy="800" r="600" fill="#1d3a6b"/><text x="200" y="300" font-size="160" fill="#fff">Cashew W240</text></svg>`) }])
  .jpeg({ quality: 92 }).toBuffer();
const prepared = await prepareSupplierProductImage(new Uint8Array(source));
const mainMeta = await sharp(prepared.main).metadata();
const thumbMeta = await sharp(prepared.thumb).metadata();
assert.deepEqual([mainMeta.format, mainMeta.width, mainMeta.height], ["webp", 1600, 1067]);
assert.deepEqual([thumbMeta.format, thumbMeta.width, thumbMeta.height], ["webp", 640, 427]);
assert.ok(prepared.thumb.length < prepared.main.length, "Bản nhỏ nhẹ hơn ảnh chính");

// 3. storeAplusImage: ghi `<uuid>.webp` + `<uuid>-thumb.webp` đúng thư mục; tệp hỏng không ghi gì;
//    lỗi ghi bản nhỏ thì xoá ảnh chính (không để ảnh thiếu cặp); chép/xoá đi cả cặp.
function storeWith({ failPut } = {}) {
  const objects = new Map();
  const deleted = [];
  const store = compile("lib/products/aplus-image-store.ts", {
    "server-only": {},
    "node:crypto": { randomUUID: () => uuid(7) },
    "@/lib/media/prepare-supplier-product-image": { prepareSupplierProductImage },
    "@/lib/media/storage": {
      putObject: async (path, data, type) => {
        if (failPut?.(path)) throw new Error("storage down");
        objects.set(path, { data, type });
      },
      getObject: async (path) => objects.has(path) ? { data: objects.get(path).data } : null,
      deleteObject: async (path) => { deleted.push(path); objects.delete(path); },
    },
    "@/lib/products/aplus": a,
  }, { ...console, error: () => {} });
  return { store, objects, deleted };
}
{
  const { store, objects } = storeWith();
  const result = await store.storeAplusImage(`aplus/${sid}/${pid}/`, new Uint8Array(source));
  assert.deepEqual({ ...result }, { ok: true, path: webp(7) });
  assert.deepEqual([...objects.keys()], [webp(7), thumb(7)]);
  assert.equal(objects.get(webp(7)).type, "image/webp");
  assert.equal((await sharp(objects.get(thumb(7)).data).metadata()).width, 640);
  assert.equal(a.isAplusImagePath(result.path, sid, pid), true, "Đường dẫn trả về hợp lệ cho nội dung A+");

  const copied = await store.copyAplusImage(webp(7), webp(8, a.COMPANY_APLUS_ID));
  assert.equal(copied, true);
  assert.ok(objects.has(thumb(8, a.COMPANY_APLUS_ID)), "Chép ảnh chờ sang sản phẩm mang theo bản nhỏ");
  await store.deleteAplusImages([webp(7)]);
  assert.equal(objects.has(webp(7)) || objects.has(thumb(7)), false, "Xoá ảnh xoá luôn bản nhỏ");
}
{
  const { store, objects } = storeWith();
  const result = await store.storeAplusImage(`aplus/${sid}/${pid}`, new TextEncoder().encode("not an image"));
  assert.deepEqual({ ...result }, { ok: false, reason: "image" });
  assert.equal(objects.size, 0);
}
{
  const { store, objects, deleted } = storeWith({ failPut: (path) => path.endsWith("-thumb.webp") });
  const result = await store.storeAplusImage(`aplus/${sid}/${pid}`, new Uint8Array(source));
  assert.deepEqual({ ...result }, { ok: false, reason: "upload" });
  assert.equal(objects.size, 0);
  assert.deepEqual(deleted, [webp(7)]);
}

// 4. Mọi đường tải ảnh A+ (nhà cung cấp, doanh nghiệp, khu chờ, CRM, chuyển Showcase) dùng storeAplusImage;
//    mọi chỗ dọn ảnh dùng deleteAplusImages; xem trước chấp nhận bản nhỏ.
for (const file of [
  "app/api/supplier-portal/products/[id]/aplus/route.ts",
  "app/api/supplier-portal/company-aplus/route.ts",
  "app/api/supplier-portal/pending-media/route.ts",
  "lib/products/aplus-staff-upload.ts",
]) {
  const source = read(file);
  assert.match(source, /storeAplusImage\(/, `${file}: nén WebP + bản nhỏ ở máy chủ`);
  assert.doesNotMatch(source, /putObject\(/, `${file}: không lưu thẳng byte từ trình duyệt`);
  assert.match(source, /isAplusImageFile\(/, `${file}: xem trước được bản nhỏ`);
  assert.match(source, /webp: "image\/webp"/, `${file}: trả đúng loại WebP khi xem trước`);
}
assert.match(read("app/supplier/portal/storefront/company-aplus-actions.ts"), /storeAplusImage\(`aplus\//, "Chuyển Showcase cũ cũng ra WebP + bản nhỏ");
for (const file of [
  "app/supplier/portal/aplus-actions.ts",
  "app/supplier/portal/storefront/company-aplus-actions.ts",
  "app/crm/aplus-staff-actions.ts",
  "app/crm/products/[slug]/edit/aplus-actions.ts",
  "app/crm/suppliers/[slug]/company-aplus-actions.ts",
  "lib/supplier-portal/pending-media.ts",
]) {
  const source = read(file);
  assert.match(source, /deleteAplusImages\(/, `${file}: dọn cả bản nhỏ`);
  assert.doesNotMatch(source, /deleteObject\(/, `${file}: không xoá lẻ ảnh chính`);
}

// 5. Ảnh công khai: bản nhỏ chỉ mở khi ảnh chính của nó đang trong nội dung; A+ dùng cache ngắn + ETag.
const media = read("app/public-media/[...path]/route.ts");
assert.match(media, /\[a-f0-9-\]\{36\}\(\?:\\\.\(jpe\?g\|png\|webp\)\|-thumb\\\.webp\)\$/, "Chỉ nhận ảnh chính hoặc `-thumb.webp`");
assert.match(media, /const aplusContentPath = aplusImage \? aplusMainPath\(rel\) : rel;/);
assert.equal(media.match(/\)\.includes\(aplusContentPath\)/g)?.length, 2, "Cả A+ sản phẩm và doanh nghiệp đối chiếu ảnh chính");
assert.match(media, /const aclGated = isProductImage \|\| supplierImage \|\| showcaseImage \|\| aplusImage;/, "A+ không còn cache 7 ngày immutable");
assert.match(media, /"private, max-age=60, must-revalidate"/);

// 6. Trang người mua: ô nhỏ có srcset 640w/1600w + sizes; banner, ảnh đơn giữ ảnh lớn; ảnh cũ không srcset;
//    ảnh đơn giữ khung 16:9 trước khi ảnh tải.
const { ProductAplus, APLUS_IMAGE_SIZES } = compile("components/public/product-aplus.tsx", {
  "react": React,
  "react/jsx-runtime": require("react/jsx-runtime"),
  "@/components/brand/vexim-icons": { VeximIcon: () => null },
  "@/components/public/aplus-video": { AplusVideo: () => null },
  "@/lib/products/aplus": a,
});
const url = (path) => `/public-media/${path}`;
const html = renderToStaticMarkup(React.createElement(ProductAplus, {
  productName: "Cashew",
  modules: [
    { id: "m-1", type: "hero", image_path: webp(1), title: "Hero", body: "" },
    { id: "m-2", type: "image", image_path: webp(2), caption: "Yard" },
    { id: "m-3", type: "gallery", items: [{ image_path: webp(3), caption: "" }, { image_path: jpg(4), caption: "" }] },
    { id: "m-4", type: "steps", title: "Process", items: [{ image_path: webp(5), title: "Pick", body: "" }] },
    { id: "m-5", type: "image_text", image_path: webp(6), title: "Origin", body: "Dak Lak", image_side: "left" },
  ],
  imageUrl: url,
}));
const tagFor = (path) => html.match(new RegExp(`<img[^>]*src="${url(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`))?.[0] ?? "";
assert.ok(tagFor(webp(1)) && !/srcSet|srcset/.test(tagFor(webp(1))), "Banner luôn ảnh lớn");
assert.ok(tagFor(webp(2)) && !/srcset/i.test(tagFor(webp(2))), "Ảnh đơn tràn ngang dùng ảnh lớn");
assert.match(tagFor(webp(2)), /aspect-video/, "Ảnh đơn giữ chỗ 16:9, không nhảy trang");
for (const [n, sizes] of [[3, APLUS_IMAGE_SIZES.gallery], [5, APLUS_IMAGE_SIZES.steps], [6, APLUS_IMAGE_SIZES.half]]) {
  const tag = tagFor(webp(n));
  assert.match(tag, new RegExp(`srcSet="${url(thumb(n))} 640w, ${url(webp(n))} 1600w"`), `Ô nhỏ ${n} có bản 640px`);
  assert.ok(tag.includes(`sizes="${sizes}"`), `Ô nhỏ ${n} khai sizes`);
}
assert.ok(tagFor(jpg(4)) && !/srcset/i.test(tagFor(jpg(4))), "Ảnh JPEG cũ không có bản nhỏ thì không khai srcset");
assert.match(APLUS_IMAGE_SIZES.steps, /88px$/, "Điện thoại: ô bước 88px chọn bản 640px");
assert.match(read("components/products/aplus-editor.tsx"), /image: \{ css: "16 \/ 9", label: "16:9" \}/, "Trình soạn chọn vùng ảnh đơn theo đúng khung 16:9");

// 7. Script chuyển ảnh cũ: chỉ ảnh JPEG/PNG trong thư mục sản phẩm/doanh nghiệp, đổi đúng chuỗi đường dẫn.
assert.deepEqual(migrate.webpTargets(jpg(3)), { main: webp(3), thumb: thumb(3) });
assert.deepEqual(migrate.legacyAplusImages([jpg(3), webp(4), thumb(4), `aplus/${sid}/pending/${uuid(5)}.jpg`, jpg(6, a.COMPANY_APLUS_ID), `${jpg(7)}.bak`]),
  [jpg(3), jpg(6, a.COMPANY_APLUS_ID)], "Bỏ ảnh đã WebP, bản nhỏ và tệp chờ");
const content = [
  { id: "m-1", type: "image", image_path: jpg(3), caption: `See ${jpg(3)}` },
  { id: "m-2", type: "gallery", items: [{ image_path: jpg(6), caption: "" }, { image_path: webp(4), caption: "" }] },
];
const rewritten = migrate.rewriteAplusPaths(content, new Map([[jpg(3), webp(3)], [jpg(6), webp(6)]]));
assert.equal(rewritten.changed, 2);
assert.equal(rewritten.value[0].image_path, webp(3));
assert.equal(rewritten.value[0].caption, `See ${jpg(3)}`, "Không sửa chữ trong nội dung");
assert.equal(rewritten.value[1].items[0].image_path, webp(6));
assert.equal(rewritten.value[1].items[1].image_path, webp(4));
assert.equal(content[0].image_path, jpg(3), "Không sửa tại chỗ dữ liệu gốc");
assert.equal(a.validateAplusModules(rewritten.value, { supplierId: sid, productId: pid }).problem?.code === "imageRequired", false);
assert.equal(migrate.rewriteAplusPaths(rewritten.value, new Map([[jpg(3), webp(3)]])).changed, 0, "Chạy lại không đổi gì");

console.log("✅ Ảnh A+: WebP ≤1600px + bản nhỏ 640px ở máy chủ, ô nhỏ tải bản nhỏ, ảnh đơn giữ khung 16:9, cache ngắn + ETag như ảnh sản phẩm, script chuyển ảnh cũ.");
