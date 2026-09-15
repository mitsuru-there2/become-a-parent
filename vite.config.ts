import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
export default defineConfig({
  plugins: [
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/index.html" } },
      router: {
        generatedRouteTree: "route_tree.gen.ts",
        // URLの動的パラメータと、lower_snake_caseのファイル名を分離する。
        virtualRouteConfig: {
          type: "root",
          file: "root.tsx",
          children: [
            { type: "index", file: "index.tsx" },
            { type: "route", path: "/play/$runId", file: "play.tsx" },
            { type: "route", path: "/$", file: "not_found.tsx" },
          ],
        },
      },
    }),
    react(),
    tailwind(),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  lint: {
    ignorePatterns: [".agents/skills/**", "src/route_tree.gen.ts"],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: { ignorePatterns: ["docs/**", "assets/**", ".agents/skills/**", "src/route_tree.gen.ts"] },
  test: { include: ["tests/**/*.test.ts"] },
});
