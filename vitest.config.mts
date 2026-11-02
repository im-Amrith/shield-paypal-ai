import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { SHIELD_DB_PATH: "data/test-db.json", SHIELD_FORCE_MOCK: "1" },
    fileParallelism: false,
  },
});
