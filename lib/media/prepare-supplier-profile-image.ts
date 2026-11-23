import sharp from "sharp";

/**
 * Ảnh đại diện/logo và ảnh bìa nhà cung cấp: xoay đúng chiều theo EXIF, bỏ metadata (vị trí GPS…),
 * thu nhỏ vừa khung hiển thị rồi lưu WebP. Giữ nền trong suốt của logo PNG.
 * Chỉ dùng cho ảnh hồ sơ công khai; không áp dụng cho giấy tờ hay bằng chứng xác minh.
 */
const SIZE = {
  // Ảnh đại diện hiển thị tối đa khoảng 160px; 800px đủ nét trên màn hình mật độ cao.
  profile: { width: 800, height: 800, quality: 82 },
  // Ảnh bìa tỉ lệ 3:1, rộng tối đa khoảng 1280px trên trang hồ sơ.
  cover: { width: 2400, height: 1200, quality: 80 },
} as const;

export async function prepareSupplierProfileImage(bytes: Uint8Array, kind: "profile" | "cover"): Promise<{
  data: Uint8Array;
  width: number;
  height: number;
}> {
  const size = SIZE[kind];
  const out = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" })
    .rotate()
    .resize({ width: size.width, height: size.height, fit: "inside", withoutEnlargement: true })
    .webp({ quality: size.quality, effort: 4, alphaQuality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(out.data), width: out.info.width, height: out.info.height };
}
