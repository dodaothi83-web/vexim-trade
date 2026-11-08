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
//
// LƯU Ý: slug danh mục dưới đây lấy từ supabase/migrations/20261027_launch_categories.sql
// (cashew-kernels, pepper, cinnamon-star-anise) — kiểm tra lại trong CRM > Danh mục xem
// slug nào đang thật sự publish trên production trước khi chạy, vì danh mục có thể được
// thêm/ẩn sau thời điểm migration này.
const PAGES = [
  { path: '/', label: 'Trang chủ' },
  { path: '/products/cashew-kernels', label: 'Danh mục Hạt điều' },
  { path: '/products/pepper', label: 'Danh mục Hồ tiêu' },
  { path: '/products/cinnamon-star-anise', label: 'Danh mục Quế hồi' },
  { path: '/rfq', label: 'Trang gửi yêu cầu báo giá (chỉ hiển thị form, không submit)' },
  { path: '/blog', label: 'Blog' },
  // Lưu ý: "/suppliers" (danh sách tổng) KHÔNG tồn tại trong code — site chỉ có trang chi
  // tiết từng nhà cung cấp "/suppliers/[slug]". Đợt test trước có "/suppliers" trong danh
  // sách này đã gây 404 ở MỌI lần gọi (~1/6 request), kéo failure rate lên tới 14% — không
  // phải do server chịu tải kém. Muốn test trang chi tiết nhà cung cấp, thay dòng dưới bằng
  // một slug NCC công khai thật, ví dụ: { path: '/suppliers/ten-slug-ncc-that', label: '...' }.
];

export default function main() {
  for (const page of PAGES) {
    const res = http.get(`${BASE_URL}${page.path}`, { tags: { name: page.label } });
    check(res, { [`${page.label} status là 200`]: (r) => r.status === 200 });
    sleep(1);
  }
}
