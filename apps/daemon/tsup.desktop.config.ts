import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/desktop-entry.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node22",
  outExtension: () => ({ js: ".js" }),
  sourcemap: true,
  clean: true,
  noExternal: [/^(?!better-sqlite3(?:\/|$)).+/],
  external: ["better-sqlite3"],
});
