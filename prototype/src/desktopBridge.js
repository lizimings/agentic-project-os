export const desktopBridge = {
  available: Boolean(window.pccDesktop),
  selectDirectory: async (defaultPath = "") => window.pccDesktop?.selectDirectory({ defaultPath }) ?? null,
  getRuntimeInfo: async () => window.pccDesktop?.getRuntimeInfo() ?? { available: false, platform: navigator.platform },
  setLaunchAtLogin: async (enabled) => window.pccDesktop?.setLaunchAtLogin(Boolean(enabled)) ?? { applied: false, enabled: Boolean(enabled) },
  setMinimizeToTray: async (enabled) => window.pccDesktop?.setMinimizeToTray(Boolean(enabled)) ?? { applied: false, enabled: Boolean(enabled) },
  openPath: async (targetPath) => window.pccDesktop?.openPath(targetPath) ?? { opened: false },
  restartApp: async () => window.pccDesktop?.restartApp() ?? { restarting: false },
};
