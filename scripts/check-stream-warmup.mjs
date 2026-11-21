// node --experimental-strip-types --no-warnings scripts/check-stream-warmup.mjs
// Video Cloudflare Stream: kết nối sẵn lúc tải trang, nạp ngầm trình phát khi người mua có ý định
// bấm (rê chuột / chạm / focus), nhưng không tự phát và không tải trước đoạn video nào.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const aplus = await import("../lib/products/aplus.ts");

function load(dom, preconnects) {
  const out = ts.transpileModule(read("components/public/stream-warmup.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const mocks = {
    "react-dom": { preconnect: (href) => preconnects.push(href) },
    "@/lib/products/aplus": aplus,
  };
  vm.runInNewContext(out, {
    module, exports: module.exports, document: dom.window.document, window: dom.window, URLSearchParams,
    require: (id) => { assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id]; },
  });
  return module.exports;
}

const dom = new JSDOM("<!doctype html><body></body>");
const preconnects = [];
const warm = load(dom, preconnects);
const doc = dom.window.document;
const uid = "ab".repeat(16);
const frames = () => [...doc.querySelectorAll("iframe[data-stream-warmup]")];

// 1. Kết nối sẵn tới máy chủ Stream (trang iframe và nơi phát video/ảnh bìa).
warm.preconnectStream();
assert.deepEqual(preconnects, ["https://iframe.videodelivery.net", "https://videodelivery.net"]);

// 2. Có ý định bấm: một iframe ẩn, không autoplay, preload=none, không nhận focus.
const handlers = warm.streamIntentHandlers(uid);
assert.deepEqual(Object.keys(handlers).sort(), ["onFocus", "onPointerDown", "onPointerEnter"], "Rê chuột, chạm và bàn phím đều làm nóng");
handlers.onPointerEnter();
handlers.onPointerDown();
handlers.onFocus();
assert.equal(frames().length, 1, "Mỗi video chỉ làm nóng một lần");
const [frame] = frames();
assert.equal(frame.src, aplus.aplusVideoEmbedUrl(uid));
assert.match(frame.src, /preload=none/, "Không tải trước đoạn video");
assert.doesNotMatch(frame.src, /autoplay/, "Không tự phát");
assert.equal(frame.getAttribute("allow"), null, "Iframe làm nóng không được quyền autoplay");
assert.equal(frame.getAttribute("aria-hidden"), "true");
assert.equal(frame.tabIndex, -1);
assert.match(frame.style.cssText, /pointer-events: none/);

// 3. Giới hạn số video làm nóng mỗi trang.
for (const n of ["c1", "c2", "c3", "c4"]) warm.warmStreamPlayer(n.repeat(16));
assert.equal(frames().length, 3, "Tối đa 3 video mỗi trang");

// 4. Nạp xong thì iframe ẩn tự gỡ sau một lúc (trình phát đã nằm trong bộ nhớ đệm).
const timers = [];
dom.window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return 0; };
frame.dispatchEvent(new dom.window.Event("load"));
assert.equal(timers.length, 1);
assert.ok(timers[0].ms >= 5000, "Giữ đủ lâu để trình phát nạp xong");
timers[0].fn();
assert.ok(!frame.isConnected, "Iframe làm nóng được gỡ");

// 5. Gắn vào đúng chỗ: ảnh bìa video, ô video trong dãy ảnh và nút video ở trang nhà cung cấp.
const facade = read("components/public/aplus-video.tsx");
assert.match(facade, /preconnectStream\(\);/, "Trang có video thì kết nối sẵn");
assert.match(facade, /<button type="button" \{\.\.\.streamIntentHandlers\(uid\)\} onClick=\{\(\) => setPlaying\(true\)\}/);
assert.match(facade, /playing\s*\n?\s*\? <iframe/, "Iframe phát thật vẫn chỉ nạp khi bấm");
const gallery = read("components/product-media-gallery.tsx");
assert.match(gallery, /if \(streamVideo\) preconnectStream\(\);/);
assert.match(gallery, /\{\.\.\.streamIntentHandlers\(streamVideo\.uid\)\}/);
const hero = read("components/public/hero-video-button.tsx");
assert.match(hero, /preconnectStream\(\);/);
assert.match(hero, /\{\.\.\.streamIntentHandlers\(uid\)\} onClick=\{\(\) => setOpen\(true\)\}/);

console.log("✅ Stream warm-up: kết nối sẵn, nạp ngầm trình phát khi có ý định bấm, không tự phát, không tải trước video.");
