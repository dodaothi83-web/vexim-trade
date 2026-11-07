import {
  displayUnitsForCategory,
  formatUnitRange,
  fromPricePerKg,
  parsePriceUnit,
  toPricePerKg,
  type PriceUnit,
} from "@/lib/public/price-units";

/**
 * Khoảng giá tham khảo tính từ giá nhà cung cấp tự công bố.
 *
 * Đây là phần thay thế cho việc để buyer tự ghép giá từ từng thẻ sản phẩm, và
 * cũng là thứ không được phép làm ẩu. Năm luật cứng:
 *
 *   1. Dưới 3 niêm yết thì không công bố khoảng giá.
 *   2. Niêm yết cũ hơn 90 ngày thì ẩn; cũ hơn 45 ngày thì vẫn hiện nhưng ghi rõ.
 *   3. Không gộp đơn vị khác nhau, không đoán đơn vị. Đơn vị không đọc được thì
 *      loại khỏi phép tính thay vì coi như kg.
 *   4. Khoảng hiển thị lấy từ min/max SAU KHI loại niêm yết lệch quá xa trung vị
 *      (giá mồi câu khách hoặc nhập sai). Một niêm yết như vậy một mình kéo lệch
 *      cả khoảng nếu dùng min/max thô — xem `buildPriceRange` để biết ngưỡng.
 *   5. Dưới `minDistinctSuppliers` nhà cung cấp khác nhau (khi caller có đặt
 *      ngưỡng này) thì không công bố, dù đủ niêm yết: dữ liệu giai đoạn đầu phần
 *      lớn do nhân viên nhập tay, một NCC có thể vô tình (hoặc cố ý) niêm yết
 *      cùng một giá ở nhiều dòng quy cách — nhiều niêm yết không có nghĩa là
 *      nhiều nguồn độc lập.
 *
 * Những con số này là giá tham khảo của nhà cung cấp, không phải giá chào bán
 * ràng buộc, và không phải chỉ số thị trường.
 */

export type PricePoint = {
  /** Giá trị như nhà cung cấp nhập, theo đơn vị của chính họ. */
  value: number;
  /** Giá trần tùy chọn khi dòng grade khai báo khoảng giá (từ - đến). */
  highValue?: number | null;
  /** Đơn vị dạng chữ tự do: "MT", "kg", "USD/kg". */
  unit?: string | null;
  currency?: string | null;
  /** Ngày giá được cập nhật (ISO). Thiếu thì coi là cũ. */
  updatedAt?: string | null;
  /** Bỏ qua khi tính khoảng giá, ví dụ hồ sơ demo. */
  exclude?: boolean;
  /** Nhà cung cấp đứng sau niêm yết này, dùng để yêu cầu đủ số NCC khác nhau. */
  supplierId?: string | null;
};

export type PriceRangeOptions = {
  /** Đơn vị hiển thị chính. Mặc định lấy theo quy ước thị trường của danh mục. */
  unit?: PriceUnit;
  secondaryUnit?: PriceUnit;
  now?: Date;
  minSamples?: number;
  /** Quá số ngày này thì vẫn hiện nhưng gắn nhãn dữ liệu cũ. */
  staleAfterDays?: number;
  /** Quá số ngày này thì ẩn hẳn con số. */
  hideAfterDays?: number;
  /**
   * Biên an toàn quanh trung vị: niêm yết có giá đại diện (trung bình giá thấp/cao
   * của chính nó) nhỏ hơn trung vị / hệ số này, hoặc lớn hơn trung vị × hệ số này,
   * bị loại khỏi phép tính min/max. Mặc định 3 lần — đủ rộng để không loại nhầm
   * biến động thật do quy cách/chế biến/điều kiện giao hàng, nhưng đủ chặt để loại
   * giá mồi hoặc nhập sai lệch cả chục lần.
   */
  outlierBandFactor?: number;
  /**
   * Số nhà cung cấp khác nhau tối thiểu phải có trong mẫu (sau khi đã loại giá
   * mồi) thì mới công bố khoảng giá. Lý do: dữ liệu giai đoạn đầu phần lớn do
   * nhân viên nhập tay từ Alibaba, một NCC lỡ niêm yết cùng một giá teaser ở
   * nhiều dòng quy cách khác nhau đủ sức làm khoảng giá trông như "giá thị
   * trường" trong khi thực ra chỉ là một nguồn duy nhất. Không đặt thì không
   * giới hạn (giữ hành vi cũ).
   */
  minDistinctSuppliers?: number;
};

export type PriceRangeResult = {
  unit: PriceUnit;
  low: number;
  high: number;
  median: number;
  sampleSize: number;
  /** Số niêm yết bị loại vì lệch quá xa trung vị (xem `outlierBandFactor`). */
  excludedOutliers: number;
  /** Ngày cập nhật gần nhất trong số mẫu được dùng. */
  lastUpdated: string | null;
  /** Dữ liệu cũ hơn ngưỡng cảnh báo nhưng chưa tới ngưỡng ẩn. */
  stale: boolean;
  /** Khoảng quy đổi sang đơn vị thứ hai, chỉ khi thị trường đọc song song hai đơn vị. */
  secondary?: { unit: PriceUnit; low: number; high: number };
  /** Quy cách của dòng này, khi khoảng giá được tách theo quy cách. */
  grade?: string;
  /** Câu hiển thị sẵn, ví dụ "$7.6–8.4/kg" (xem lib/products/price-display.ts). */
  lowText: string;
  highText: string;
  rangeText: string;
};

export type PriceRangeOutcome =
  | { status: "ok"; range: PriceRangeResult }
  | { status: "too_few"; usable: number; needed: number }
  /** Đủ niêm yết nhưng đến từ quá ít nhà cung cấp khác nhau (xem `minDistinctSuppliers`). */
  | { status: "too_few_suppliers"; usable: number; distinctSuppliers: number; neededSuppliers: number }
  | { status: "none" };

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400_000);
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Tính khoảng giá. Không ném lỗi với dữ liệu bẩn: mẫu không dùng được thì bỏ,
 * và trả về lý do để giao diện nói đúng chuyện gì đang xảy ra.
 */
export function buildPriceRange(
  points: PricePoint[] | null | undefined,
  options: PriceRangeOptions = {},
): PriceRangeOutcome {
  const now = options.now ?? new Date();
  const minSamples = options.minSamples ?? 3;
  const staleAfterDays = options.staleAfterDays ?? 45;
  const hideAfterDays = options.hideAfterDays ?? 90;
  const unit = options.unit ?? "kg";

  const usable: Array<{ lowKg: number; highKg: number; midKg: number; updatedAt: Date | null; supplierId: string | null }> = [];
  for (const point of Array.isArray(points) ? points : []) {
    if (!point || point.exclude) continue;
    if ((point.currency ?? "USD").toUpperCase() !== "USD") continue;
    const parsedUnit = parsePriceUnit(point.unit, point.currency);
    const lowKg = toPricePerKg(point.value, parsedUnit);
    if (lowKg === null) continue;
    const rawHigh = point.highValue != null && Number.isFinite(point.highValue) && point.highValue >= point.value
      ? toPricePerKg(point.highValue, parsedUnit)
      : null;
    const highKg = rawHigh !== null && rawHigh >= lowKg ? rawHigh : lowKg;
    const updatedAt = point.updatedAt ? new Date(point.updatedAt) : null;
    const valid = updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt : null;
    // Ngày không đọc được thì coi như cũ nhất, để không lỡ tay công bố giá mồ côi ngày.
    if (!valid) continue;
    const age = daysBetween(now, valid);
    if (age > hideAfterDays) continue;
    usable.push({ lowKg, highKg, midKg: (lowKg + highKg) / 2, updatedAt: valid, supplierId: point.supplierId ?? null });
  }

  if (usable.length === 0) return { status: "none" };
  if (usable.length < minSamples) return { status: "too_few", usable: usable.length, needed: minSamples };

  /*
   * Loại giá mồi trước khi lấy khoảng: tính trung vị trên toàn bộ mẫu, rồi loại
   * niêm yết có giá đại diện lệch quá xa trung vị (dưới 1/outlierBandFactor hoặc
   * trên outlierBandFactor lần). min/max thô để lọt một niêm yết như vậy là đủ để
   * kéo lệch cả khoảng công bố, dù các niêm yết còn lại đều quanh một mức hợp lý.
   *
   * Chỉ loại khi sau khi loại vẫn còn đủ mẫu tối thiểu — một danh mục biến động
   * thật (vd lẫn hàng thô và hàng đã chế biến) thì thà hiện khoảng rộng còn hơn
   * lặng lẽ thu hẹp xuống dưới ngưỡng công bố.
   */
  const outlierBand = options.outlierBandFactor ?? 3;
  const pivotMedian = median(usable.map((u) => u.midKg).sort((a, b) => a - b));
  const withinBand = usable.filter((u) => u.midKg >= pivotMedian / outlierBand && u.midKg <= pivotMedian * outlierBand);
  const filtered = withinBand.length >= minSamples ? withinBand : usable;
  const excludedOutliers = usable.length - filtered.length;

  /*
   * Đếm số nhà cung cấp khác nhau trong mẫu còn lại sau khi lọc giá mồi. Một
   * NCC niêm yết lặp một mức giá ở nhiều sản phẩm trong cùng quy cách không
   * phải là nhiều bằng chứng độc lập — nó vẫn chỉ là một nguồn. `null`/thiếu
   * supplierId thì mỗi niêm yết được coi là một nguồn riêng (không đủ dữ liệu
   * để gộp, thà đếm rộng rãi còn hơn chặn nhầm).
   */
  if (options.minDistinctSuppliers != null) {
    const distinctSuppliers = new Set(
      filtered.map((u, idx) => u.supplierId ?? `__point_${idx}`),
    ).size;
    if (distinctSuppliers < options.minDistinctSuppliers) {
      return {
        status: "too_few_suppliers",
        usable: filtered.length,
        distinctSuppliers,
        neededSuppliers: options.minDistinctSuppliers,
      };
    }
  }

  const lowValues = filtered.map((u) => u.lowKg).sort((a, b) => a - b);
  const highValues = filtered.map((u) => u.highKg).sort((a, b) => a - b);
  const midValues = filtered.map((u) => u.midKg).sort((a, b) => a - b);
  const lowKg = lowValues[0];
  const highKg = highValues[highValues.length - 1];
  const medianKg = median(midValues);

  const latest = filtered.reduce<Date>((acc, item) => (item.updatedAt! > acc ? item.updatedAt! : acc), filtered[0].updatedAt!);
  const age = daysBetween(now, latest);

  const low = fromPricePerKg(lowKg, unit);
  const high = fromPricePerKg(highKg, unit);
  const roundedLow = round(low, unit);
  const roundedHigh = round(high, unit);

  const secondaryUnit = options.secondaryUnit;
  const secondary = secondaryUnit
    ? { unit: secondaryUnit, low: round(fromPricePerKg(lowKg, secondaryUnit), secondaryUnit), high: round(fromPricePerKg(highKg, secondaryUnit), secondaryUnit) }
    : undefined;

  return {
    status: "ok",
    range: {
      unit,
      low: roundedLow,
      high: roundedHigh,
      median: round(fromPricePerKg(medianKg, unit), unit),
      sampleSize: filtered.length,
      excludedOutliers,
      lastUpdated: latest.toISOString().slice(0, 10),
      stale: age > staleAfterDays,
      secondary,
      lowText: formatUnitRange(roundedLow, roundedLow, unit),
      highText: formatUnitRange(roundedHigh, roundedHigh, unit),
      rangeText: formatUnitRange(roundedLow, roundedHigh, unit),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tách theo quy cách                                                   */
/* ------------------------------------------------------------------ */

export type GradePricePoint = PricePoint & {
  /** Quy cách, ví dụ W320. Null nghĩa là sản phẩm không nêu quy cách. */
  grade?: string | null;
};

export type PriceBlockOutcome =
  | {
      status: "ok";
      /** Mỗi quy cách một dòng, xếp theo số niêm yết giảm dần. */
      rows: PriceRangeResult[];
      /** Số niêm yết không nêu quy cách nên không được xếp vào dòng nào. */
      unclassified: number;
      /** Tổng số niêm yết bị loại vì lệch quá xa trung vị, cộng dồn các dòng. */
      excludedOutliers: number;
      /**
       * Quy cách có niêm yết nhưng chưa đủ mẫu. Giao diện nêu tên ra, vì nếu chỉ
       * hiện những dòng đủ mẫu thì người đọc tưởng danh mục chỉ có ngần ấy giá.
       */
      thin: string[];
      /**
       * Quy cách có đủ niêm yết nhưng đến từ quá ít nhà cung cấp khác nhau (xem
       * `minDistinctSuppliers`) nên vẫn bị giữ lại, không công bố khoảng giá.
       */
      pendingSuppliers: string[];
    }
  | { status: "too_few"; usable: number; needed: number }
  | { status: "too_few_suppliers"; usable: number; distinctSuppliers: number; neededSuppliers: number }
  | { status: "none" };

/**
 * Khoảng giá tách theo quy cách.
 *
 * Lý do phải tách: W180 và W320 chênh nhau khoảng 25 phần trăm, gộp vào một
 * khoảng thì khoảng đó đúng về số học nhưng vô nghĩa với người mua. Nhưng tách
 * cũng có cái giá của nó: ba niêm yết chia cho ba quy cách thì không quy cách nào
 * đủ mẫu, và nếu tách cứng thì cả khối biến mất.
 *
 * Cách xử lý:
 *   - Không quy cách nào nhận diện được (ngành chưa có bộ quy cách): giữ một
 *     khoảng chung như trước, vì lúc đó "quy cách" không phải khái niệm của ngành.
 *   - Có quy cách: chỉ hiện những quy cách đủ mẫu. Không quy cách nào đủ thì trả
 *     too_few để giao diện nói rõ là thiếu mẫu theo từng quy cách, thay vì âm
 *     thầm gộp lại thành một khoảng sai.
 */
export function buildPriceBlock(points: GradePricePoint[] | null | undefined, options: PriceRangeOptions = {}): PriceBlockOutcome {
  const list = Array.isArray(points) ? points : [];
  const groups = new Map<string, GradePricePoint[]>();
  const ungraded: GradePricePoint[] = [];

  for (const point of list) {
    const grade = typeof point.grade === "string" ? point.grade.trim().toUpperCase() : "";
    if (!grade) {
      ungraded.push(point);
      continue;
    }
    const group = groups.get(grade) ?? [];
    group.push(point);
    groups.set(grade, group);
  }

  // Ngành chưa khai báo quy cách: giữ nguyên hành vi một khoảng chung.
  if (groups.size === 0) {
    const single = buildPriceRange(list, options);
    if (single.status === "ok")
      return { status: "ok", rows: [single.range], unclassified: 0, excludedOutliers: single.range.excludedOutliers, thin: [], pendingSuppliers: [] };
    return single;
  }

  const rows: PriceRangeResult[] = [];
  const thin: string[] = [];
  const pendingSuppliers: string[] = [];
  let bestUsable = 0;
  let bestSupplierUsable = 0;
  let bestDistinctSuppliers = 0;
  for (const [grade, group] of groups) {
    const outcome = buildPriceRange(group, options);
    if (outcome.status === "ok") rows.push({ ...outcome.range, grade });
    else if (outcome.status === "too_few") {
      bestUsable = Math.max(bestUsable, outcome.usable);
      thin.push(grade);
    } else if (outcome.status === "too_few_suppliers") {
      bestSupplierUsable = Math.max(bestSupplierUsable, outcome.usable);
      bestDistinctSuppliers = Math.max(bestDistinctSuppliers, outcome.distinctSuppliers);
      pendingSuppliers.push(grade);
    }
  }

  if (rows.length === 0) {
    // Không quy cách nào đủ để hiện: ưu tiên nói đúng lý do. Thiếu mẫu và thiếu
    // NCC khác nhau là hai chuyện khác nhau với người đọc — "chưa đủ giá" khác
    // với "có giá nhưng chưa đủ nguồn độc lập".
    if (thin.length === 0 && pendingSuppliers.length > 0) {
      return {
        status: "too_few_suppliers",
        usable: bestSupplierUsable,
        distinctSuppliers: bestDistinctSuppliers,
        neededSuppliers: options.minDistinctSuppliers ?? 0,
      };
    }
    return { status: "too_few", usable: bestUsable, needed: options.minSamples ?? 3 };
  }

  rows.sort((a, b) => b.sampleSize - a.sampleSize || b.low - a.low);

  const ungradedOutcome = buildPriceRange(ungraded, options);
  const unclassified = ungradedOutcome.status === "ok" ? ungradedOutcome.range.sampleSize
    : ungradedOutcome.status === "too_few" ? ungradedOutcome.usable
    : ungradedOutcome.status === "too_few_suppliers" ? ungradedOutcome.usable
    : 0;
  const excludedOutliers = rows.reduce((sum, row) => sum + row.excludedOutliers, 0);

  return { status: "ok", rows, unclassified, excludedOutliers, thin, pendingSuppliers };
}

function round(value: number, unit: PriceUnit): number {
  const factor = unit === "mt" ? 1 : 100;
  return Math.round(value * factor) / factor;
}

/** Tiện cho trang danh mục: đọc cấu hình đơn vị rồi tính một lần. */
export function priceRangeForCategory(
  slug: string,
  configuredUnit: string | null | undefined,
  points: PricePoint[] | null | undefined,
  now?: Date,
): PriceRangeOutcome {
  const units = displayUnitsForCategory(slug, configuredUnit);
  return buildPriceRange(points, { unit: units.primary, secondaryUnit: units.secondary, now });
}

/** Ngày cập nhật dạng đọc được, cùng định dạng với biểu đồ mùa vụ. */
export function formatPriceDate(isoDate: string | null): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = labels[month - 1];
  return label ? `${day} ${label} ${year}` : "";
}
