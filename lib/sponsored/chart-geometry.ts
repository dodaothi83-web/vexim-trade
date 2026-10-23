/**
 * Hình học biểu đồ đường theo ngày.
 *
 * Tách khỏi React để kiểm bằng số: cùng một bộ điểm phải ra cùng toạ độ, không phụ
 * thuộc trình duyệt. `scripts/check-sponsored-admin.mjs` gọi trực tiếp file này.
 */

export interface ChartPoint {
  day: string;
  value: number;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export interface ChartGeometry {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  ceiling: number;
  mid: number;
  points: { x: number; y: number; value: number; day: string }[];
  path: string;
  /** Chỉ số của các điểm được gắn nhãn ngày, để chữ không chồng lên nhau. */
  labelIndices: number[];
  /** Toạ độ trục tung của một giá trị, dùng lại đúng thang chia ở trên. */
  yFor: (value: number) => number;
}

/**
 * Dựng toạ độ cho biểu đồ.
 *
 * Trục tung luôn chia hết cho hai để vạch giữa là một số tròn dễ đọc. Gói mới chạy
 * một ngày thì có đúng một điểm ở giữa khung, không vẽ đường phẳng giả cho có bảy
 * điểm.
 */
export function buildChartGeometry(points: readonly ChartPoint[], options: ChartOptions = {}): ChartGeometry {
  const width = options.width ?? 420;
  const height = options.height ?? 190;
  const left = options.left ?? 34;
  const right = options.right ?? 10;
  const top = options.top ?? 14;
  const bottom = options.bottom ?? 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const max = Math.max(...points.map((point) => Math.max(0, point.value)), 1);
  const ceiling = Math.max(10, Math.ceil(max / 50) * 50);
  const mid = Math.round(ceiling / 2);

  const x = (index: number) =>
    points.length <= 1 ? left + plotW / 2 : left + (index * plotW) / (points.length - 1);
  const y = (value: number) => top + plotH - (Math.max(0, value) / ceiling) * plotH;

  const mapped = points.map((point, index) => ({
    x: x(index),
    y: y(point.value),
    value: point.value,
    day: point.day,
  }));

  return {
    width,
    height,
    plot: { left, right: left + plotW, top, bottom: top + plotH },
    ceiling,
    mid,
    points: mapped,
    path: smoothPath(mapped),
    labelIndices: labelPositions(points.length),
    yFor: (value: number) => y(value),
  };
}

/**
 * Catmull–Rom đổi sang đường Bézier bậc ba. Chỉ làm mượt đoạn nối giữa các điểm
 * thật, không sinh thêm giá trị: đường cong không được cao hơn điểm dữ liệu cao
 * nhất, nếu không biểu đồ nói một con số mà dữ liệu không có.
 */
function smoothPath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  if (points.length === 1) return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} L ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  if (points.length === 2) {
    const last = points[1];
    return `${path} L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

/** Nhãn ngày chỉ đặt ở đầu, giữa và cuối; quá ba nhãn thì chữ chồng lên nhau. */
function labelPositions(length: number): number[] {
  if (length <= 1) return [0];
  if (length === 2) return [0, 1];
  return [...new Set([0, Math.floor((length - 1) / 2), length - 1])].sort((a, b) => a - b);
}
