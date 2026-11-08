// Mở rộng từ script test đợt trước (trang chủ + Hạt điều) sang các trang công khai GET
// khác, KHÔNG động tới luồng gửi RFQ thật (POST /rfq ghi dữ liệu + gửi email thật — xem
// loadtest/README.md để biết vì sao không nên chạy tải cao vào đó trên production).
import { sleep, check } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<2000'],
  },
  cloud: {
    distribution: {
      'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 },
    },
  },
};

const BASE_URL = 'https://veximtrade.com';

// Mỗi VU random đi qua một vài trang công khai tiêu biểu — trộn trang tĩnh (ISR) và
// trang có tham số động (danh mục, chi tiết sản phẩm, trang RFQ hiển thị form).
const PAGES = [
  { path: '/', label: 'Trang chủ' },
  { path: '/products/cashew-kernels', label: 'Danh mục Hạt điều' },
  { path: '/products/black-pepper', label: 'Danh mục Hạt tiêu' },
  { path: '/rfq', label: 'Trang gửi yêu cầu báo giá (chỉ hiển thị form, không submit)' },
  { path: '/suppliers', label: 'Danh sách nhà cung cấp' },
  { path: '/blog', label: 'Blog' },
];

export default function main() {
  for (const page of PAGES) {
    const res = http.get(`${BASE_URL}${page.path}`);
    check(res, { [`${page.label} status là 200`]: (r) => r.status === 200 });
    sleep(1);
  }
}
