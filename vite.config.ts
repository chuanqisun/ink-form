import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        pipeline: resolve(__dirname, "107-pipeline.html"),
      },
    },
  },
  base: "/ink-form/",
});
