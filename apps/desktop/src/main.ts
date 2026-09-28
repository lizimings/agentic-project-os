import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, statSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import path from "node:path";
import process from "node:process";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import { registerDesktopIpc } from "./ipc";

const currentDirectory = __dirname;
const daemonUrl = process.env.PCC_DAEMON_URL || "http://127.0.0.1:4317";
const daemonEndpoint = new URL(daemonUrl);
if (daemonEndpoint.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(daemonEndpoint.hostname)) {
  throw new Error("PCC_DAEMON_URL 必须指向本机 HTTP 地址");
}
const daemonPort = Number(daemonEndpoint.port || 80);
const rendererPort = Number(process.env.PCC_DESKTOP_PORT || 4318);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let staticServer: Server | null = null;
let daemonChild: ChildProcess | null = null;
let quitting = false;
let minimizeToTray = true;

async function healthy() {
  try {
    const response = await fetch(`${daemonUrl}/health`, { signal: AbortSignal.timeout(1_200) });
    const body = await response.json() as { status?: string; service?: string };
    return response.ok && body.status === "ok" && body.service === "projectd";
  } catch { return false; }
}

function daemonEntry() {
  const candidates = [
    process.env.PCC_DAEMON_ENTRY,
    app.isPackaged ? path.join(process.resourcesPath, "daemon", "index.js") : undefined,
    path.resolve(currentDirectory, "../../daemon/dist/index.js"),
    path.resolve(currentDirectory, "../../../apps/daemon/dist/index.js"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate));
}

async function ensureDaemon() {
  if (await healthy()) return;
  const entry = daemonEntry();
  if (!entry) throw new Error("projectd 尚未构建，请先运行 pnpm --filter @pcc/daemon build");
  const dataDirectory = process.env.PCC_DATA_DIR || path.join(app.getPath("userData"), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const daemonLog = openSync(path.join(dataDirectory, "projectd.log"), "a");
  daemonChild = spawn(process.execPath, [entry], {
    stdio: ["ignore", daemonLog, daemonLog],
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PCC_DATA_DIR: dataDirectory, PCC_PORT: String(daemonPort), PCC_HOST: daemonEndpoint.hostname },
  });
  closeSync(daemonLog);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (await healthy()) return;
    if (daemonChild.exitCode !== null) break;
  }
  throw new Error("projectd 在 15 秒内没有就绪");
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function webRoot() {
  const candidates = [
    process.env.PCC_WEB_ROOT,
    app.isPackaged ? path.join(process.resourcesPath, "web") : undefined,
    path.resolve(currentDirectory, "../../../prototype/dist/client"),
    path.resolve(currentDirectory, "../../../../prototype/dist/client"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
}

async function startStaticServer() {
  const root = webRoot();
  if (!root) throw new Error("Web 构建不存在，请先运行 pnpm --filter @pcc/web build");
  const canonicalRoot = path.resolve(root);
  staticServer = createServer((incoming, outgoing) => {
    const requestUrl = new URL(incoming.url || "/", `http://127.0.0.1:${rendererPort}`);
    if (requestUrl.pathname === "/health" || requestUrl.pathname.startsWith("/api/")) {
      const upstream = new URL(`${requestUrl.pathname}${requestUrl.search}`, daemonUrl);
      const proxy = httpRequest(upstream, { method: incoming.method, headers: { ...incoming.headers, host: upstream.host } }, (response) => {
        outgoing.writeHead(response.statusCode || 502, response.headers);
        response.pipe(outgoing);
      });
      proxy.on("error", () => { outgoing.writeHead(502, { "content-type": "application/json" }); outgoing.end(JSON.stringify({ error: "DAEMON_UNREACHABLE", message: "projectd 暂时不可达" })); });
      incoming.pipe(proxy);
      return;
    }
    let candidate = path.resolve(canonicalRoot, `.${decodeURIComponent(requestUrl.pathname)}`);
    if (!candidate.startsWith(canonicalRoot) || !existsSync(candidate) || statSync(candidate).isDirectory()) candidate = path.join(canonicalRoot, "index.html");
    outgoing.writeHead(200, { "content-type": mimeTypes[path.extname(candidate).toLowerCase()] || "application/octet-stream", "cache-control": candidate.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" });
    createReadStream(candidate).pipe(outgoing);
  });
  await new Promise<void>((resolve, reject) => {
    staticServer!.once("error", reject);
    staticServer!.listen(rendererPort, "127.0.0.1", () => resolve());
  });
}

async function loadPreferences() {
  try {
    const response = await fetch(`${daemonUrl}/api/settings/preferences`);
    if (response.ok) minimizeToTray = Boolean((await response.json() as { minimizeToTray?: boolean }).minimizeToTray);
  } catch { /* daemon health already surfaces startup failures */ }
}

function createTray() {
  if (tray) return;
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, "web", "assets", "project-mark.png") : undefined,
    path.resolve(currentDirectory, "../../../prototype/public/assets/project-mark.png"),
    path.resolve(currentDirectory, "../../../../prototype/public/assets/project-mark.png"),
  ].filter((candidate): candidate is string => typeof candidate === "string" && existsSync(candidate));
  const icon = candidates[0] ? nativeImage.createFromPath(candidates[0]).resize({ width: 20, height: 20 }) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Agentic Project OS");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 Agentic Project OS", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    { label: "退出", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("double-click", () => { mainWindow?.show(); mainWindow?.focus(); });
}

function createWindow(rendererUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#f5f7fa",
    title: "Agentic Project OS",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (["http:", "https:"].includes(new URL(url).protocol)) void shell.openExternal(url); return { action: "deny" }; });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    if (!target.hostname || !["127.0.0.1", "localhost"].includes(target.hostname)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!quitting && minimizeToTray) { event.preventDefault(); mainWindow?.hide(); }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  void mainWindow.loadURL(rendererUrl);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { mainWindow?.show(); mainWindow?.focus(); });
  app.on("before-quit", () => { quitting = true; });
  app.on("window-all-closed", () => { if (process.platform !== "darwin" && !minimizeToTray) app.quit(); });
  app.on("will-quit", () => { tray?.destroy(); staticServer?.close(); if (daemonChild && daemonChild.exitCode === null) daemonChild.kill("SIGTERM"); });
  app.whenReady().then(async () => {
    registerDesktopIpc({
      app,
      dialog,
      ipcMain,
      shell,
      getMainWindow: () => mainWindow,
      getMinimizeToTray: () => minimizeToTray,
      setMinimizeToTray: (enabled) => { minimizeToTray = enabled; },
      restartApp: () => { quitting = true; app.relaunch(); app.quit(); },
      rendererPort,
    });
    await ensureDaemon();
    await loadPreferences();
    const rendererUrl = process.env.PCC_WEB_URL || (app.isPackaged ? `http://127.0.0.1:${rendererPort}` : "http://127.0.0.1:4173");
    if (!process.env.PCC_WEB_URL && app.isPackaged) await startStaticServer();
    createTray();
    createWindow(rendererUrl);
    app.on("activate", () => { if (!mainWindow) createWindow(rendererUrl); else mainWindow.show(); });
  }).catch((error) => {
    void dialog.showMessageBox({ type: "error", title: "Agentic Project OS 启动失败", message: error instanceof Error ? error.message : String(error) }).finally(() => app.quit());
  });
}
