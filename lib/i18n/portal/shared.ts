/**
 * Nhãn dùng ở nhiều trang trong cổng (cụm 2 trở đi).
 *
 * Đặt riêng để không phải chép cùng một nhãn vào từ điển của từng trang — chép ra hai nơi
 * là hai chỗ để lệch nhau.
 */
const en = {
  supplierTypes: {
    manufacturer: "Factory / direct workshop",
    trading: "Trading company / exporter",
    cooperative: "Cooperative / producer group",
    unset: "Supplier type not set",
    none: "Not set",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type SharedMessages = DeepStrings<typeof en>;

const vi: SharedMessages = {
  supplierTypes: {
    manufacturer: "Nhà máy / Xưởng trực tiếp",
    trading: "Công ty thương mại / Xuất khẩu",
    cooperative: "Hợp tác xã / Tổ hợp sản xuất",
    unset: "Chưa khai loại hình",
    none: "Chưa khai",
  },
};

export const sharedMessages = { en, vi } as const;
