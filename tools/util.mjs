// Tiện ích dùng chung cho các script trong tools/.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// true khi file `importMetaUrl` được chạy trực tiếp bằng `node <file>` (không phải bị import).
export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  const a = resolve(process.argv[1]);
  const b = fileURLToPath(importMetaUrl);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
