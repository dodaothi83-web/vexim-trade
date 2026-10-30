/** Process one user action in bounded batches; report partial successes without hiding failures. */
export async function checkSelectedImages(
  productId: string,
  ids: string[],
  check: (productId: string, ids: string[]) => Promise<{ checked: string[]; failed: { id: string; message: string }[] }>,
) {
  const checked: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    try {
      const result = await check(productId, batch);
      checked.push(...result.checked);
      failed.push(...result.failed);
    } catch {
      failed.push(...batch.map((id) => ({ id, message: "Không kết nối được máy chủ. Hãy tải lại để kiểm tra trạng thái trước khi thử lại." })));
    }
  }
  return { checked, failed };
}
