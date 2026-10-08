export type ProspectCsvField =
  | "company"
  | "contact_name"
  | "first_name"
  | "last_name"
  | "contact_title"
  | "email"
  | "email_status"
  | "phone"
  | "country"
  | "city"
  | "website"
  | "linkedin_url"
  | "company_linkedin_url"
  | "industry"
  | "employee_range"
  | "apollo_id";

export const PROSPECT_CSV_FIELDS: { key: ProspectCsvField; label: string; aliases: string[] }[] = [
  { key: "company", label: "Tên công ty", aliases: ["company", "company name", "organization name", "account name", "organization"] },
  { key: "contact_name", label: "Họ tên người liên hệ", aliases: ["contact name", "full name", "person name", "name"] },
  { key: "first_name", label: "Tên", aliases: ["first name", "firstname", "first_name"] },
  { key: "last_name", label: "Họ", aliases: ["last name", "lastname", "last_name"] },
  { key: "contact_title", label: "Chức danh", aliases: ["title", "job title", "person title", "contact title"] },
  { key: "email", label: "Email công việc", aliases: ["email", "email address", "work email", "primary email"] },
  { key: "email_status", label: "Trạng thái xác minh email", aliases: ["email status", "email verification status", "email confidence"] },
  { key: "phone", label: "Điện thoại", aliases: ["phone", "phone number", "mobile phone", "direct phone", "work phone"] },
  { key: "country", label: "Quốc gia", aliases: ["country", "company country", "person country"] },
  { key: "city", label: "Thành phố / khu vực", aliases: ["city", "state", "region", "company city"] },
  { key: "website", label: "Website công ty", aliases: ["website", "company website", "domain", "company domain"] },
  { key: "linkedin_url", label: "LinkedIn người liên hệ", aliases: ["linkedin", "linkedin url", "person linkedin url", "contact linkedin url"] },
  { key: "company_linkedin_url", label: "LinkedIn công ty", aliases: ["company linkedin", "company linkedin url", "organization linkedin url"] },
  { key: "industry", label: "Ngành", aliases: ["industry", "industries", "company industry"] },
  { key: "employee_range", label: "Quy mô nhân sự", aliases: ["employees", "employee range", "employee count", "number of employees"] },
  { key: "apollo_id", label: "Mã liên hệ Apollo", aliases: ["apollo id", "apollo contact id", "person id", "contact id"] },
];

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\uFEFF]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function guessProspectColumn(headers: string[], field: ProspectCsvField): number | null {
  const definition = PROSPECT_CSV_FIELDS.find((item) => item.key === field);
  if (!definition) return null;
  const aliases = new Set(definition.aliases.map(normalizeHeader));
  const exact = headers.findIndex((header) => aliases.has(normalizeHeader(header)));
  if (exact >= 0) return exact;
  const fuzzy = headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return definition.aliases.some((alias) => {
      const needle = normalizeHeader(alias);
      return needle.length > 5 && normalized.includes(needle);
    });
  });
  return fuzzy >= 0 ? fuzzy : null;
}

export function parseDelimitedText(source: string): { headers: string[]; rows: string[][] } {
  const text = source.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", "\t", ";"];
  const delimiter = candidates
    .map((candidate) => ({ candidate, count: [...firstLine].filter((char) => char === candidate).length }))
    .sort((a, b) => b.count - a.count)[0]?.candidate ?? ",";

  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, "").trim());
      if (row.some((part) => part.length > 0)) records.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("Tệp CSV có dấu ngoặc kép chưa được đóng.");
  row.push(cell.replace(/\r$/, "").trim());
  if (row.some((part) => part.length > 0)) records.push(row);
  if (records.length < 2) throw new Error("Tệp phải có dòng tiêu đề và ít nhất một dòng liên hệ.");

  const headers = records[0].map((header, index) => header || `Column ${index + 1}`);
  const rows = records.slice(1).map((record) => headers.map((_, index) => record[index] ?? ""));
  return { headers, rows };
}
