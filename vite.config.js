import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    minify: "terser",
    rollupOptions: { input: { bakery: "index.html", rush: "rush.html" } },
  },
});
