#!/usr/bin/env node
// Server tĩnh để xem thử site trên máy, hành xử giống GitHub Pages:
//   thư mục → index.html, thư mục thiếu "/" cuối → 301, không có file → 404.html (mã 404),
//   không phục vụ thư mục/tệp ẩn (.git, .superpowers…).
// Cách dùng: node tools/serve.mjs [cổng]      (mặc định 8080; hoặc biến môi trường PORT)
// Mặc định chỉ mở cho chính máy này (127.0.0.1). Xem thử trên điện thoại cùng Wi-Fi: HOST=0.0.0.0 npm start

import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { isMain } from "./util.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function createServer(rootDir) {
  const root = resolve(rootDir);

  return createHttpServer(async (req, res) => {
    const send = (status, body, type, headers = {}) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers });
      res.end(body);
    };
    const notFound = async () => {
      try {
        send(404, await readFile(join(root, "404.html")), TYPES[".html"]);
      } catch {
        send(404, "404 Not Found", TYPES[".txt"]);
      }
    };

    const url = new URL(req.url, "http://localhost");
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return send(400, "400 Bad Request", TYPES[".txt"]);
    }
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) return notFound();
    if (file.slice(root.length).split(sep).some((part) => part.startsWith("."))) return notFound();

    try {
      const info = await stat(file);
      if (info.isDirectory()) {
        if (!url.pathname.endsWith("/")) return send(301, "", TYPES[".txt"], { location: `${url.pathname}/${url.search}` });
        return send(200, await readFile(join(file, "index.html")), TYPES[".html"]);
      }
      return send(200, await readFile(file), TYPES[extname(file).toLowerCase()] || "application/octet-stream");
    } catch {
      return notFound();
    }
  });
}

if (isMain(import.meta.url)) {
  const port = Number(process.argv[2]) || Number(process.env.PORT) || 8080;
  const host = process.env.HOST || "127.0.0.1";
  createServer(".").listen(port, host, () => {
    const shown = host === "0.0.0.0" ? "<địa-chỉ-IP-của-máy>" : host === "127.0.0.1" ? "localhost" : host;
    console.log(`Đang chạy: http://${shown}:${port}/   (Ctrl+C để dừng)`);
  });
}
