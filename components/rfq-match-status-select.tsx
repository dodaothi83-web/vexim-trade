"use client";

/** Only this field is interactive; the CRM page and permission checks stay server-side. */
export function RfqMatchStatusSelect({ status, options }: {
  status: string; options: Array<{ value: string; label: string }>;
}) {
  return <select name="status" defaultValue={status} onChange={(event) => event.currentTarget.form?.requestSubmit()}
    className="input mt-1 py-1 text-[13px]">
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
}
