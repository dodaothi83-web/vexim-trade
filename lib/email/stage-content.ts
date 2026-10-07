import type { StageKey } from "@/lib/pipeline";

/**
 * NỘI DUNG EMAIL THEO TỪNG GIAI ĐOẠN.
 * Mỗi giai đoạn có 2 bộ nội dung HOÀN TOÀN RIÊNG:
 *   - buyer    : tiếng Anh, giọng đối tác xuất khẩu, nói về đơn hàng & bước kế tiếp
 *   - supplier : tiếng Việt, giọng nội bộ, giao VIỆC CỤ THỂ + THỜI HẠN
 *
 * Placeholder được thay bằng dữ liệu thật của đơn:
 *   {product} {quantity} {spec} {country} {port} {incoterm} {shipdate} {ref} {supplier}
 *   {payment} (EN) / {payment_vi} (VI) – phương thức + điều khoản thanh toán
 */
export interface BuyerCopy {
  subject: string;
  body: string[];
  /** Bước kế tiếp / điều chúng tôi cần từ buyer */
  action: string;
}

export interface SupplierCopy {
  subject: string;
  body: string[];
  /** Việc xưởng phải làm – hiển thị dạng checklist trong email */
  tasks: string[];
  /** Thời hạn phản hồi */
  deadline: string;
}

export interface StageCopy {
  buyer: BuyerCopy;
  supplier: SupplierCopy;
}

export const STAGE_CONTENT: Record<StageKey, StageCopy> = {
  lead: {
    buyer: {
      subject: "Thank you for your enquiry – {product}",
      body: [
        "Thank you for contacting Vexim Trade about {product}. Your enquiry has reached our export desk and is being reviewed by the specialist covering your market.",
        "We work directly with approved producers in Vietnam, which lets us control quality from raw material right through to container loading.",
      ],
      action:
        "Within one working day we will send our questions on specification and packaging, followed by an indicative price range.",
    },
    supplier: {
      subject: "Yêu cầu mới thị trường {country} – {product} (chưa cần báo giá)",
      body: [
        "Phòng sale vừa tiếp nhận một yêu cầu mới cho {product}, số lượng dự kiến {quantity}.",
        "Đây mới là yêu cầu thăm dò, chưa phải đơn chắc chắn. Chúng tôi thông báo để xưởng chủ động nguồn hàng.",
      ],
      tasks: [
        "Rà soát tồn kho và sản lượng có thể nhận trong 1–2 tháng tới",
        "Chưa cần gửi giá – yêu cầu báo giá chính thức sẽ đến ở bước sau",
      ],
      deadline: "Chủ động nguồn hàng, chưa cần phản hồi",
    },
  },

  contacted: {
    buyer: {
      subject: "A few details to finalise your {product} offer",
      body: [
        "Thank you for the information so far. To prepare an offer you can rely on, we need to confirm a few commercial details before quoting.",
        "Our quotation will state the specification, packaging, delivery term, validity period and the documents we can provide with the shipment.",
      ],
      action:
        "Please confirm: (1) final specification and grade, (2) quantity per shipment, (3) destination port and Incoterm, (4) target shipment date.",
    },
    supplier: {
      subject: "Chuẩn bị báo giá – {product}, {quantity}",
      body: [
        "Chúng tôi đang trao đổi với một buyer thị trường {country} về {product}, số lượng {quantity}.",
        "Khả năng cao sẽ cần báo giá chính thức trong vài ngày tới, nên cần thông tin từ xưởng sớm.",
      ],
      tasks: [
        "Gửi bảng thông số kỹ thuật sản phẩm và các chứng chỉ hiện có",
        "Cho biết giá tham khảo theo từng mốc số lượng",
        "Xác nhận thời gian giao tính từ ngày nhận cọc",
      ],
      deadline: "Phản hồi trong 2 ngày làm việc",
    },
  },

  quoted: {
    buyer: {
      subject: "Quotation for {product} – {incoterm} {port}",
      body: [
        "Please find our offer for {product}, prepared on the specification and quantity you confirmed.",
        "The quotation covers product specification, packaging, {incoterm} delivery to {port}, and the validity period stated in the document.",
      ],
      action:
        "Kindly review and revert with your comments. If you prefer to check quality before committing, we can arrange samples against your courier account.",
    },
    supplier: {
      subject: "Đã gửi báo giá cho buyer – giữ giá {product}",
      body: [
        "Chúng tôi đã gửi báo giá {product} cho buyer, điều kiện {incoterm} {port}.",
        "Giá và lịch giao của xưởng chính là cơ sở của báo giá này.",
      ],
      tasks: [
        "Giữ giá đã báo trong suốt thời hạn hiệu lực của báo giá",
        "Giữ chỗ sản xuất cho sản lượng {quantity}",
        "Báo ngay nếu có biến động giá nguyên liệu đầu vào",
      ],
      deadline: "Trong thời hạn hiệu lực của báo giá",
    },
  },

  negotiation: {
    buyer: {
      subject: "Revised commercial terms for your {product} order",
      body: [
        "Thank you for your feedback on our offer. We have gone back to our production network to improve the commercial terms while keeping the quality you approved.",
        "Where a target cannot be met on the original specification, we will show the closest alternative together with its price impact, so you can decide with full information.",
      ],
      action:
        "We will revert with a revised offer shortly. Please tell us if your shipment schedule has changed so we can secure capacity in time.",
    },
    supplier: {
      subject: "CẦN GIÁ TỐT NHẤT – {product}, {quantity}",
      body: [
        "Buyer đang đàm phán giá cho đơn {product}, số lượng {quantity}. Mức chào hiện tại của đối thủ đang thấp hơn nên chúng tôi cần giá cạnh tranh nhất từ xưởng.",
        "Nếu không giảm được giá, hãy nêu rõ có thể cải thiện ở điểm nào khác: điều khoản thanh toán, thời gian giao, đóng gói hoặc sản lượng tối thiểu.",
      ],
      tasks: [
        "Xác nhận giá tốt nhất có thể áp dụng cho đơn này",
        "Nêu rõ sản lượng tối thiểu để đạt được mức giá đó",
        "Cho biết có thể rút ngắn thời gian giao hay không",
      ],
      deadline: "Phản hồi trong ngày hôm nay",
    },
  },

  confirmed: {
    buyer: {
      subject: "Order confirmed – deposit received for {product}",
      body: [
        "We are pleased to confirm that your Proforma Invoice has been signed and the deposit has been received. Your order is now formally in our execution schedule.",
        "For your records, payment for this order follows the agreed terms: {payment}.",
        "From this point you will receive an update at every milestone until the goods reach {port}.",
      ],
      action:
        "We will send the production plan within 48 hours and keep you informed at each stage, including photographs before packing.",
    },
    supplier: {
      subject: "ĐƠN ĐÃ CHỐT – xác nhận lịch sản xuất {product}",
      body: [
        "Buyer đã ký PI và chúng tôi đã nhận tiền cọc. Đơn {product} với số lượng {quantity} chính thức được triển khai.",
        "Đây là đơn chắc chắn. Mọi thay đổi về giá, quy cách hoặc lịch giao đều phải được thông báo và thống nhất trước khi thực hiện.",
      ],
      tasks: [
        "Xác nhận ngày bắt đầu và ngày hoàn thành sản xuất",
        "Gửi kế hoạch sản xuất chi tiết theo từng tuần",
        "Chốt lại quy cách đóng gói và nhãn mác theo yêu cầu của đơn",
        "Đối soát tiền cọc và nắm điều khoản thanh toán phần còn lại ({payment_vi})",
      ],
      deadline: "Xác nhận trong 48 giờ",
    },
  },

  production: {
    buyer: {
      subject: "Production update – {product} is in progress",
      body: [
        "Your order is now in production. Our QC staff follows the process on site so that every lot matches the sample you approved.",
        "Any deviation found during production is corrected before packing, not after arrival.",
      ],
      action:
        "We will send photographs at each stage and arrange the pre-shipment inspection before the goods are packed.",
    },
    supplier: {
      subject: "Đang sản xuất – cập nhật tiến độ {product}",
      body: [
        "Đơn {product} đang trong giai đoạn sản xuất. Buyer được cập nhật tiến độ thường xuyên nên thông tin từ xưởng cần chính xác và đúng hạn.",
        "Nếu phát hiện rủi ro trễ lịch, hãy báo ngay khi vừa phát hiện — báo sớm chúng tôi còn xử lý được với buyer.",
      ],
      tasks: [
        "Cập nhật tiến độ hằng tuần kèm hình ảnh thực tế tại xưởng",
        "Báo ngay mọi rủi ro về nguyên liệu, thời tiết hoặc công suất",
        "Chuẩn bị hồ sơ kiểm hàng (COA, kết quả test) nếu đơn yêu cầu",
      ],
      deadline: "Cập nhật trước 16h thứ Sáu hằng tuần",
    },
  },

  shipping: {
    buyer: {
      subject: "Your shipment has departed – documents for {product}",
      body: [
        "We are pleased to confirm that your goods have been loaded and the shipment has departed for {port}. Vessel and voyage details are included in this notification.",
        "The full set of shipping documents is now being prepared for you.",
      ],
      action:
        "We will send the Bill of Lading, Commercial Invoice, Packing List and Certificate of Origin as soon as they are issued — ahead of the vessel's arrival.",
    },
    supplier: {
      subject: "Hàng đã xuất – hoàn tất chứng từ gốc {product}",
      body: [
        "Hàng của đơn {product} đã được xếp lên tàu. Phần còn lại là chứng từ — đây là phần quyết định việc thanh toán nên phải làm chính xác tuyệt đối.",
        "Mọi sai sót trên chứng từ gốc sẽ khiến buyer không nhận được hàng tại cảng đến.",
      ],
      tasks: [
        "Gửi chứng từ gốc về văn phòng Vexim trong thời hạn quy định",
        "Đối chiếu số container, số seal và số lượng với Packing List đã duyệt",
        "Hoàn tất hoá đơn và các chứng nhận theo yêu cầu của đơn",
      ],
      deadline: "Trong 3 ngày làm việc sau khi tàu chạy",
    },
  },

  completed: {
    buyer: {
      subject: "Order completed – thank you for your trust",
      body: [
        "Your order has been completed, the goods received and payment settled. Thank you for choosing Vexim Trade as your sourcing partner in Vietnam.",
        "We keep the full record of the specification and production lot used for this order, so a repeat order can start exactly where we finished.",
      ],
      action:
        "Send us your forecast for the next quarter and we will reserve production slots in advance, before the new crop prices are set.",
    },
    supplier: {
      subject: "Hoàn tất đơn {product} – cảm ơn hợp tác",
      body: [
        "Đơn {product} đã hoàn tất và thanh toán xong. Chất lượng và tiến độ của xưởng ở đơn này đã được ghi nhận vào hồ sơ đánh giá nhà cung cấp.",
        "Chúng tôi sẽ ưu tiên gửi đơn tiếp theo cho xưởng.",
      ],
      tasks: [
        "Đối chiếu công nợ còn lại (nếu có) với phòng kế toán",
        "Cập nhật năng lực sản xuất dự kiến cho vụ tới",
      ],
      deadline: "Không gấp",
    },
  },

  lost: {
    buyer: { subject: "", body: [], action: "" },
    supplier: { subject: "", body: [], tasks: [], deadline: "" },
  },
};
