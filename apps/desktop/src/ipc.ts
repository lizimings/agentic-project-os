import path from "node:path";
import type { App, BrowserWindow, Dialog, IpcMain, IpcMainInvokeEvent, Shell } from "electron";

type RegisterDesktopIpcOptions = {
  app: App;
  dialog: Dialog;
  ipcMain: IpcMain;
  shell: Shell;
  getMainWindow: () => BrowserWindow | null;
  getMinimizeToTray: () => boolean;
  setMinimizeToTray: (enabled: boolean) => void;
  restartApp: () => void;
  rendererPort: number;
};

export function trustedRenderer(event: IpcMainInvokeEvent, rendererPort: number) {
  try {
    const url = new URL(event.senderFrame?.url || event.sender.getURL());
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) && ["4173", String(rendererPort)].includes(url.port);
  } catch {
    return false;
  }
}

export function registerDesktopIpc(options: RegisterDesktopIpcOptions) {
  const assertTrusted = (event: IpcMainInvokeEvent) => {
    if (!trustedRenderer(event, options.rendererPort)) throw new Error("IPC 来源不是 Agentic Project OS 本地界面");
  };

  options.ipcMain.handle("pcc:select-directory", async (event, input: { defaultPath?: unknown }) => {
    assertTrusted(event);
    const requested = typeof input?.defaultPath === "string" && input.defaultPath.length < 4096 && path.isAbsolute(input.defaultPath)
      ? input.defaultPath
      : options.app.getPath("documents");
    const result = await options.dialog.showOpenDialog(options.getMainWindow()!, {
      title: "选择项目 Git 工作区",
      defaultPath: requested,
      properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
    });
    return { canceled: result.canceled, path: result.filePaths[0] ?? null };
  });

  options.ipcMain.handle("pcc:get-runtime-info", (event) => {
    assertTrusted(event);
    return {
      available: true,
      version: options.app.getVersion(),
      platform: process.platform,
      packaged: options.app.isPackaged,
      dataDirectory: options.app.getPath("userData"),
    };
  });

  options.ipcMain.handle("pcc:set-launch-at-login", (event, enabled: boolean) => {
    assertTrusted(event);
    options.app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath });
    return { applied: true, enabled: options.app.getLoginItemSettings().openAtLogin };
  });

  options.ipcMain.handle("pcc:set-minimize-to-tray", (event, enabled: boolean) => {
    assertTrusted(event);
    options.setMinimizeToTray(Boolean(enabled));
    return { applied: true, enabled: options.getMinimizeToTray() };
  });

  options.ipcMain.handle("pcc:open-path", async (event, targetPath: string) => {
    assertTrusted(event);
    if (typeof targetPath !== "string" || targetPath.length > 4096 || !path.isAbsolute(targetPath)) {
      return { opened: false, error: "路径必须是本机绝对路径" };
    }
    const error = await options.shell.openPath(targetPath);
    return { opened: !error, ...(error ? { error } : {}) };
  });

  options.ipcMain.handle("pcc:restart-app", (event) => {
    assertTrusted(event);
    setImmediate(options.restartApp);
    return { restarting: true };
  });
}
