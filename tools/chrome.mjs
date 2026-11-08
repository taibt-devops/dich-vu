// Điều khiển Chrome/Edge headless qua Chrome DevTools Protocol — không cần thư viện ngoài
// (dùng WebSocket có sẵn trong Node 22+). Dùng cho tools/screenshots.mjs và tools/render-images.mjs.
//
//   await withChrome(async (browser) => {
//     const page = await browser.newPage();
//     await page.goto(url, { width: 390, height: 844 });
//     const png = await page.screenshot();
//   });
//
// Tìm trình duyệt theo biến môi trường CHROME_PATH, hoặc các đường dẫn cài đặt phổ biến.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = process.env;
const CANDIDATES = {
  win32: [
    `${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
  ],
};

export function findChrome() {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const found = (CANDIDATES[process.platform] || []).find((p) => existsSync(p));
  if (!found) throw new Error("Không tìm thấy Chrome/Edge. Đặt biến môi trường CHROME_PATH trỏ tới file chạy của trình duyệt.");
  return found;
}

function waitForDevToolsUrl(proc) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chrome không khởi động được sau 30 giây")), 30000);
    proc.stderr.on("data", (chunk) => {
      output += chunk;
      const m = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome thoát sớm (mã ${code}): ${output.slice(-500)}`));
    });
  });
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const listeners = new Set();
    let lastId = 0;
    ws.onopen = () =>
      resolve({
        send(method, params = {}, sessionId) {
          const id = ++lastId;
          ws.send(JSON.stringify({ id, method, params, sessionId }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        on(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close: () => ws.close(),
      });
    ws.onerror = () => reject(new Error(`Không kết nối được DevTools tại ${wsUrl}`));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${method}: ${msg.error.message}`));
        else res(msg.result);
      } else if (msg.method) {
        for (const listener of listeners) listener(msg);
      }
    };
  });
}

function pageApi(cdp, targetId, sessionId) {
  const send = (method, params) => cdp.send(method, params, sessionId);
  const problems = []; // lỗi JS và lỗi tải tài nguyên trong lần mở trang gần nhất
  const waiters = new Set();
  const off = cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      problems.push({ type: "js", text: d.exception?.description || d.text });
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      const e = msg.params.entry;
      problems.push({ type: e.source === "network" ? "network" : "console", text: `${e.text} ${e.url || ""}`.trim() });
    }
    for (const waiter of waiters) waiter(msg);
  });
  const waitFor = (method, timeout = 30000) =>
    new Promise((resolve, reject) => {
      const handler = (msg) => {
        if (msg.method !== method) return;
        clearTimeout(timer);
        waiters.delete(handler);
        resolve(msg.params);
      };
      const timer = setTimeout(() => {
        waiters.delete(handler);
        reject(new Error(`Hết thời gian chờ ${method}`));
      }, timeout);
      waiters.add(handler);
    });

  const page = {
    problems,
    send,
    async evaluate(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url, { width = 390, height = 844, mobile = width < 700, scale = 1, transparent = false } = {}) {
      problems.length = 0;
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
      if (transparent) await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const loaded = waitFor("Page.loadEventFired");
      const nav = await send("Page.navigate", { url });
      if (nav.errorText) throw new Error(`Không mở được ${url}: ${nav.errorText}`);
      await loaded;
      await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
      await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    },
    async screenshot({ clip } = {}) {
      const params = { format: "png", captureBeyondViewport: Boolean(clip) };
      if (clip) params.clip = { scale: 1, ...clip };
      const { data } = await send("Page.captureScreenshot", params);
      return Buffer.from(data, "base64");
    },
    async close() {
      off();
      await cdp.send("Target.closeTarget", { targetId }).catch(() => {});
    },
  };
  return page;
}

export async function withChrome(fn) {
  const profile = mkdtempSync(join(tmpdir(), "chrome-profile-"));
  const proc = spawn(
    findChrome(),
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--hide-scrollbars",
      "--mute-audio",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  let cdp;
  try {
    cdp = await connect(await waitForDevToolsUrl(proc));
    const browser = {
      async newPage() {
        const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
        const page = pageApi(cdp, targetId, sessionId);
        await page.send("Page.enable");
        await page.send("Runtime.enable");
        await page.send("Log.enable");
        return page;
      },
    };
    return await fn(browser);
  } finally {
    if (cdp) {
      await Promise.race([cdp.send("Browser.close").catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
      cdp.close();
    }
    if (proc.exitCode === null) proc.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
