import { describe, expect, it, vi } from "vitest";
import { registerDesktopIpc, trustedRenderer } from "./ipc";

function fixture() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: ["C:\\work\\repo"] }));
  const openPath = vi.fn(async () => "");
  const restartApp = vi.fn();
  let tray = true;
  let openAtLogin = false;
  const app = {
    isPackaged: false,
    getPath: vi.fn((name: string) => name === "documents" ? "C:\\Users\\demo\\Documents" : "C:\\Users\\demo\\AppData"),
    getVersion: vi.fn(() => "0.1.0"),
    setLoginItemSettings: vi.fn((input: { openAtLogin: boolean }) => { openAtLogin = input.openAtLogin; }),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin })),
  };
  registerDesktopIpc({
    app: app as any,
    dialog: { showOpenDialog } as any,
    ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) } as any,
    shell: { openPath } as any,
    getMainWindow: () => null,
    getMinimizeToTray: () => tray,
    setMinimizeToTray: (enabled) => { tray = enabled; },
    restartApp,
    rendererPort: 4318,
  });
  const event = { senderFrame: { url: "http://127.0.0.1:4318/settings" }, sender: { getURL: () => "" } } as any;
  return { handlers, showOpenDialog, openPath, restartApp, app, event };
}

describe("desktop IPC boundary", () => {
  it("only trusts the two local renderer origins", () => {
    const event = (url: string) => ({ senderFrame: { url }, sender: { getURL: () => url } }) as any;
    expect(trustedRenderer(event("http://127.0.0.1:4318/projects"), 4318)).toBe(true);
    expect(trustedRenderer(event("http://localhost:4173/projects"), 4318)).toBe(true);
    expect(trustedRenderer(event("https://127.0.0.1:4318/projects"), 4318)).toBe(false);
    expect(trustedRenderer(event("http://example.test:4318/projects"), 4318)).toBe(false);
  });

  it("opens an operating-system directory picker and validates the default path", async () => {
    const { handlers, showOpenDialog, event } = fixture();
    const select = handlers.get("pcc:select-directory")!;
    await expect(select(event, { defaultPath: "C:\\source" })).resolves.toEqual({ canceled: false, path: "C:\\work\\repo" });
    expect(showOpenDialog).toHaveBeenCalledWith(null, expect.objectContaining({
      defaultPath: "C:\\source",
      properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
    }));
    await select(event, { defaultPath: "..\\relative" });
    expect(showOpenDialog).toHaveBeenLastCalledWith(null, expect.objectContaining({ defaultPath: "C:\\Users\\demo\\Documents" }));
  });

  it("applies runtime preferences and rejects untrusted or relative path calls", async () => {
    const { handlers, event, app, openPath } = fixture();
    expect(handlers.get("pcc:set-launch-at-login")!(event, true)).toEqual({ applied: true, enabled: true });
    expect(app.setLoginItemSettings).toHaveBeenCalledWith(expect.objectContaining({ openAtLogin: true }));
    expect(handlers.get("pcc:set-minimize-to-tray")!(event, false)).toEqual({ applied: true, enabled: false });
    await expect(handlers.get("pcc:open-path")!(event, "relative/path")).resolves.toEqual({ opened: false, error: "路径必须是本机绝对路径" });
    expect(openPath).not.toHaveBeenCalled();
    const remote = { senderFrame: { url: "http://example.test:4318" }, sender: { getURL: () => "" } } as any;
    expect(() => handlers.get("pcc:get-runtime-info")!(remote)).toThrow("IPC 来源不是");
  });

  it("only schedules an application restart from a trusted renderer", async () => {
    const { handlers, event, restartApp } = fixture();
    expect(handlers.get("pcc:restart-app")!(event)).toEqual({ restarting: true });
    await new Promise((resolve) => setImmediate(resolve));
    expect(restartApp).toHaveBeenCalledOnce();
  });
});
