import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/zenn": {
        target: "https://zenn.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/zenn/, "/api"),
      },
    },
  },
});
