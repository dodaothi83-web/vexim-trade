import { createHash } from "node:crypto";
import type { LegacySplitPlan } from "@/lib/products/legacy-grade-split-plan";

/**
 * An adapter must use the intended storage bucket, never local fallback. `read`
 * returns null only for a confirmed missing object, not a network/auth error.
 * `putIfAbsent` must be atomic (e.g. Supabase Storage upload with upsert:false).
 * `isUnreferenced` checks current DB references; the later DB transaction must
 * recheck them under its own locks. These operations do not publish products.
 */
export type SplitMediaIO = {
  read(path: string): Promise<Uint8Array | null>;
  putIfAbsent(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  isUnreferenced(path: string): Promise<boolean>;
};
export type SplitFileReceipt = { sourcePath: string; targetPath: string; sha256: string; bytes: number; mime: string; alreadyPresent: boolean };
export type SplitMediaReceipt = {
  mode: "inspect" | "copy"; sourceId: string; newProductId: string; files: SplitFileReceipt[];
  /** Worst-case object bytes to add based on preflight; excludes DB metadata and concurrent changes. */
  additionalBytesAtPreflight: number;
  totalSourceBytes: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const pathAllowed = (path: string, id: string) => {
  const prefix = `products/${id}/`;
  return path.startsWith(prefix) && /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(path.slice(prefix.length));
};

type Task = { sourcePath: string; targetPath: string; mime: string };
function tasksFor(plan: LegacySplitPlan): Task[] {
  if (!UUID.test(plan.sourceId) || !UUID.test(plan.newProductId) || plan.sourceId.toLowerCase() === plan.newProductId.toLowerCase() ||
      !Array.isArray(plan.assetCopies) || !Array.isArray(plan.assetSnapshots) || plan.assetCopies.length < 1 ||
      plan.assetCopies.length > 8 || plan.assetCopies.length !== plan.assetSnapshots.length)
    throw new Error("Kế hoạch sao chép ảnh không hợp lệ.");
  const snapshots = new Map(plan.assetSnapshots.map((asset) => [asset.id, asset]));
  if (snapshots.size !== plan.assetSnapshots.length) throw new Error("Ảnh gốc bị lặp trong kế hoạch.");
  const tasks: Task[] = [], ids = new Set<string>();
  for (const copy of plan.assetCopies) {
    const asset = snapshots.get(copy.sourceId);
    if (!asset || asset.owner_type !== "product" || asset.kind !== "image" || asset.product_id !== plan.sourceId ||
        asset.supplier_id !== plan.supplierId || asset.storage_path !== copy.sourcePath || asset.thumb_path !== copy.sourceThumbPath ||
        !UUID.test(copy.newId) || ids.has(copy.newId.toLowerCase())) throw new Error("Ảnh gốc hoặc ánh xạ đã thay đổi.");
    ids.add(copy.newId.toLowerCase());
    const add = (sourcePath: string, targetPath: string, thumb: boolean) => {
      if (!pathAllowed(sourcePath, plan.sourceId) || !pathAllowed(targetPath, plan.newProductId)) throw new Error("Đường dẫn ảnh không an toàn.");
      const sourceExt = sourcePath.split(".").at(-1)!.toLowerCase();
      const targetExt = targetPath.split(".").at(-1)!.toLowerCase();
      const expectedTarget = `products/${plan.newProductId}/${copy.newId}${thumb ? "-thumb" : ""}.${sourceExt}`;
      if (targetPath !== expectedTarget || targetExt !== sourceExt || !MIME[sourceExt]) throw new Error("Đường dẫn ảnh mới không khớp ánh xạ.");
      tasks.push({ sourcePath, targetPath, mime: MIME[sourceExt] });
    };
    add(copy.sourcePath, copy.newPath, false);
    if (copy.sourceThumbPath || copy.newThumbPath) {
      if (!copy.sourceThumbPath || !copy.newThumbPath) throw new Error("Thiếu ảnh thu nhỏ trong kế hoạch.");
      add(copy.sourceThumbPath, copy.newThumbPath, true);
    }
  }
  if (new Set(tasks.map((task) => task.sourcePath)).size !== tasks.length || new Set(tasks.map((task) => task.targetPath)).size !== tasks.length)
    throw new Error("Đường dẫn ảnh bị lặp.");
  return tasks;
}

/**
 * Copies objects independently, with checksum verification and no deletion.
 * Not a full split, not a backup, and not a transaction with the database.
 * In inspect mode this performs reads only. On an uncertain upload result, a
 * matching destination can be resumed; never overwrite a different object.
 */
export async function prepareLegacySplitMedia(plan: LegacySplitPlan, io: SplitMediaIO, mode: "inspect" | "copy"): Promise<SplitMediaReceipt> {
  if (mode !== "inspect" && mode !== "copy") throw new Error("Chế độ sao chép không hợp lệ.");
  const tasks = tasksFor(plan);
  const staged: Array<Task & { data: Uint8Array; sha256: string; alreadyPresent: boolean }> = [];
  let totalBytes = 0;
  // Preflight every path before any writes, to avoid a partial copy for a known collision.
  for (const task of tasks) {
    const data = await io.read(task.sourcePath);
    if (!(data instanceof Uint8Array) || data.byteLength < 1 || data.byteLength > MAX_FILE_BYTES)
      throw new Error("Không đọc được ảnh gốc hoặc ảnh vượt giới hạn kiểm tra.");
    totalBytes += data.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Tổng kích thước ảnh vượt giới hạn kiểm tra.");
    if (await io.isUnreferenced(task.targetPath) !== true) throw new Error("Đường dẫn ảnh mới đã được dữ liệu khác sử dụng.");
    const sha256 = hash(data), target = await io.read(task.targetPath);
    if (target && (target.byteLength !== data.byteLength || hash(target) !== sha256)) throw new Error("Ảnh mới đã tồn tại với nội dung khác; không ghi đè.");
    staged.push({ ...task, data: new Uint8Array(data), sha256, alreadyPresent: !!target });
  }
  if (mode === "copy") {
    for (const task of staged) {
      if (await io.isUnreferenced(task.targetPath) !== true) throw new Error("Đường dẫn ảnh mới vừa được sử dụng; dừng sao chép.");
      if (!task.alreadyPresent) {
        try { await io.putIfAbsent(task.targetPath, task.data, task.mime); }
        catch (error) {
          // A timeout may occur after the object was written. Only a confirmed,
          // byte-identical object is safe to regard as a completed retry.
          const target = await io.read(task.targetPath);
          if (!target || target.byteLength !== task.data.byteLength || hash(target) !== task.sha256) throw error;
        }
      }
    }
    // Verify both sides again. Even this cannot make Storage and DB atomic;
    // the future commit path must recheck baselines and never delete originals.
    for (const task of staged) {
      const [source, target, unreferenced] = await Promise.all([io.read(task.sourcePath), io.read(task.targetPath), io.isUnreferenced(task.targetPath)]);
      if (!source || !target || !unreferenced || source.byteLength !== task.data.byteLength || target.byteLength !== task.data.byteLength ||
          hash(source) !== task.sha256 || hash(target) !== task.sha256) throw new Error("Ảnh gốc hoặc ảnh mới thay đổi trong lúc sao chép.");
    }
  }
  return { mode, sourceId: plan.sourceId, newProductId: plan.newProductId,
    totalSourceBytes: totalBytes,
    additionalBytesAtPreflight: staged.reduce((sum, task) => sum + (task.alreadyPresent ? 0 : task.data.byteLength), 0),
    files: staged.map((task) => ({
      sourcePath: task.sourcePath, targetPath: task.targetPath, sha256: task.sha256, bytes: task.data.byteLength, mime: task.mime, alreadyPresent: task.alreadyPresent,
    })) };
}
