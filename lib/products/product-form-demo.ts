import type { ProductFormDraft } from "@/lib/products/product-form-model";

/** Local demo fixtures only. Importing this file never writes to the database. */
export type ProductFormDemo = {
  label: string;
  englishName: string;
  imagePath: string;
  draft: ProductFormDraft;
};

const defaults = {
  spec: "", rawMaterialRegion: "", inputMaterialOrigin: "Việt Nam", incoterm: "FOB", incotermPlace: "Hồ Chí Minh",
  pricePubliclyVisible: true, priceConsent: true, paymentTerms: "T/T", oem: false, odm: false, samples: true,
  packaging: "", exportPort: "Cát Lái", leadTimeDays: "14", monthlyCapacityKg: "50,000", descriptionDetail: "",
  attributes: {}, attributePool: "[]", customGrade: false,
};

export const PRODUCT_FORM_DEMOS: ProductFormDemo[] = [
  { label: "Nhân điều demo", englishName: "Vietnamese white cashew kernels", imagePath: "/images/categories/cashew-grade.jpg", draft: {
    ...defaults, name: "Nhân điều trắng", category: "cashew-kernels", grade: "W320", unit: "kg",
    tiers: [{ quantity: "1,000", price: "6.40" }, { quantity: "5,000", price: "6.20" }, { quantity: "10,000", price: "6.00" }],
    description: "Nhân điều chế biến tại Việt Nam, đóng gói phục vụ xuất khẩu.", rawMaterialRegion: "Bình Phước", packaging: "Túi hút chân không trong thùng carton",
  } },
  { label: "Hồ tiêu demo", englishName: "Vietnamese black pepper", imagePath: "/images/categories/pepper.jpg", draft: {
    ...defaults, name: "Hồ tiêu đen", category: "pepper", grade: "500 g/L", unit: "mt",
    tiers: [{ quantity: "1", price: "4000.00" }, { quantity: "5", price: "3900.00" }],
    description: "Hồ tiêu đen đã làm sạch, phù hợp đơn hàng xuất khẩu.", rawMaterialRegion: "Đắk Lắk", packaging: "Bao dệt",
  } },
  { label: "Quế demo", englishName: "Vietnamese whole cinnamon", imagePath: "/images/categories/cinnamon.jpg", draft: {
    ...defaults, name: "Quế ống", category: "cinnamon-star-anise", grade: "Cassia whole", unit: "kg",
    tiers: [{ quantity: "500", price: "3.20" }, { quantity: "2,000", price: "3.00" }],
    description: "Quế ống phơi khô từ vùng nguyên liệu Việt Nam.", rawMaterialRegion: "Yên Bái", packaging: "Thùng carton",
  } },
];
