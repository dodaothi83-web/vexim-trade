import { Fragment, type CSSProperties, type ReactNode } from "react";

import { VeximIcon } from "@/components/brand/vexim-icons";
import { AplusVideo } from "@/components/public/aplus-video";
import { parseAplusRich, type AplusModule, type AplusRichRun } from "@/lib/products/aplus";

/**
 * Nội dung A+ của sản phẩm trên trang người mua, dưới phần mô tả (bản duyệt docs/aplus-editor,
 * màn 4). Chỉ dựng khi gói nhà cung cấp còn quyền A+ (trang gọi kiểm tra trước). Ảnh đi qua
 * /public-media, nơi cũng kiểm tra lại sản phẩm đã đăng và gói còn quyền.
 *
 * HTML ngữ nghĩa (tiêu đề, danh sách, bảng, figure kèm alt, details cho câu hỏi) để Google và AI
 * đọc được. Dùng container query nên trình soạn xem trước đúng cả khung máy tính và điện thoại.
 * Trình soạn truyền `imageUrl` (ảnh chưa công khai) và `decorate` (đánh dấu khối đang sửa).
 */
export function ProductAplus({ modules, productName, imageUrl = (path) => `/public-media/${path}`, decorate }: {
  modules: AplusModule[];
  productName: string;
  imageUrl?: (path: string) => string;
  decorate?: (module: AplusModule, node: ReactNode) => ReactNode;
}) {
  if (!modules.length) return null;
  const pos = (item: { fx?: number; fy?: number }): CSSProperties => ({ objectPosition: `${item.fx ?? 50}% ${item.fy ?? 50}%` });
  const img = (item: { image_path: string; alt?: string; fx?: number; fy?: number }, fallbackAlt: string, className: string) => item.image_path
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={imageUrl(item.image_path)} alt={item.alt || fallbackAlt} loading="lazy" decoding="async" style={pos(item)} className={`w-full object-cover ${className}`} />
    : <div aria-hidden="true" className={`w-full bg-ink-100 ${className}`} />;
  return <div className="@container mt-6 space-y-10">
    {modules.map((module) => {
      const node = renderModule(module, productName, img);
      return <Fragment key={module.id}>{decorate ? decorate(module, node) : node}</Fragment>;
    })}
  </div>;
}

type Img = (item: { image_path: string; alt?: string; fx?: number; fy?: number }, fallbackAlt: string, className: string) => ReactNode;

function renderModule(module: AplusModule, productName: string, img: Img): ReactNode {
  switch (module.type) {
    case "hero":
      // Điện thoại: banner thấp (cao tối thiểu 16rem, chỉ cao thêm khi chữ dài) thay vì khung đứng 4:5.
      // Máy tính: khung ngang 97:36.
      return <section className="relative flex min-h-64 flex-col justify-end overflow-hidden rounded-2xl bg-ink-900 text-white @xl:block @xl:min-h-0 @xl:aspect-[97/36]">
        {img(module, module.headline || productName, "absolute inset-0 h-full")}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E16]/85 via-[#0A0E16]/40 to-transparent @xl:bg-gradient-to-r @xl:from-[#0A0E16]/80 @xl:via-[#0A0E16]/30" aria-hidden="true" />
        <div className="relative p-5 @xl:absolute @xl:inset-x-0 @xl:bottom-0 @xl:max-w-[68%] @xl:p-8">
          {module.eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">{module.eyebrow}</p>}
          <h3 className="mt-1.5 break-words text-xl font-bold leading-snug @xl:text-[28px]">{module.headline}</h3>
          {module.sub && <p className="mt-2 break-words text-sm leading-6 text-white/90 @xl:text-[15px]">{module.sub}</p>}
        </div>
      </section>;
    case "highlights":
      return <section aria-label="Highlights" className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
        {module.items.map((item, i) => <div key={i} className="rounded-2xl border border-ink-200 bg-white p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><VeximIcon name={item.icon} size={24} /></span>
          <h3 className="mt-3 break-words text-[15px] font-bold leading-snug text-ink-900">{item.title}</h3>
          {item.text && <p className="mt-1 break-words text-[13.5px] leading-6 text-ink-600">{item.text}</p>}
        </div>)}
      </section>;
    case "steps":
      return <section>
        <ol className={`grid gap-4 @lg:grid-cols-3 ${["", "", "", "", "@3xl:grid-cols-4", "@4xl:grid-cols-5", "@4xl:grid-cols-6"][module.items.length] ?? ""}`}>
          {module.items.map((item, i) => <li key={i} className="grid grid-cols-[88px_1fr] items-center gap-3 @lg:block">
            <div className="relative">
              {item.image_path ? img(item, item.title, "aspect-square rounded-xl") : <div className="aspect-square rounded-xl bg-brand-50" aria-hidden="true" />}
              <span className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-brand-700 text-xs font-extrabold text-white ring-[3px] ring-white" aria-hidden="true">{i + 1}</span>
            </div>
            <div className="min-w-0 @lg:mt-2.5">
              <h3 className="break-words text-[14.5px] font-bold text-ink-900"><span className="sr-only">Step {i + 1}: </span>{item.title}</h3>
              {item.text && <Rich value={item.text} className="mt-0.5 text-[13px] leading-6 text-ink-600" />}
            </div>
          </li>)}
        </ol>
      </section>;
    case "packing":
      return <section className="grid items-center gap-5 @xl:grid-cols-[1fr_1.15fr] @xl:gap-8">
        <div>{img(module, module.title || `${productName} packing`, "aspect-[4/3] rounded-2xl")}</div>
        <div className="min-w-0">
          {module.title && <h3 className="mb-3 break-words text-xl font-bold text-ink-900">{module.title}</h3>}
          <table className="w-full border-collapse text-sm">
            <tbody>{module.rows.map((row, i) => <tr key={i} className="border-b border-ink-200">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium text-ink-600">{row.label}</th>
              <td className="py-2.5 text-right font-semibold text-ink-900">{row.value}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>;
    case "faq":
      return <section>
        <h3 className="text-xl font-bold text-ink-900">Questions buyers ask</h3>
        <div className="mt-3 space-y-2">
          {module.items.map((item, i) => <details key={i} open={i === 0} className="group rounded-xl border border-ink-200 bg-white px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14.5px] font-semibold text-ink-900">
              <span className="break-words">{item.q}</span><span className="text-ink-400 transition group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <Rich value={item.a} className="mt-2 text-[13.5px] leading-6 text-ink-600" />
          </details>)}
        </div>
      </section>;
    case "image":
      return <figure>
        {img(module, module.caption || productName, "rounded-2xl")}
        {module.caption && <figcaption className="mt-2 text-sm text-ink-600">{module.caption}</figcaption>}
      </figure>;
    case "image_text":
      return <div className="grid items-center gap-5 @xl:grid-cols-2 @xl:gap-8">
        <div className={module.image_side === "right" ? "@xl:order-2" : undefined}>{img(module, module.title, "aspect-[4/3] rounded-2xl")}</div>
        <div className="min-w-0">
          <h3 className="break-words text-xl font-bold text-ink-900">{module.title}</h3>
          {module.body && <Rich value={module.body} className="mt-2 leading-7 text-ink-700" />}
        </div>
      </div>;
    case "gallery":
      return <div className={`grid grid-cols-2 gap-4 ${module.items.length === 3 ? "@xl:grid-cols-3" : module.items.length === 4 ? "@3xl:grid-cols-4" : ""}`}>
        {module.items.map((item, index) => <figure key={index}>
          {img(item, item.caption || productName, "aspect-square rounded-xl")}
          {item.caption && <figcaption className="mt-1.5 text-sm text-ink-600">{item.caption}</figcaption>}
        </figure>)}
      </div>;
    case "text":
      return <div className="max-w-3xl">
        <h3 className="break-words text-xl font-bold text-ink-900">{module.title}</h3>
        {module.body && <Rich value={module.body} className="mt-2 leading-7 text-ink-700" />}
      </div>;
    case "video":
      return module.video_uid ? <figure>
        <AplusVideo uid={module.video_uid} title={module.title || `${productName} video`} />
        {module.title && <figcaption className="mt-2 text-sm text-ink-600">{module.title}</figcaption>}
      </figure> : <div className="aspect-video rounded-2xl bg-ink-100" aria-hidden="true" />;
  }
}

/** Đoạn chữ có **đậm**, *nghiêng* và gạch đầu dòng. */
function Rich({ value, className }: { value: string; className?: string }) {
  const nodes = parseAplusRich(value);
  const out: ReactNode[] = [];
  const runs = (list: AplusRichRun[]) => list.map((run, i) => {
    const text = run.i ? <em className="italic">{run.t}</em> : run.t;
    return run.b ? <strong key={i} className="font-semibold text-ink-900">{text}</strong> : <Fragment key={i}>{text}</Fragment>;
  });
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].kind === "li") {
      const items = [];
      while (i < nodes.length && nodes[i].kind === "li") items.push(nodes[i++]);
      i--;
      out.push(<ul key={i} className="my-2 list-disc space-y-1 pl-5 marker:text-brand-500">{items.map((item, k) => <li key={k}>{runs(item.runs)}</li>)}</ul>);
    } else out.push(<p key={i} className="my-2 whitespace-pre-line first:mt-0 last:mb-0">{runs(nodes[i].runs)}</p>);
  }
  return <div className={`break-words ${className ?? ""}`}>{out}</div>;
}
