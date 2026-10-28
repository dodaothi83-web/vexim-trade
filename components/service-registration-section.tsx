"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Loader2,
  Megaphone,
  Send,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";

import { FormChallenge } from "@/components/form-challenge";

export type ServiceKey =
  | "free_listing"
  | "international_website"
  | "featured_ads"
  | "fda_compliance";

export type HomeLocale = "en" | "vi";

interface ServiceItem {
  key: ServiceKey;
  step: string;
  icon: typeof Store;
  title: Record<HomeLocale, string>;
  description: Record<HomeLocale, string>;
  bullets: Record<HomeLocale, string[]>;
  ctaLabel: Record<HomeLocale, string>;
  notePlaceholder: Record<HomeLocale, string>;
}

const SERVICES: ServiceItem[] = [
  {
    key: "free_listing",
    step: "01",
    icon: Store,
    title: {
      en: "Free Marketplace Listing",
      vi: "Đăng ký lên sàn Miễn phí",
    },
    description: {
      en: "Create your company profile and list your food & agricultural products on Vexim Trade completely free of charge.",
      vi: "Tạo gian hàng doanh nghiệp và đưa danh mục sản phẩm thực phẩm lên hệ thống Vexim Trade hoàn toàn miễn phí.",
    },
    bullets: {
      en: [
        "Quickly onboard legal entity profiles for factories, trading companies, or cooperatives",
        "Publish product catalogs with specs, MOQ, reference FOB pricing, and OEM/ODM capabilities",
        "Automatic certificate recognition (HACCP, ISO, BRC, Halal, FDA...) labeled as Owner or Partner Entity",
        "Receive verified Request for Quotation (RFQ) inquiries from domestic and global buyers",
      ],
      vi: [
        "Khởi tạo hồ sơ pháp nhân nhà máy, công ty thương mại hoặc hợp tác xã nhanh chóng",
        "Đăng tải sản phẩm kèm quy cách, MOQ, giá tham khảo và năng lực gia công OEM/ODM",
        "Nhận diện tự động chứng nhận (ATTP, HACCP, ISO, BRC...) gắn nhãn Chính chủ hoặc Đơn vị đối tác",
        "Nhận yêu cầu báo giá (RFQ) đã xác thực từ khách mua hàng trong nước và quốc tế",
      ],
    },
    ctaLabel: {
      en: "Register Free Listing",
      vi: "Đăng ký lên sàn miễn phí",
    },
    notePlaceholder: {
      en: "E.g. We are a cashew / coffee processor looking to open a verified storefront on Vexim...",
      vi: "VD: Công ty chúng tôi chuyên xuất khẩu hạt điều / cà phê, muốn mở gian hàng trên Vexim...",
    },
  },
  {
    key: "international_website",
    step: "02",
    icon: Globe2,
    title: {
      en: "International Trade Website Design",
      vi: "Thiết kế website chuẩn thương mại quốc tế",
    },
    description: {
      en: "Build a high-converting multilingual B2B export website tailored for food & agricultural exporters.",
      vi: "Xây dựng website B2B đa ngôn ngữ chuyên nghiệp, tối ưu chuyển đổi cho doanh nghiệp xuất khẩu thực phẩm & nông sản.",
    },
    bullets: {
      en: [
        "International trade layout: technical specifications, packaging, loading ports, and Incoterms",
        "Multilingual SEO & Schema structured data so global importers find your factory first",
        "Built-in RFQ quote forms and synchronized factory capability profiles",
        "Fast global loading speed and modern responsive UI on desktop and mobile",
      ],
      vi: [
        "Cấu trúc chuẩn thương mại quốc tế: bảng quy cách, đóng gói, cảng xuất, Incoterms",
        "Tối ưu SEO đa ngôn ngữ & dữ liệu cấu trúc Schema giúp nhà nhập khẩu dễ tìm thấy",
        "Tích hợp biểu mẫu nhận yêu cầu báo giá (RFQ) và đồng bộ hồ sơ năng lực nhà máy",
        "Tốc độ tải nhanh toàn cầu, giao diện hiện đại trên cả máy tính và điện thoại",
      ],
    },
    ctaLabel: {
      en: "Register Website Design",
      vi: "Đăng ký thiết kế website",
    },
    notePlaceholder: {
      en: "E.g. We need an English–Vietnamese B2B export website showcasing our factory and product catalog...",
      vi: "VD: Cần làm website tiếng Anh - Việt giới thiệu nhà máy chế biến nông sản và nhận báo giá...",
    },
  },
  {
    key: "featured_ads",
    step: "03",
    icon: Megaphone,
    title: {
      en: "Featured Placement",
      vi: "Quảng cáo nổi bật",
    },
    description: {
      en: "Request a consultation about business banner advertising on Vexim Trade.",
      vi: "Tư vấn quảng cáo banner doanh nghiệp trên sàn Vexim Trade.",
    },
    bullets: {
      en: [
        "Introduce your business and brand with a dedicated banner",
        "Discuss placement, banner specifications, and display period with Vexim",
        "Register for a consultation and quotation",
        "A separate service from sponsored product placement",
      ],
      vi: [
        "Giới thiệu doanh nghiệp và thương hiệu qua banner riêng",
        "Trao đổi với Vexim về vị trí, kích thước và thời gian hiển thị",
        "Đăng ký để được tư vấn và báo giá",
        "Dịch vụ riêng, khác với gói đẩy sản phẩm",
      ],
    },
    ctaLabel: {
      en: "Request banner consultation",
      vi: "Tư vấn quảng cáo banner",
    },
    notePlaceholder: {
      en: "E.g. We would like to discuss a banner for our business on Vexim Trade...",
      vi: "VD: Doanh nghiệp muốn được tư vấn treo banner quảng cáo trên sàn Vexim Trade...",
    },
  },
  {
    key: "fda_compliance",
    step: "04",
    icon: ShieldCheck,
    title: {
      en: "US FDA Regulatory Compliance",
      vi: "Tuân thủ pháp lý FDA",
    },
    description: {
      en: "End-to-end consulting and documentation support for exporting food products to the United States and global markets.",
      vi: "Tư vấn và hoàn thiện trọn gói hồ sơ pháp lý xuất khẩu thực phẩm sang thị trường Hoa Kỳ và các thị trường quốc tế.",
    },
    bullets: {
      en: [
        "US FDA Food Facility Registration & renewal + official U.S. Agent representation",
        "FDA-compliant Nutrition Facts, ingredient list, and allergen label review",
        "Support for FSVP documentation, Prior Notice filings, and FCE/SID registration",
        "Synchronized certificate profile with automated 60 / 30 / 7 / 1-day expiry alerts",
      ],
      vi: [
        "Đăng ký & gia hạn mã số cơ sở thực phẩm FDA (Food Facility Registration) + U.S. Agent",
        "Rà soát, chỉnh sửa nhãn sản phẩm (Nutrition Facts, thành phần, chất gây dị ứng) chuẩn FDA",
        "Hỗ trợ hồ sơ FSVP, khai báo Prior Notice và đăng ký FCE/SID cho thực phẩm đóng hộp",
        "Đồng bộ chứng nhận lên hồ sơ doanh nghiệp kèm lịch nhắc tự động trước 60 / 30 / 7 / 1 ngày hết hạn",
      ],
    },
    ctaLabel: {
      en: "Register FDA Consulting",
      vi: "Đăng ký tư vấn FDA",
    },
    notePlaceholder: {
      en: "E.g. We need new FDA Food Facility Registration and Nutrition Facts label review for US export...",
      vi: "VD: Cần đăng ký mới mã FDA cơ sở sản xuất và kiểm tra nhãn sản phẩm xuất đi Mỹ...",
    },
  },
];

export function ServiceRegistrationSection({ lang = "en" }: { lang?: HomeLocale }) {
  const [activeService, setActiveService] = useState<ServiceKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeVersion, setChallengeVersion] = useState(0);

  const selected = SERVICES.find((s) => s.key === activeService) ?? null;
  const isVi = lang === "vi";

  function resetChallenge() {
    setChallengeToken("");
    setChallengeVersion((version) => version + 1);
  }

  function openModal(key: ServiceKey) {
    setActiveService(key);
    setFeedback(null);
    resetChallenge();
  }

  function closeModal() {
    if (busy) return;
    setActiveService(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!challengeToken) {
      setFeedback({ ok: false, message: isVi ? "Vui lòng hoàn tất bước kiểm tra bảo mật." : "Please complete the security check." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const formEl = event.currentTarget;
      const formData = new FormData(formEl);
      formData.set("service_key", selected.key);
      formData.set("service_title", selected.title[lang]);
      formData.set("lang", lang);
      formData.set("challenge_token", challengeToken);

      const res = await fetch("/api/public/service-inquiry", {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string };
      setFeedback({
        ok: Boolean(res.ok && payload.ok),
        message:
          payload.message ??
          (res.ok
            ? isVi
              ? "Đã gửi đăng ký thành công!"
              : "Registration submitted successfully!"
            : isVi
              ? "Không gửi được đăng ký. Vui lòng kiểm tra lại thông tin."
              : "Could not submit registration. Please check your details."),
      });
      if (res.ok && payload.ok) {
        formEl.reset();
      } else {
        resetChallenge();
      }
    } catch {
      setFeedback({
        ok: false,
        message: isVi
          ? "Không kết nối được máy chủ. Vui lòng thử lại sau."
          : "Network error. Please try again shortly.",
      });
      resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="services"
      className="border-t border-slate-200 bg-gradient-to-b from-brand-950 via-brand-900 to-ink-950 py-16 text-white sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Nhãn nổi bật độ tương phản cao, không bị mờ trên nền tối */}
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-ink-950 shadow-md ring-2 ring-amber-200">
            {isVi
              ? "Giải pháp dành cho nhà sản xuất & cung ứng Việt Nam"
              : "Solutions for Vietnamese Food Manufacturers & Exporters"}
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-4xl">
            {isVi
              ? "Đưa doanh nghiệp của bạn được tìm - được tin - được chọn"
              : "Get Your Business Found – Trusted – Chosen"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/95 sm:text-base">
            {isVi
              ? "Hệ sinh thái hỗ trợ toàn diện từ niêm yết gian hàng B2B, chuẩn hóa hiện diện số quốc tế đến quảng bá nổi bật và tuân thủ pháp lý xuất khẩu."
              : "End-to-end B2B growth ecosystem — from free marketplace listing and international trade website design to business banner advertising consultations and US FDA compliance."}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((svc) => {
            const Icon = svc.icon;
            return (
              <div
                key={svc.key}
                className="flex flex-col justify-between rounded-2xl border border-white/15 bg-white p-6 text-ink-900 shadow-xl transition hover:-translate-y-1"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-ink-950 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-black tracking-widest tabular-nums text-brand-700">
                      {isVi ? `DỊCH VỤ ${svc.step}` : `SERVICE ${svc.step}`}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-black leading-snug text-ink-950">
                    {svc.title[lang]}
                  </h3>

                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
                    {svc.description[lang]}
                  </p>

                  <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-[13px] leading-snug text-ink-700">
                    {svc.bullets[lang].map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-2">
                  <button
                    type="button"
                    onClick={() => openModal(svc.key)}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand-800 px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-900"
                  >
                    {svc.ctaLabel[lang]} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL FORM ĐĂNG KÝ DỊCH VỤ RIÊNG */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/75 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-ink-900 shadow-2xl sm:p-7">
            <button
              type="button"
              onClick={closeModal}
              aria-label={isVi ? "Đóng biểu mẫu đăng ký" : "Close registration form"}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-ink-900"
            >
              <X className="h-4 w-4" />
            </button>

            <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
              {isVi ? "Đăng ký dịch vụ Vexim Trade" : "Vexim Trade Service Registration"}
            </span>
            <h3 id="service-modal-title" className="mt-2 text-xl font-black text-ink-950 sm:text-2xl">
              {selected.title[lang]}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-600 sm:text-sm">
              {selected.description[lang]}
            </p>

            {/* Cho phép đổi nhanh giữa 4 dịch vụ ngay trong form */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {SERVICES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveService(item.key);
                    setFeedback(null);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    item.key === selected.key
                      ? "bg-brand-800 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.step}. {item.title[lang]}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="mb-1 block font-bold text-ink-800">
                    {isVi ? "Tên doanh nghiệp / Cơ sở sản xuất" : "Company / Factory Name"}{" "}
                    <span className="text-rose-600">*</span>
                  </span>
                  <input
                    name="company_name"
                    type="text"
                    required
                    maxLength={160}
                    placeholder={
                      isVi ? "VD: Công ty TNHH Thực phẩm..." : "E.g. Vietnam Cashew Processing Co., Ltd."
                    }
                    className="input w-full text-sm"
                  />
                </label>

                <label className="block text-xs">
                  <span className="mb-1 block font-bold text-ink-800">
                    {isVi ? "Họ và tên người liên hệ" : "Contact Person"}{" "}
                    <span className="text-rose-600">*</span>
                  </span>
                  <input
                    name="contact_name"
                    type="text"
                    required
                    maxLength={120}
                    placeholder={isVi ? "VD: Nguyễn Văn A" : "E.g. Nguyen Van A"}
                    className="input w-full text-sm"
                  />
                </label>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="mb-1 block font-bold text-ink-800">
                    {isVi ? "Số điện thoại / Zalo" : "Phone / WhatsApp / Zalo"}{" "}
                    <span className="text-rose-600">*</span>
                  </span>
                  <input
                    name="phone"
                    type="tel"
                    required
                    maxLength={50}
                    placeholder={isVi ? "VD: 090xxxxxxx" : "E.g. +84 90xxxxxxx"}
                    className="input w-full text-sm"
                  />
                </label>

                <label className="block text-xs">
                  <span className="mb-1 block font-bold text-ink-800">
                    {isVi ? "Email công việc" : "Work Email"}{" "}
                    <span className="text-rose-600">*</span>
                  </span>
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={140}
                    placeholder={isVi ? "contact@tencongty.vn" : "export@company.com"}
                    className="input w-full text-sm"
                  />
                </label>
              </div>

              <label className="block text-xs">
                <span className="mb-1 block font-bold text-ink-800">
                  {isVi ? "Ngành hàng / Sản phẩm chính" : "Main Product Categories"}
                </span>
                <input
                  name="products_text"
                  type="text"
                  maxLength={240}
                  placeholder={
                    isVi
                      ? "VD: Hạt điều, Cà phê, Hồ tiêu, Trái cây sấy, Thủy sản..."
                      : "E.g. Cashew kernels, Robusta coffee, Black pepper, Dried fruit, Seafood..."
                  }
                  className="input w-full text-sm"
                />
              </label>

              <label className="block text-xs">
                <span className="mb-1 block font-bold text-ink-800">
                  {isVi ? "Nhu cầu chi tiết / Ghi chú thêm" : "Specific Requirements / Notes"}
                </span>
                <textarea
                  name="note"
                  rows={3}
                  maxLength={1200}
                  placeholder={selected.notePlaceholder[lang]}
                  className="input w-full text-sm"
                />
              </label>

              <div aria-hidden className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
                <label>Leave empty <input name="website_hp" tabIndex={-1} autoComplete="off" /></label>
              </div>
              <FormChallenge key={challengeVersion} purpose="service-inquiry" onChange={(token) => setChallengeToken(token ?? "")} />
              {feedback && (
                <div
                  role="status"
                  className={`rounded-xl border px-4 py-3 text-xs font-semibold leading-relaxed ${
                    feedback.ok
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  {isVi ? "Đóng" : "Close"}
                </button>
                <button
                  type="submit"
                  disabled={busy || feedback?.ok || !challengeToken}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-800 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />{" "}
                      {isVi ? "Đang gửi..." : "Submitting..."}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />{" "}
                      {isVi ? "Gửi đăng ký dịch vụ" : "Submit Registration"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
