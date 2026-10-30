import type { ProductFormReviewDiff } from "@/lib/products/product-form-review-diff";

const titles: Record<ProductFormReviewDiff["section"], string> = {
  basic: "Thông tin cơ bản", attributes: "Thuộc tính", transaction: "Giao dịch và bảng giá",
  packaging: "Đóng gói và vận chuyển", description: "Mô tả",
};
const sections: ProductFormReviewDiff["section"][] = ["basic", "attributes", "transaction", "packaging", "description"];

/** Internal comparison only. Image and English-name review must be shown separately. */
export function ProductFormReviewDiffTable({ rows }: { rows: readonly ProductFormReviewDiff[] }) {
  const hasUnknown = rows.some((row) => row.previous === null);
  return <div className="space-y-4">
    {hasUnknown && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      Không thể chuyển đầy đủ dữ liệu cũ sang form này. Hãy đối chiếu sản phẩm hiện có, không coi các giá trị chưa biết là trống.
    </p>}
    {sections.map((section) => {
      const group = rows.filter((row) => row.section === section);
      if (!group.length) return null;
      return <section key={section} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <h3 className="border-b border-ink-100 bg-ink-50 px-4 py-3 text-sm font-bold text-ink-900">{titles[section]}</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] table-fixed text-left text-sm">
          <thead className="text-xs text-ink-500"><tr><th className="w-1/4 p-3">Trường</th><th className="p-3">Đã duyệt</th><th className="p-3">Bản gửi</th></tr></thead>
          <tbody>{group.map((row) => <tr key={row.label} className="border-t border-ink-100 align-top">
            <th scope="row" className="p-3 font-semibold text-ink-800">{row.label}{row.changed && <span className="mt-1 block text-xs font-medium text-amber-700">Có thay đổi</span>}</th>
            <td className="whitespace-pre-wrap break-words p-3 text-ink-600">{row.previous === null ? "Chưa xác định" : row.previous || "Chưa nhập"}</td>
            <td className="whitespace-pre-wrap break-words p-3 text-ink-900">{row.submitted || "Chưa nhập"}</td>
          </tr>)}</tbody>
        </table></div>
      </section>;
    })}
  </div>;
}
