"use client";

import { useState } from "react";

const CATEGORIES = [
  "Thông tin sản phẩm hoặc nhà cung cấp không chính xác",
  "Nghi ngờ hàng giả hoặc hàng không rõ nguồn gốc",
  "Xâm phạm quyền sở hữu trí tuệ",
  "Hàng hóa hoặc nội dung bị cấm giới thiệu",
  "Hành vi lừa đảo hoặc gian lận",
  "Vấn đề về dữ liệu cá nhân",
  "Vấn đề khác",
];

export function ComplaintForm({ initialTarget }: { initialTarget?: string }) {
  const [sent, setSent] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const category = String(form.get("category") ?? "");
    const target = String(form.get("target") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    const subject = encodeURIComponent(`[Khiếu nại Vexim] ${category}`);
    const body = encodeURIComponent(
      `Họ tên: ${name}\nEmail liên hệ: ${email}\nLoại vấn đề: ${category}\nTrang hoặc đối tượng liên quan: ${target || "Không ghi"}\n\nNội dung:\n${message}\n`,
    );
    window.location.href = `mailto:hello@veximtrade.com?subject=${subject}&body=${body}`;
    setSent(true);
  }

  const input = "input w-full";
  const label = "block text-sm font-semibold text-ink-800";
  return <form onSubmit={submit} className="mt-5 space-y-4 rounded-xl border border-ink-200 bg-slate-50 p-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={label}>Họ tên của bạn
        <input name="name" required maxLength={120} autoComplete="name" className={`${input} mt-1.5`} />
      </label>
      <label className={label}>Email liên hệ
        <input name="email" type="email" required maxLength={200} autoComplete="email" className={`${input} mt-1.5`} />
      </label>
    </div>
    <label className={label}>Loại vấn đề
      <select name="category" required className={`${input} mt-1.5`} defaultValue={CATEGORIES[0]}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
    <label className={label}>Đường liên kết hoặc tên sản phẩm, nhà cung cấp liên quan
      <input name="target" maxLength={500} defaultValue={initialTarget ?? ""} placeholder="Ví dụ: đường liên kết trang sản phẩm trên Vexim Trade" className={`${input} mt-1.5`} />
    </label>
    <label className={label}>Nội dung phản ánh
      <textarea name="message" required rows={6} maxLength={4000} placeholder="Mô tả vấn đề, thời điểm phát hiện và căn cứ kèm theo nếu có." className={`${input} mt-1.5 resize-y`} />
    </label>
    <p className="text-xs leading-5 text-ink-500">Khi bấm gửi, trình duyệt sẽ mở ứng dụng email của bạn với nội dung đã điền để gửi tới hello@veximtrade.com. Bằng chứng dạng tệp vui lòng đính kèm trực tiếp trong email đó. Không gửi mật khẩu, số tài khoản ngân hàng hoặc giấy tờ tùy thân qua biểu mẫu này.</p>
    <button type="submit" className="btn btn-primary justify-center">Mở email và gửi phản ánh</button>
    {sent && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Đã mở ứng dụng email của bạn. Vui lòng kiểm tra và bấm gửi trong email để hoàn tất. Nếu ứng dụng email không mở, hãy gửi trực tiếp tới hello@veximtrade.com.</p>}
  </form>;
}
