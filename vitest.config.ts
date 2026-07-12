import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], exclude: ["node_modules", "outputs", ".next"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
