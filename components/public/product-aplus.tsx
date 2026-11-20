import { aplusVideoEmbedUrl, type AplusModule } from "@/lib/products/aplus";

/**
 * Nội dung A+ của sản phẩm trên trang người mua, dưới phần mô tả. Chỉ dựng khi gói nhà cung
 * cấp còn quyền A+ (trang gọi kiểm tra trước). Ảnh đi qua /public-media, nơi cũng kiểm tra lại
 * sản phẩm đã đăng và gói còn quyền.
 */
export function ProductAplus({ modules, productName }: { modules: AplusModule[]; productName: string }) {
  if (!modules.length) return null;
  const src = (path: string) => `/public-media/${path}`;
  return <div className="mt-6 space-y-8">
    {modules.map((module) => {
      switch (module.type) {
        case "image":
          return <figure key={module.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(module.image_path)} alt={module.caption || productName} loading="lazy" decoding="async" className="w-full rounded-xl object-cover" />
            {module.caption && <figcaption className="mt-2 text-sm text-ink-600">{module.caption}</figcaption>}
          </figure>;
        case "image_text":
          return <div key={module.id} className="grid items-center gap-5 md:grid-cols-2 md:gap-8">
            <div className={module.image_side === "right" ? "md:order-2" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(module.image_path)} alt={module.title} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-xl object-cover" />
            </div>
            <div className="min-w-0">
              <h3 className="break-words text-xl font-bold text-ink-900">{module.title}</h3>
              {module.body && <p className="mt-2 whitespace-pre-line break-words leading-7 text-ink-700">{module.body}</p>}
            </div>
          </div>;
        case "gallery":
          return <div key={module.id} className={`grid gap-4 ${module.items.length === 2 ? "sm:grid-cols-2" : module.items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
            {module.items.map((item, index) => <figure key={index}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(item.image_path)} alt={item.caption || productName} loading="lazy" decoding="async" className="aspect-square w-full rounded-xl object-cover" />
              {item.caption && <figcaption className="mt-1.5 text-sm text-ink-600">{item.caption}</figcaption>}
            </figure>)}
          </div>;
        case "text":
          return <div key={module.id} className="max-w-3xl">
            <h3 className="break-words text-xl font-bold text-ink-900">{module.title}</h3>
            {module.body && <p className="mt-2 whitespace-pre-line break-words leading-7 text-ink-700">{module.body}</p>}
          </div>;
        case "video":
          return <figure key={module.id}>
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe src={aplusVideoEmbedUrl(module.video_uid)} title={module.title || `${productName} video`} loading="lazy"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0" />
            </div>
            {module.title && <figcaption className="mt-2 text-sm text-ink-600">{module.title}</figcaption>}
          </figure>;
      }
    })}
  </div>;
}
