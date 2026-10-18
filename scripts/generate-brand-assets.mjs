import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// The supplied logo-vexim-white.jpg is a white-on-white JPEG (no alpha). Extract its
// actual artwork once, so headers don't display an opaque white square or tiny mark
// surrounded by the large margins of the 1024px source. Never use the old logo here.
const source = new URL("../public/logo-vexim-white.jpg", import.meta.url);
const { data, info } = await sharp(source.pathname).raw().toBuffer({ resolveWithObject: true });
if (info.width !== 1024 || info.height !== 1024 || info.channels !== 3) {
  throw new Error("Unexpected logo-vexim-white.jpg dimensions or format; review the crop before regenerating.");
}

function artwork({ left, top, width, height }) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const input = ((y + top) * info.width + x + left) * info.channels;
      const output = (y * width + x) * 4;
      const luminance = (data[input] + data[input + 1] + data[input + 2]) / 3;
      pixels[output] = pixels[output + 1] = pixels[output + 2] = 255;
      // Amplify the very pale artwork while ignoring near-white JPEG noise.
      pixels[output + 3] = Math.max(0, Math.min(255, Math.round((254 - luminance) * 38)));
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const wordmark = await artwork({ left: 140, top: 190, width: 755, height: 565 });
const mark = await artwork({ left: 280, top: 190, width: 485, height: 315 });
const markSquare = await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
}).composite([{ input: mark, gravity: "centre" }]).png().toBuffer();
const icon = await sharp({
  create: { width: 192, height: 192, channels: 4, background: "#102349" },
}).composite([{ input: await sharp(markSquare).resize(172, 172).toBuffer(), gravity: "centre" }]).png().toBuffer();

for (const [relative, contents] of [
  ["../public/logo-vexim-white-wordmark.png", wordmark],
  ["../public/logo-vexim-white-mark.png", markSquare],
  ["../app/icon.png", icon],
]) {
  const url = new URL(relative, import.meta.url);
  if (process.argv.includes("--check")) {
    const current = await readFile(url).catch(() => null);
    if (!current?.equals(contents)) throw new Error(`${relative} is out of date; run npm run brand:assets`);
  } else {
    await writeFile(url, contents);
  }
}
console.log("Brand assets generated from public/logo-vexim-white.jpg");
