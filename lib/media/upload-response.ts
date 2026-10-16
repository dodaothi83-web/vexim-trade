/** Read an upload endpoint response without assuming Vercel/proxies return JSON on errors. */
export async function readUploadResponse<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const content = await response.text();
  let data: unknown;
  try {
    data = content ? JSON.parse(content) : null;
  } catch {
    data = null;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) return data as T;

  const status = response.status;
  if (status === 413) {
    throw new Error("Ảnh quá lớn để tải lên (HTTP 413). Vui lòng chọn ảnh nhỏ hơn hoặc nén ảnh rồi thử lại.");
  }
  if (status === 401 || status === 403) {
    throw new Error(`Phiên đăng nhập hoặc quyền tải ảnh không hợp lệ (HTTP ${status}). Vui lòng đăng nhập lại.`);
  }
  throw new Error(
    `Máy chủ không trả về dữ liệu upload hợp lệ (HTTP ${status}). ` +
    "Vui lòng thử lại; nếu vẫn lỗi, báo quản trị viên kiểm tra log máy chủ và Supabase Storage.",
  );
}
