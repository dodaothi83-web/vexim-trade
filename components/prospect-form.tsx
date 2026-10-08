"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { createProspectAction } from "@/app/actions";
import { Button, Field } from "@/components/ui";
import { useToast } from "@/components/toast";

export function ProspectForm() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    company: "", contact_name: "", contact_title: "", email: "", email_status: "",
    phone: "", country: "", city: "", website: "", linkedin_url: "",
    company_linkedin_url: "", industry: "", employee_range: "", data_source: "Tự nhập",
    source_list: "", target_product: "",
  });
  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await createProspectAction(form);
    setBusy(false);
    toast.push({ kind: result.ok ? "success" : "error", title: result.message });
    if (result.ok && result.id) router.push(`/prospects/${result.id}`);
  }
  return (
    <form onSubmit={submit} className="card space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Tên công ty" required><input required className="input" value={form.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Người liên hệ"><input className="input" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
        <Field label="Chức danh"><input className="input" value={form.contact_title} onChange={(e) => set("contact_title", e.target.value)} /></Field>
        <Field label="Email công việc"><input type="email" className="input" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Trạng thái email"><input className="input" placeholder="Đã xác minh / Chưa xác minh" value={form.email_status} onChange={(e) => set("email_status", e.target.value)} /></Field>
        <Field label="Điện thoại"><input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Quốc gia"><input className="input" value={form.country} onChange={(e) => set("country", e.target.value)} /></Field>
        <Field label="Thành phố / khu vực"><input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="Website công ty"><input className="input" value={form.website} onChange={(e) => set("website", e.target.value)} /></Field>
        <Field label="LinkedIn cá nhân"><input className="input" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} /></Field>
        <Field label="LinkedIn công ty"><input className="input" value={form.company_linkedin_url} onChange={(e) => set("company_linkedin_url", e.target.value)} /></Field>
        <Field label="Ngành"><input className="input" value={form.industry} onChange={(e) => set("industry", e.target.value)} /></Field>
        <Field label="Quy mô nhân sự"><input className="input" value={form.employee_range} onChange={(e) => set("employee_range", e.target.value)} /></Field>
        <Field label="Nguồn dữ liệu"><input className="input" placeholder="Apollo, hội chợ, giới thiệu..." value={form.data_source} onChange={(e) => set("data_source", e.target.value)} /></Field>
        <Field label="Tệp tiếp cận"><input className="input" placeholder="Apollo | Mì ăn liền | Mỹ | 10/2026" value={form.source_list} onChange={(e) => set("source_list", e.target.value)} /></Field>
        <Field label="Nhóm hàng mục tiêu"><input className="input" placeholder="Mì ăn liền" value={form.target_product} onChange={(e) => set("target_product", e.target.value)} /></Field>
      </div>
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Tạo đầu mối tiếp cận</Button></div>
    </form>
  );
}
