import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "convex/phase12.test.ts"],
    environment: "node",
  },
});
