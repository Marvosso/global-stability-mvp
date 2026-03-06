import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "lib/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    server: {
      deps: {
        external: ["next"],
      },
    },
  },
  resolve: {
    alias: {
      "next/server": path.resolve(__dirname, "node_modules/next/server.js"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
