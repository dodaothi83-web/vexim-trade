import Link from "next/link";
import { UserPlus } from "lucide-react";

import { listBuyersWithSupplier } from "@/lib/queries";
import { getStage } from "@/lib/pipeline";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/pipeline-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const buyers = await listBuyersWithSupplier();
  const active = buyers.filter((b) => !getStage(b.stage).terminal);
  const value = active.reduce((s, b) => s + (b.deal_value ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        sub={`${active.length} đơn đang chạy · giá trị ${value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} · kéo thả thẻ để đổi trạng thái, hệ thống sẽ gửi email cập nhật cho buyer và NCC`}
        actions={
          <>
            <Link href="/buyers" className="btn btn-ghost">
              Xem dạng bảng
            </Link>
            <Link href="/buyers/new" className="btn btn-primary">
              <UserPlus className="h-4 w-4" />
              Thêm buyer
            </Link>
          </>
        }
      />
      <PipelineBoard buyers={buyers} highlight={stage} />
    </>
  );
}
