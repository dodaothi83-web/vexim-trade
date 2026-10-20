/**
 * Đọc EXIF tối thiểu (JPEG / WebP / TIFF) NGAY TRÊN SERVER để đối chứng ảnh gốc.
 *
 * Vì sao cần: ảnh gửi qua Zalo/Facebook/Messenger bị NÉN và XOÁ EXIF, nên
 * "còn EXIF" là tín hiệu mạnh cho thấy đây là ảnh gốc từ máy ảnh/điện thoại.
 * Ta chỉ đọc vài thẻ cần thiết: thời điểm chụp, GPS, hãng/máy, phần mềm đã ghi tệp.
 *
 * Không dùng thư viện ngoài: hàm này chạy được cả ở local store lẫn serverless,
 * và KHÔNG BAO GIỜ ném lỗi — ảnh không đọc được chỉ trả `null` từng phần.
 */

export interface ExifInfo {
  /** UTC ISO nếu đọc được DateTimeOriginal/DateTime + OffsetTime. */
  captured_at: string | null;
  /** Chuỗi gốc trong EXIF, ví dụ "2026:10:18 09:12:33" (giờ địa phương, không rõ múi). */
  captured_raw: string | null;
  /** Múi giờ gốc nếu ảnh có OffsetTimeOriginal, ví dụ "+07:00". */
  offset_raw: string | null;
  lat: number | null;
  lng: number | null;
  make: string | null;
  model: string | null;
  software: string | null;
  /** true khi tìm thấy khối EXIF (dù thiếu GPS). */
  has_exif: boolean;
}

const EMPTY: ExifInfo = {
  captured_at: null, captured_raw: null, offset_raw: null,
  lat: null, lng: null, make: null, model: null, software: null, has_exif: false,
};

/* ------------------------------ đọc TIFF/IFD ------------------------------ */

interface TiffReader {
  little: boolean;
  u16(offset: number): number | null;
  u32(offset: number): number | null;
  /** Giá trị rational (2 × u32) tại offset tuyệt đối. */
  rational(offset: number): number | null;
  ascii(offset: number, count: number): string | null;
}

function tiffReader(tiff: Uint8Array): TiffReader | null {
  if (tiff.length < 8) return null;
  const bom = String.fromCharCode(tiff[0], tiff[1]);
  const little = bom === "II";
  if (!little && bom !== "MM") return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => (o >= 0 && o + 2 <= tiff.length ? view.getUint16(o, little) : null);
  const u32 = (o: number) => (o >= 0 && o + 4 <= tiff.length ? view.getUint32(o, little) : null);
  if (u16(2) !== 42) return null;
  return {
    little,
    u16,
    u32,
    rational(o: number) {
      const num = u32(o);
      const den = u32(o + 4);
      if (num == null || den == null || den === 0) return null;
      return num / den;
    },
    ascii(o: number, count: number) {
      if (o < 0 || o + count > tiff.length) return null;
      let out = "";
      for (let i = 0; i < count; i += 1) {
        const byte = tiff[o + i];
        if (byte === 0) break;
        out += String.fromCharCode(byte);
      }
      const text = out.trim();
      return text || null;
    },
  };
}

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Offset tuyệt đối tới vùng chứa giá trị (đã xử lý ngưỡng 4 byte). */
  valueOffset: number;
  inline: number | null;
}

function readIfd(r: TiffReader, ifdOffset: number | null): { entries: Entry[]; next: number | null } {
  if (ifdOffset == null) return { entries: [], next: null };
  const count = r.u16(ifdOffset);
  if (count == null || count <= 0 || count > 200) return { entries: [], next: null };
  const entries: Entry[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = ifdOffset + 2 + i * 12;
    const tag = r.u16(base);
    const type = r.u16(base + 2);
    const cnt = r.u32(base + 4);
    if (tag == null || type == null || cnt == null || cnt === 0 || cnt > 4096) continue;
    const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const size = (sizes[type] ?? 1) * cnt;
    // Giá trị ≤ 4 byte nằm ngay trong ô; lớn hơn thì ô chứa offset.
    const valueOffset = size > 4 ? r.u32(base + 8) : base + 8;
    entries.push({ tag, type, count: cnt, valueOffset: valueOffset ?? base + 8, inline: size <= 4 ? r.u16(base + 8) : null });
  }
  return { entries, next: r.u32(ifdOffset + 2 + count * 12) };
}

function entryValue(r: TiffReader, e: Entry): number | null {
  if (e.type === 3) return r.u16(e.valueOffset);
  if (e.type === 4) return r.u32(e.valueOffset);
  if (e.type === 5) return r.rational(e.valueOffset);
  return e.inline;
}

/** toạ độ theo dạng 3 rational (độ, phút, giây). */
function dms(r: TiffReader, offset: number): number | null {
  const deg = r.rational(offset);
  const min = r.rational(offset + 8);
  const sec = r.rational(offset + 16);
  if (deg == null) return null;
  return deg + (min ?? 0) / 60 + (sec ?? 0) / 3600;
}

/** "2026:10:18 09:12:33" + "+07:00" → ISO UTC. Không có múi giờ thì coi như +07:00 (giờ VN). */
function toIso(raw: string | null, offset: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const zone = /^\+|-/.test(offset ?? "") ? offset! : "+07:00";
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function parseTiff(tiff: Uint8Array): ExifInfo {
  const r = tiffReader(tiff);
  if (!r) return { ...EMPTY };
  const root = readIfd(r, r.u32(4));
  let make: string | null = null;
  let model: string | null = null;
  let software: string | null = null;
  let capturedRaw: string | null = null;
  let offsetRaw: string | null = null;
  let gpsIfd: number | null = null;
  let exifIfd: number | null = null;

  for (const e of root.entries) {
    if (e.tag === 0x010f) make = r.ascii(e.valueOffset, e.count);
    else if (e.tag === 0x0110) model = r.ascii(e.valueOffset, e.count);
    else if (e.tag === 0x0131) software = r.ascii(e.valueOffset, e.count);
    else if (e.tag === 0x0132) capturedRaw = capturedRaw ?? r.ascii(e.valueOffset, e.count);
    else if (e.tag === 0x8769) exifIfd = r.u32(e.valueOffset);
    else if (e.tag === 0x8825) gpsIfd = r.u32(e.valueOffset);
  }
  if (exifIfd != null) {
    const sub = readIfd(r, exifIfd);
    for (const e of sub.entries) {
      if (e.tag === 0x9003) capturedRaw = r.ascii(e.valueOffset, e.count) ?? capturedRaw; // DateTimeOriginal
      else if (e.tag === 0x9011 || e.tag === 0x9010) offsetRaw = offsetRaw ?? r.ascii(e.valueOffset, e.count); // OffsetTimeOriginal
      else if (e.tag === 0x9011 && !offsetRaw) offsetRaw = r.ascii(e.valueOffset, e.count);
      else if (e.tag === 0xa002 || e.tag === 0xa003) { /* chiều rộng/cao: đã có từ ảnh đã xử lý */ }
    }
  }
  let lat: number | null = null;
  let lng: number | null = null;
  let gpsStamp: string | null = null;
  if (gpsIfd != null) {
    const gps = readIfd(r, gpsIfd);
    let latRef = "N";
    let lngRef = "E";
    for (const e of gps.entries) {
      if (e.tag === 0x0001) latRef = r.ascii(e.valueOffset, e.count) ?? "N";
      else if (e.tag === 0x0002) { const v = dms(r, e.valueOffset); if (v != null) lat = latRef === "S" ? -v : v; }
      else if (e.tag === 0x0003) lngRef = r.ascii(e.valueOffset, e.count) ?? "E";
      else if (e.tag === 0x0004) { const v = dms(r, e.valueOffset); if (v != null) lng = lngRef === "W" ? -v : v; }
      else if (e.tag === 0x0007) {
        const h = r.rational(e.valueOffset); const m = r.rational(e.valueOffset + 8); const s = r.rational(e.valueOffset + 16);
        if (h != null && m != null && s != null) {
          gpsStamp = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor(m)).padStart(2, "0")}:${String(Math.floor(s)).padStart(2, "0")}`;
        }
      }
    }
    // Chỉ có GPSDateStamp + giờ UTC: dựng ISO khi thiếu DateTimeOriginal.
    if (!capturedRaw && gpsStamp) {
      const dateEntry = gps.entries.find((e) => e.tag === 0x001d);
      const dateRaw = dateEntry ? r.ascii(dateEntry.valueOffset, dateEntry.count) : null;
      if (dateRaw && /^\d{4}:\d{2}:\d{2}$/.test(dateRaw)) capturedRaw = `${dateRaw} ${gpsStamp}`;
    }
  }
  if (lat != null && (lat < -90 || lat > 90)) lat = null;
  if (lng != null && (lng < -180 || lng > 180)) lng = null;
  return {
    has_exif: true,
    captured_raw: capturedRaw,
    offset_raw: offsetRaw,
    captured_at: toIso(capturedRaw, offsetRaw),
    lat, lng, make, model, software,
  };
}

/* ------------------------------ tách khối EXIF ------------------------------ */

/** JPEG: quét các segment APPn tìm APP1 "Exif\0\0". */
function jpegExif(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1];
    // Các marker không có payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    const size = (bytes[i + 2] << 8) | bytes[i + 3];
    if (size < 2 || i + 2 + size > bytes.length) break;
    if (marker === 0xe1) {
      const body = bytes.subarray(i + 4, i + 2 + size);
      if (body.length > 6 && body[0] === 0x45 && body[1] === 0x78 && body[2] === 0x69 && body[3] === 0x66 && body[4] === 0 && body[5] === 0) {
        return body.subarray(6);
      }
    }
    if (marker === 0xda) break; // vào dữ liệu ảnh thì dừng
    i += 2 + size;
  }
  return null;
}

/** WebP: EXIF nằm trong chunk "EXIF" (RIFF mở rộng). */
function webpExif(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 16) return null;
  const fourcc = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (fourcc(0) !== "RIFF" || fourcc(8) !== "WEBP") return null;
  let i = 12;
  while (i + 8 <= bytes.length) {
    const id = fourcc(i);
    const size = bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
    const bodyStart = i + 8;
    if (size < 0 || bodyStart + size > bytes.length) break;
    if (id === "EXIF") {
      let body = bytes.subarray(bodyStart, bodyStart + size);
      // Một số encoder thêm prefix "Exif\0\0".
      if (body.length > 6 && body[0] === 0x45 && body[1] === 0x78 && body[2] === 0x69 && body[3] === 0x66) body = body.subarray(6);
      return body;
    }
    i = bodyStart + size + (size % 2);
  }
  return null;
}

/** Đọc EXIF từ bytes gốc. Ảnh PNG không có EXIF chuẩn → trả về rỗng (không ném lỗi). */
export function parseExif(bytes: Uint8Array): ExifInfo {
  try {
    const block = jpegExif(bytes) ?? webpExif(bytes);
    if (!block || block.length < 8) return { ...EMPTY };
    return parseTiff(block);
  } catch {
    return { ...EMPTY };
  }
}

/** Phần mềm ghi tệp cho thấy ảnh đã qua chỉnh sửa hoặc qua ứng dụng chat/MXH. */
const EDITORS = ["photoshop", "lightroom", "gimp", "snapseed", "picsart", "canva", "affinity", "darktable", "rawtherapee", "meitu", "vSCO", "after effects", "illustrator", "pixelmator", "luminar"];
const MESSENGERS = ["whatsapp", "zalo", "facebook", "messenger", "instagram", "telegram", "viber", "line", "wechat", "skype", "signal", "twitter", "tiktok", "snapchat"];

export type SoftwareSignal = "editor" | "messenger" | null;

export function softwareSignal(software: string | null): SoftwareSignal {
  const text = (software ?? "").toLowerCase();
  if (!text) return null;
  if (EDITORS.some((n) => text.includes(n))) return "editor";
  if (MESSENGERS.some((n) => text.includes(n))) return "messenger";
  return null;
}

/** Khoảng cách Haversine (mét) giữa hai toạ độ; null khi thiếu một trong hai. */
export function distanceMeters(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6_371_000;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
