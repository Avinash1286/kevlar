import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "convex/_generated/**",
    ],
  },
]);
