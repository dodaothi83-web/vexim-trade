import type { Category } from "@/lib/types";

function categoryName(cat: Category, lang: "en" | "vi", fallback: string): string {
  const names = cat.name_i18n;
  if (!names || typeof names !== "object") return fallback;
  const value = lang === "vi"
    ? (names.vi ?? names.en ?? Object.values(names)[0])
    : (names.en ?? names.vi ?? Object.values(names)[0]);
  return typeof value === "string" ? value : fallback;
}

/** Tên hiển thị tiếng Anh chuẩn thương mại B2B cho các danh mục thực phẩm & nông sản */
const CATEGORY_EN_NAMES: Record<string, string> = {
  cashew: "Cashew Kernels & Value-Added Cashew",
  "nuts-kernels": "Nutritional Nuts & Kernels",
  macadamia: "Central Highlands Macadamia Nuts",
  coffee: "Green Coffee Beans & Roasted Coffee",
  pepper: "Vietnamese Black & White Pepper",
  "pepper-spices": "Pepper & Natural Spices",
  cinnamon: "Cassia Cinnamon & Star Anise",
  "star-anise": "Lang Son Whole Star Anise",
  coconut: "Ben Tre Coconut Products",
  rice: "Fragrant & Export Rice Products",
  noodles: "Dried Rice Noodles, Vermicelli & Rice Paper",
  "fruit-veg": "Processed & IQF Fruits & Vegetables",
  "dragon-fruit": "Fresh & IQF Dragon Fruit",
  "dried-fruit": "Soft-Dried & Crispy Fruit Snacks",
  seafood: "Frozen Export Seafood",
  pangasius: "Frozen Pangasius Fillets",
  shrimp: "Black Tiger & Vannamei Shrimp",
  honey: "Natural Export Honey",
  tea: "Green Tea, Black Tea & Oolong Tea",
  "processed-foods": "Processed & Packaged Foods",
};

/** Tên hiển thị tiếng Việt ưu tiên theo slug cho danh mục thực phẩm Việt Nam */
const CATEGORY_VI_NAMES: Record<string, string> = {
  cashew: "Hạt điều & Nhân điều xuất khẩu",
  "nuts-kernels": "Các loại hạt dinh dưỡng",
  macadamia: "Hạt mắc ca Tây Nguyên",
  coffee: "Cà phê Nhân xanh & Rang xay",
  pepper: "Hồ tiêu & Gia vị Việt Nam",
  "pepper-spices": "Hồ tiêu & Gia vị tự nhiên",
  cinnamon: "Quế & Hoa hồi xuất khẩu",
  "star-anise": "Hoa hồi Lạng Sơn",
  coconut: "Sản phẩm từ Dừa Bến Tre",
  rice: "Gạo xuất khẩu & Chế phẩm từ gạo",
  noodles: "Bún, Phở khô & Bánh tráng",
  "fruit-veg": "Trái cây & Rau củ chế biến",
  "dragon-fruit": "Thanh long tươi & đông lạnh",
  "dried-fruit": "Trái cây sấy dẻo & sấy giòn",
  seafood: "Thủy hải sản đông lạnh xuất khẩu",
  pangasius: "Cá tra phi lê đông lạnh",
  shrimp: "Tôm sú & Tôm thẻ chân trắng",
  honey: "Mật ong tự nhiên xuất khẩu",
  tea: "Trà xanh, Trà đen & Trà Ô long",
  "processed-foods": "Thực phẩm chế biến & Đóng gói",
};

export function getCategoryTitle(cat: Category, lang: "en" | "vi"): string {
  if (lang === "vi") {
    return CATEGORY_VI_NAMES[cat.slug] || categoryName(cat, "vi", cat.slug);
  }
  return categoryName(cat, "en", CATEGORY_EN_NAMES[cat.slug] || cat.slug);
}
