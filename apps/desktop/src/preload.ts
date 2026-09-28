import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pccDesktop", {
  selectDirectory: (input: { defaultPath?: string }) => ipcRenderer.invoke("pcc:select-directory", { defaultPath: typeof input?.defaultPath === "string" ? input.defaultPath : "" }),
  getRuntimeInfo: () => ipcRenderer.invoke("pcc:get-runtime-info"),
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke("pcc:set-launch-at-login", Boolean(enabled)),
  setMinimizeToTray: (enabled: boolean) => ipcRenderer.invoke("pcc:set-minimize-to-tray", Boolean(enabled)),
  openPath: (targetPath: string) => ipcRenderer.invoke("pcc:open-path", typeof targetPath === "string" ? targetPath : ""),
  restartApp: () => ipcRenderer.invoke("pcc:restart-app"),
});
