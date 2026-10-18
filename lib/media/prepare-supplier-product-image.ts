import sharp from "sharp";

/** Only product photos use lossy derivatives. Never transform certificates or audit evidence. */
export async function prepareSupplierProductImage(bytes: Uint8Array): Promise<{
  main: Uint8Array;
  thumb: Uint8Array;
  width: number;
  height: number;
}> {
  // Limit decoded pixels as well as request bytes; strip EXIF/metadata by default.
  const main = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: "error" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(main.data)
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70, effort: 4 })
    .toBuffer();
  return {
    main: new Uint8Array(main.data),
    thumb: new Uint8Array(thumb),
    width: main.info.width,
    height: main.info.height,
  };
}
