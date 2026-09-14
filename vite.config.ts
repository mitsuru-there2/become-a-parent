import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: { ignorePatterns: ["docs/**", "assets/**"] },
  test: { include: ["tests/**/*.test.ts"] },
});
