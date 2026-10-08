"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { importProspectsAction } from "@/app/actions";
import {
  parseDelimitedText,
  PROSPECT_CSV_FIELDS,
  guessProspectColumn,
  type ProspectCsvField,
} from "@/lib/prospects/csv";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

type ParsedFile = { headers: string[]; rows: string[][] };

export function ProspectImporter() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [dataSource, setDataSource] = useState("Apollo");
  const [targetProduct, setTargetProduct] = useState("");
  const [listName, setListName] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<ProspectCsvField, number | null>>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    message: string;
    matchedBuyers: string[];
    errors: string[];
  } | null>(null);

  const preview = useMemo(() => file?.rows.slice(0, 5) ?? [], [file]);

  async function readFile(selected?: File) {
    if (!selected) return;
    setResult(null);
    if (selected.size > 12 * 1024 * 1024) {
      toast.push({ kind: "error", title: "Tệp quá lớn. Giới hạn mỗi CSV là 12 MB." });
      return;
    }
    try {
      const parsed = parseDelimitedText(await selected.text());
      if (parsed.rows.length > 3000) {
        toast.push({ kind: "error", title: "Tệp có hơn 3.000 dòng. Hãy chia thành các tệp nhỏ hơn." });
        return;
      }
      setFile(parsed);
      setFileName(selected.name);
      setDataSource("Apollo");
      setTargetProduct("");
      setListName(selected.name.replace(/\.csv$/i, ""));
      setMapping(Object.fromEntries(
        PROSPECT_CSV_FIELDS.map(({ key }) => [key, guessProspectColumn(parsed.headers, key)]),
      ));
    } catch (error) {
      setFile(null);
      toast.push({
        kind: "error",
        title: error instanceof Error ? error.message : "Không đọc được tệp CSV.",
      });
    }
  }

  function fieldValue(row: string[], key: ProspectCsvField): string | null {
    const index = mapping[key];
    if (index === null || index === undefined) return null;
    return row[index]?.trim() || null;
  }

  async function importFile() {
    if (!file) return;
    const companyColumn = mapping.company;
    if (companyColumn === null || companyColumn === undefined) {
      toast.push({ kind: "error", title: "Hãy chọn cột Tên công ty trước khi nhập." });
      return;
    }
    const emailColumn = mapping.email;
    if (emailColumn === null || emailColumn === undefined) {
      toast.push({ kind: "error", title: "Hãy chọn cột Email. Mỗi đầu mối cần có email để được nhập." });
      return;
    }
    const rows = file.rows.map((row) => {
      const first = fieldValue(row, "first_name");
      const last = fieldValue(row, "last_name");
      const fullName = fieldValue(row, "contact_name") || [first, last].filter(Boolean).join(" ") || null;
      return {
        company: fieldValue(row, "company") ?? "",
        contact_name: fullName,
        contact_title: fieldValue(row, "contact_title"),
        email: fieldValue(row, "email"),
        email_status: fieldValue(row, "email_status"),
        phone: fieldValue(row, "phone"),
        country: fieldValue(row, "country"),
        city: fieldValue(row, "city"),
        website: fieldValue(row, "website"),
        linkedin_url: fieldValue(row, "linkedin_url"),
        company_linkedin_url: fieldValue(row, "company_linkedin_url"),
        industry: fieldValue(row, "industry"),
        employee_range: fieldValue(row, "employee_range"),
        apollo_id: fieldValue(row, "apollo_id"),
        data_source: dataSource.trim() || "Apollo",
        source_list: listName.trim() || fileName,
        target_product: fieldValue(row, "target_product") || targetProduct.trim() || null,
        status: "new" as const,
        owner: null,
        next_action: null,
        next_action_at: null,
        notes: null,
        converted_buyer_id: null,
      };
    });

    setBusy(true);
    setProgress(0);
    let created = 0;
    let skipped = 0;
    const matchedBuyers: string[] = [];
    const errors: string[] = [];
    let failed = "";
    const batchSize = 100;
    try {
      for (let start = 0; start < rows.length; start += batchSize) {
        const response = await importProspectsAction(rows.slice(start, start + batchSize), start);
        if (!response.ok) {
          failed = response.message;
          break;
        }
        created += response.created ?? 0;
        skipped += response.skipped ?? 0;
        matchedBuyers.push(...(response.matchedBuyers ?? []));
        errors.push(...(response.errors ?? []));
        setProgress(Math.min(start + batchSize, rows.length));
      }
    } catch (error) {
      failed = error instanceof Error ? error.message : "Không thể hoàn tất lần nhập.";
    } finally {
      setBusy(false);
    }
    const summary = `Đã nhập ${created} đầu mối. Bỏ qua ${skipped} dòng trùng, thiếu email hoặc không hợp lệ.${failed ? ` Dừng giữa chừng: ${failed}` : ""}`;
    setResult({ message: summary, matchedBuyers, errors });
    toast.push({ kind: failed ? "error" : "success", title: summary });
    if (created) router.refresh();
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-ink-900">Nhập danh sách khách hàng mục tiêu</h2>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Xem trước và chọn cột ngay trên trình duyệt. Chỉ nhận đầu mối có email, không tự gửi email.
          </p>
        </div>
        <Button variant="ghost" onClick={() => inputRef.current?.click()}>
          <FileUp className="h-4 w-4" />
          Chọn CSV
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => { void readFile(event.target.files?.[0]); event.currentTarget.value = ""; }}
        />
      </div>

      {file && (
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="text-[12px] text-ink-500 sm:col-span-2">
              <p className="truncate font-semibold text-ink-800">{fileName}</p>
              <p>{file.rows.length.toLocaleString()} đầu mối, {file.headers.length} cột</p>
            </div>
            <label className="block">
              <span className="label">Nguồn dữ liệu</span>
              <input className="input" value={dataSource} onChange={(event) => setDataSource(event.target.value)} placeholder="Apollo" />
            </label>
            <label className="block">
              <span className="label">Tệp tiếp cận</span>
              <input className="input" value={listName} onChange={(event) => setListName(event.target.value)} placeholder="Apollo | Mì ăn liền | Mỹ | 10/2026" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Nhóm hàng mục tiêu</span>
              <input className="input" value={targetProduct} onChange={(event) => setTargetProduct(event.target.value)} placeholder="Mì ăn liền" />
            </label>
            <p className="self-end pb-1 text-[11px] text-ink-400 sm:col-span-2">Nếu tệp có cột nhóm hàng riêng, giá trị trong cột đó sẽ được ưu tiên.</p>
          </div>

          <div>
            <h3 className="mb-2 text-[12px] font-bold text-ink-700">Đối chiếu cột</h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {PROSPECT_CSV_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="label">{field.label}</span>
                  <select
                    className="input text-[12px]"
                    value={mapping[field.key] ?? ""}
                    onChange={(event) => setMapping((current) => ({
                      ...current,
                      [field.key]: event.target.value === "" ? null : Number(event.target.value),
                    }))}
                  >
                    <option value="">Không nhập</option>
                    {file.headers.map((header, index) => (
                      <option key={`${index}-${header}`} value={index}>{header}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-ink-200">
            <table className="w-full min-w-[760px] text-left text-[11.5px]">
              <thead className="bg-ink-50 text-ink-500">
                <tr>{file.headers.slice(0, 7).map((header, i) => <th key={i} className="px-2.5 py-2 font-semibold">{header}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((row, ri) => (
                  <tr key={ri} className="border-t border-ink-100">
                    {file.headers.slice(0, 7).map((_, ci) => <td key={ci} className="max-w-[220px] truncate px-2.5 py-2 text-ink-600">{row[ci]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-[11.5px] leading-relaxed text-ink-500">
              Ghép tự động chỉ theo email, LinkedIn hoặc Apollo ID chính xác. Bản ghi trùng Buyer hiện tại được bỏ qua để anh kiểm tra riêng.
              Nhiều người liên hệ cùng công ty vẫn được giữ thành các đầu mối riêng.
            </p>
            <Button onClick={() => void importFile()} disabled={busy || !file.rows.length}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {busy ? `Đang nhập ${progress.toLocaleString()} / ${file.rows.length.toLocaleString()}...` : `Nhập ${file.rows.length.toLocaleString()} đầu mối`}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2 border-t border-ink-200 bg-ink-50/60 p-4 text-[12px]">
          <p className="font-semibold text-ink-900">{result.message}</p>
          {result.matchedBuyers.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800">Đã khớp Buyer hiện có, các dòng này không được nhập:</p>
              <ul className="mt-1 list-inside list-disc text-ink-600">{result.matchedBuyers.slice(0, 20).map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className="font-semibold text-red-700">Một số dòng cần kiểm tra:</p>
              <ul className="mt-1 list-inside list-disc text-red-700">{result.errors.slice(0, 20).map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          )}
          <button type="button" className="inline-flex items-center gap-1 text-brand-700 hover:underline" onClick={() => { setFile(null); setResult(null); }}>
            <RefreshCw className="h-3.5 w-3.5" /> Nhập tệp khác
          </button>
        </div>
      )}
    </section>
  );
}
