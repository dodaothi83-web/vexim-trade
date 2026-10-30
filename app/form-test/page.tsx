import { notFound } from "next/navigation";
import { isIsolatedProductFormDemo } from "@/lib/products/product-form-demo-access";
import { ProductFormTest } from "./product-form-test";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bản test form sản phẩm", robots: { index: false, follow: false } };

export default function ProductFormTestPage() {
  if (!isIsolatedProductFormDemo()) notFound();
  return <ProductFormTest />;
}
