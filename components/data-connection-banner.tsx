import Link from "next/link";
import { ArrowRight, Database, TriangleAlert } from "lucide-react";

import { dataStatus, supabaseProbe } from "@/lib/db";

/**
 * Băng cảnh báo hiện ở đầu mọi trang khi đã cấu hình Supabase nhưng máy chạy
 * app không kết nối được tới đó (ví dụ sandbox/preview bị giới hạn internet).
 * Nhờ vậy không ai nhầm dữ liệu tạm trong data/local-db.json là dữ liệu thật.
 */
export async function DataConnectionBanner() {
  // Chờ lần kiểm tra kết nối đầu tiên của tiến trình server (thường chỉ vài chục
  // ms) để ngay lần tải trang ĐẦU TIÊN đã biết Supabase có tới được hay không.
  try {
    await supabaseProbe();
  } catch {
    /* bỏ qua – chỉ là bước kiểm tra */
  }

  const status = dataStatus();
  if (!status.degraded) return null;

  return (
    <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-200/70">
          <TriangleAlert className="h-4.5 w-4.5 text-amber-800" />
        </span>
        <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
          <p className="text-[14px] font-bold">
            Chưa kết nối được Supabase — app đang chạy bằng dữ liệu tạm{" "}
            <code className="rounded bg-amber-100 px-1 text-[12.5px]">
              data/local-db.json
            </code>
          </p>
          <p className="mt-1 text-amber-900">
            Đã cấu hình{" "}
            <code className="rounded bg-amber-100 px-1 text-[12.5px]">
              {status.url ?? "SUPABASE_URL"}
            </code>
            {status.projectRef ? (
              <>
                {" "}
                (dự án <strong>{status.projectRef}</strong>)
              </>
            ) : null}
            , nhưng máy chạy app không mở được kết nối ra Internet tới Supabase.
            Mọi thao tác thêm / sửa / đổi trạng thái hiện chỉ lưu tạm trong file
            này và sẽ <strong>không</strong> xuất hiện trên Supabase.
          </p>
          <p className="mt-1 text-amber-900">
            Lỗi ghi nhận: <em>{status.reason}</em>
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
            >
              <Database className="h-3.5 w-3.5" />
              Xem trạng thái ở trang Cài đặt
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <span className="text-amber-800">
              Chạy <code className="rounded bg-amber-100 px-1">npm run check:supabase</code>{" "}
              để kiểm tra kết nối, và chạy app trên máy có Internet tới Supabase
              để dùng dữ liệu thật.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
