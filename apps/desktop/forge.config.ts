import path from "node:path";
import os from "node:os";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    asar: { unpack: "**/*.node" },
    executableName: "AgenticProjectOS",
    ignore: [
      /^\/node_modules($|\/)/,
      /^\/src($|\/)/,
      /^\/scripts($|\/)/,
      /^\/resources($|\/)/,
      /^\/out($|\/)/,
      /\.test\.ts$/,
    ],
    extraResource: [
      path.resolve(__dirname, "resources/web"),
      path.resolve(__dirname, "resources/daemon"),
      path.resolve(__dirname, "../../LICENSE"),
    ],
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", platforms: ["win32"], config: { name: "agentic_project_os", authors: "Agentic Project OS contributors", description: "Agent-native project management for humans and AI agents", vendorDirectory: path.join(os.tmpdir(), "pcc-winstaller-vendor") } },
    { name: "@electron-forge/maker-zip", platforms: ["win32"], config: {} },
  ],
};

export default config;
